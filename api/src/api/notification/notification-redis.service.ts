import { Inject, Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { NotificationMessageKey } from './notification-message-key';

// Notification data type - flexible object for notification payloads
export type NotificationData = Record<string, any>;

/**
 * Catalogue of all supported notification types.
 *
 * Implemented = there is at least one producer that calls
 * `notificationRedis.create()` with this value (grep for
 * `NotificationType\.` in `api/src/api` to find them).
 *
 * Reserved = enum value exists for forward-compatibility, but no
 * producer wires it up yet. The web i18n bundle may or may not
 * have a matching `notification.*` key. A reserved type is
 * perfectly fine to send over the wire — the renderer will fall
 * back to the raw key if a translation is missing — but the
 * receiving player will be confused.
 *
 * Reorganising this list is a non-breaking change (it only adds
 * new string values, never renames or removes).
 */
export enum NotificationType {
  // ---- Implemented ----
  // Transfer: emitted by `AuctionService.placeBid` when a
  // previous bidder gets out-bid.
  AUCTION_OUTBID = 'AUCTION_OUTBID',

  // ---- Reserved (no producer yet) ----
  // Match
  MATCH_RESULT_WIN = 'MATCH_RESULT_WIN',
  MATCH_RESULT_LOSS = 'MATCH_RESULT_LOSS',
  MATCH_RESULT_DRAW = 'MATCH_RESULT_DRAW',

  // Player
  PLAYER_SKILL_IMPROVED = 'PLAYER_SKILL_IMPROVED',
  PLAYER_SKILL_DECREASED = 'PLAYER_SKILL_DECREASED',
  PLAYER_INJURED = 'PLAYER_INJURED',
  PLAYER_RECOVERED = 'PLAYER_RECOVERED',

  // Transfer (additional)
  PLAYER_PURCHASED = 'PLAYER_PURCHASED',
  PLAYER_SOLD = 'PLAYER_SOLD',
  AUCTION_WON = 'AUCTION_WON',
  AUCTION_LOST = 'AUCTION_LOST',

  // League
  LEAGUE_POSITION_CHANGED = 'LEAGUE_POSITION_CHANGED',
  SEASON_STARTED = 'SEASON_STARTED',
  SEASON_ENDED = 'SEASON_ENDED',

  // System
  TEAM_INVITATION = 'TEAM_INVITATION',
  SYSTEM_MESSAGE = 'SYSTEM_MESSAGE',

  // Stadium
  STADIUM_CONSTRUCTION_COMPLETED = 'STADIUM_CONSTRUCTION_COMPLETED',
}

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  // P2-#22: typed message key. The literal union gives autocomplete
  // on producer side; `(string & {})` in the union keeps admins free
  // to pass novel keys via the global-broadcast endpoint.
  messageKey: NotificationMessageKey;
  data: NotificationData;
  timestamp?: number;
}

export interface Notification {
  id: string;
  type: NotificationType;
  messageKey: NotificationMessageKey;
  data: NotificationData;
  createdAt: number;
}

const INBOX_KEY_PREFIX = 'notifications:inbox:';
const GLOBAL_PENDING_KEY = 'notifications:global:pending';
const GLOBAL_CURSOR_KEY_PREFIX = 'notifications:global:cursor:';
const GLOBAL_CURSOR_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

// 默认保留最新 100 条通知
const MAX_INBOX_SIZE = 100;

// Lua: 原子地把通知写入 ZSET+HASH，并按容量裁剪最旧的（连带 meta 一起删）。
// KEYS[1] = inbox ZSET key
// KEYS[2] = inbox meta HASH key
// ARGV[1] = notification id
// ARGV[2] = createdAt score (ms)
// ARGV[3] = json payload
// ARGV[4] = MAX_INBOX_SIZE
// Returns: 1 always (caller doesn't need the return)
const SCRIPT_INBOX_PUT = `
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[1])
redis.call('HSET', KEYS[2], ARGV[1], ARGV[3])
local count = tonumber(redis.call('ZCARD', KEYS[1]))
local max = tonumber(ARGV[4])
if count > max then
  local toRemove = redis.call('ZRANGE', KEYS[1], 0, count - max - 1)
  for i = 1, #toRemove do
    redis.call('ZREM', KEYS[1], toRemove[i])
    redis.call('HDEL', KEYS[2], toRemove[i])
  end
end
return 1
`;

// Lua: 按 id 列表从 ZSET+HASH 原子删除，并返回实际删除的条数。
// KEYS[1] = inbox ZSET key
// KEYS[2] = inbox meta HASH key
// ARGV[1..N] = notification ids
const SCRIPT_INBOX_DELETE = `
local removed = 0
for i = 1, #ARGV do
  if redis.call('ZREM', KEYS[1], ARGV[i]) == 1 then
    redis.call('HDEL', KEYS[2], ARGV[i])
    removed = removed + 1
  end
end
return removed
`;

// Lua: 把全局广播写入 pending ZSET + meta HASH。
// KEYS[1] = pending ZSET key
// KEYS[2] = pending meta HASH key
// ARGV[1] = id, ARGV[2] = score, ARGV[3] = json
const SCRIPT_GLOBAL_PUT = `
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[1])
redis.call('HSET', KEYS[2], ARGV[1], ARGV[3])
return 1
`;

@Injectable()
export class NotificationRedisService {
  constructor(@Inject('REDIS_AUCTION_CLIENT') private readonly redis: any) {}

  private getInboxKey(userId: string): string {
    return `${INBOX_KEY_PREFIX}${userId}`;
  }

  private getInboxMetaKey(userId: string): string {
    return `${INBOX_KEY_PREFIX}${userId}:meta`;
  }

  private getGlobalCursorKey(userId: string): string {
    return `${GLOBAL_CURSOR_KEY_PREFIX}${userId}`;
  }

  /**
   * 创建个人通知
   */
  async create(params: CreateNotificationParams): Promise<Notification> {
    const { userId, type, messageKey, data, timestamp } = params;
    const id = uuidv4();
    const createdAt = timestamp || Date.now();

    const notification: Notification = {
      id,
      type,
      messageKey,
      data,
      createdAt,
    };

    // 走 Lua 脚本：ZSET + HASH 双写 + 容量裁剪 原子完成。
    // 解决了 review 里的非原子三步问题（ZADD + ZCARD + ZREMRANGEBYRANK
    // 在并发下会越界或裁错条目），同时把"成员"从整段 JSON 改成纯
    // id，让 markAsRead 不再需要 ZRANGE(0,-1) + JSON.parse 找 ID。
    await this.redis.eval(
      SCRIPT_INBOX_PUT,
      2,
      this.getInboxKey(userId),
      this.getInboxMetaKey(userId),
      id,
      createdAt.toString(),
      JSON.stringify(notification),
      MAX_INBOX_SIZE.toString(),
    );

    return notification;
  }

  /**
   * 创建全局广播
   *
   * 之前同时写 Stream + pending ZSET，但 Stream 的 consumer (readGlobalStream)
   * 实现是 broken 的（fields 当对象取，类型对不上）且全项目零调用方。
   * 简化成只写 pending ZSET + meta HASH，配合 getGlobalNotificationsSince
   * 的 per-user cursor 一起用。
   */
  async createGlobalBroadcast(
    type: NotificationType,
    messageKey: NotificationMessageKey,
    data: NotificationData,
  ): Promise<string> {
    const id = uuidv4();
    const createdAt = Date.now();

    const notification: Notification = {
      id,
      type,
      messageKey,
      data,
      createdAt,
    };

    await this.redis.eval(
      SCRIPT_GLOBAL_PUT,
      2,
      GLOBAL_PENDING_KEY,
      `${GLOBAL_PENDING_KEY}:meta`,
      id,
      createdAt.toString(),
      JSON.stringify(notification),
    );

    return id;
  }

  /**
   * 获取用户通知列表（分页）
   * @param userId 用户ID
   * @param page 页码（从1开始）
   * @param limit 每页数量
   */
  async getInbox(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ items: Notification[]; total: number; unreadCount: number }> {
    const inboxKey = this.getInboxKey(userId);
    const metaKey = this.getInboxMetaKey(userId);

    // pipeline 一次拿两个值，比之前两次 RTT 快
    const pipeline = this.redis.pipeline();
    pipeline.zcard(inboxKey);
    pipeline.zrevrange(inboxKey, (page - 1) * limit, page * limit - 1);
    const [[, total], [, idList]] = (await pipeline.exec()) as [
      [Error | null, number],
      [Error | null, string[]],
    ];

    if (!idList || idList.length === 0) {
      return { items: [], total, unreadCount: total };
    }

    // 一次性 HGET 全部详情，避开之前 zrange(0,-1) + JSON.parse 比 ID 的 O(N) 浪费
    const metaValues = (await this.redis.hmget(
      metaKey,
      ...idList,
    )) as (string | null)[];

    const items: Notification[] = [];
    for (const raw of metaValues) {
      if (!raw) continue; // meta 缺失（极端 race）就跳过
      try {
        items.push(JSON.parse(raw) as Notification);
      } catch {
        // 损坏的 json 忽略；不应阻塞整页
      }
    }

    // 未读数 = 总数（已读即删的设计未变，所以 inbox 总数就是未读）
    const unreadCount = total;
    return { items, total, unreadCount };
  }

  /**
   * 获取未读通知数
   */
  async getUnreadCount(userId: string): Promise<number> {
    const inboxKey = this.getInboxKey(userId);
    return this.redis.zcard(inboxKey);
  }

  /**
   * 标记通知为已读（删除）
   * @param userId 用户ID
   * @param notificationIds 要删除的通知ID列表
   */
  async markAsRead(
    userId: string,
    notificationIds?: string[],
  ): Promise<number> {
    if (!notificationIds || notificationIds.length === 0) {
      return 0;
    }

    // 现在 member 就是 id，删的时候不需要先扫整表反序列化
    const removed = (await this.redis.eval(
      SCRIPT_INBOX_DELETE,
      2,
      this.getInboxKey(userId),
      this.getInboxMetaKey(userId),
      ...notificationIds,
    )) as number;
    return removed;
  }

  /**
   * 全部标为已读（清空收件箱）
   */
  async markAllAsRead(userId: string): Promise<number> {
    const inboxKey = this.getInboxKey(userId);
    const metaKey = this.getInboxMetaKey(userId);
    const count = await this.redis.zcard(inboxKey);
    // 同时清 meta，避免 ZSET 清掉后 HASH 留垃圾占用内存
    await this.redis.del(inboxKey, metaKey);
    return count;
  }

  /**
   * 删除已读通知（全部已读，直接清空）
   */
  async deleteRead(userId: string): Promise<number> {
    return this.markAllAsRead(userId);
  }

  /**
   * 获取用户自指定时间后的新全局通知
   *
   * 支持两种调用模式：
   *  1. 客户端轮询（不传 `since`）：用 server 端 per-user cursor，读取后
   *     更新 cursor。这样客户端不用记 lastId / since，重复拉不会拿到
   *     同样的广播。
   *  2. 显式回放（传 `since`）：跳过 cursor，按客户端给定的时间戳过滤。
   *     不会更新 cursor —— 因为这是显式重放，不应推进服务端状态。
   *
   * 注意：相同的 createdAt（毫秒）理论上会撞，但 createGlobalBroadcast
   * 由管理员触发，1ms 内连发两条的概率可忽略；如果撞了，客户端会拿到
   * 重复条目（id 不同），目前不做去重。
   *
   * @param userId 用户ID
   * @param since 时间戳（毫秒）。不传则用 server cursor（首调用默认 0）。
   */
  async getGlobalNotificationsSince(
    userId: string,
    since: number,
  ): Promise<Notification[]> {
    const cursorKey = this.getGlobalCursorKey(userId);
    const explicitSince = since > 0;
    const metaKey = `${GLOBAL_PENDING_KEY}:meta`;

    let effectiveSince: number;
    if (explicitSince) {
      effectiveSince = since;
    } else {
      const stored = (await this.redis.get(cursorKey)) as string | null;
      effectiveSince = stored ? parseInt(stored, 10) : 0;
    }

    // ZRANGEBYSCORE 拿候选 id，再 HMGET 拿 meta；只取前 200 条防止
    // 一次性塞回太多
    const idList = (await this.redis.zrangebyscore(
      GLOBAL_PENDING_KEY,
      effectiveSince,
      '+inf',
      'LIMIT',
      0,
      200,
    )) as string[];

    if (!idList || idList.length === 0) {
      return [];
    }

    const metaValues = (await this.redis.hmget(metaKey, ...idList)) as (
      | string
      | null
    )[];

    const items: Notification[] = [];
    let maxScore = effectiveSince;
    for (const raw of metaValues) {
      if (!raw) continue;
      try {
        const n = JSON.parse(raw) as Notification;
        if (n.createdAt > maxScore) maxScore = n.createdAt;
        items.push(n);
      } catch {
        // ignore corrupted entry
      }
    }

    // 仅在"非显式回放"路径上推进 cursor，避免覆盖客户端的显式 since
    if (!explicitSince && items.length > 0) {
      await this.redis.set(
        cursorKey,
        maxScore.toString(),
        'EX',
        GLOBAL_CURSOR_TTL_SECONDS,
      );
    }

    return items;
  }

  /**
   * 清理过期的 pending 通知
   * 定时任务调用，删除指定时间之前的全局通知。
   *
   * NOTE: 当前没有 cron 触发它，调用方需自行接入 scheduler（P2 跟进）。
   */
  async cleanupExpiredGlobalNotifications(
    beforeTimestamp: number,
  ): Promise<number> {
    // 同步删 meta，否则 HASH 永远只增不减
    const idList = (await this.redis.zrangebyscore(
      GLOBAL_PENDING_KEY,
      '-inf',
      beforeTimestamp,
    )) as string[];
    if (idList.length > 0) {
      await this.redis.hdel(`${GLOBAL_PENDING_KEY}:meta`, ...idList);
    }
    const removed = await this.redis.zremrangebyscore(
      GLOBAL_PENDING_KEY,
      '-inf',
      beforeTimestamp,
    );
    return removed;
  }
}
