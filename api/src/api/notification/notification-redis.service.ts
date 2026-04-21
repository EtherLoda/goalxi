import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

// Notification data type - flexible object for notification payloads
export type NotificationData = Record<string, any>;

export enum NotificationType {
  // Match notifications
  MATCH_RESULT_WIN = 'MATCH_RESULT_WIN',
  MATCH_RESULT_LOSS = 'MATCH_RESULT_LOSS',
  MATCH_RESULT_DRAW = 'MATCH_RESULT_DRAW',

  // Player notifications
  PLAYER_SKILL_IMPROVED = 'PLAYER_SKILL_IMPROVED',
  PLAYER_SKILL_DECREASED = 'PLAYER_SKILL_DECREASED',
  PLAYER_INJURED = 'PLAYER_INJURED',
  PLAYER_RECOVERED = 'PLAYER_RECOVERED',

  // Transfer notifications
  PLAYER_PURCHASED = 'PLAYER_PURCHASED',
  PLAYER_SOLD = 'PLAYER_SOLD',
  AUCTION_OUTBID = 'AUCTION_OUTBID',
  AUCTION_WON = 'AUCTION_WON',
  AUCTION_LOST = 'AUCTION_LOST',

  // League notifications
  LEAGUE_POSITION_CHANGED = 'LEAGUE_POSITION_CHANGED',
  SEASON_STARTED = 'SEASON_STARTED',
  SEASON_ENDED = 'SEASON_ENDED',

  // System notifications
  TEAM_INVITATION = 'TEAM_INVITATION',
  SYSTEM_MESSAGE = 'SYSTEM_MESSAGE',
}

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  messageKey: string;
  data: NotificationData;
  expiresAt?: Date;
  timestamp?: number;
}

export interface Notification {
  id: string;
  type: NotificationType;
  messageKey: string;
  data: NotificationData;
  createdAt: number;
  expiresAt?: number;
}

const INBOX_KEY_PREFIX = 'notifications:inbox:';
const META_KEY_PREFIX = 'notifications:meta:';
const GLOBAL_STREAM_KEY = 'notifications:global';
const GLOBAL_PENDING_KEY = 'notifications:global:pending';

// 默认保留最新 100 条通知
const MAX_INBOX_SIZE = 100;

@Injectable()
export class NotificationRedisService implements OnModuleDestroy {
  constructor(
    @Inject('REDIS_AUCTION_CLIENT') private readonly redis: any,
    private readonly config: ConfigService,
  ) {}

  private getInboxKey(userId: string): string {
    return `${INBOX_KEY_PREFIX}${userId}`;
  }

  private getMetaKey(userId: string): string {
    return `${META_KEY_PREFIX}${userId}`;
  }

  /**
   * 创建个人通知
   */
  async create(params: CreateNotificationParams): Promise<Notification> {
    const { userId, type, messageKey, data, expiresAt, timestamp } = params;
    const id = uuidv4();
    const createdAt = timestamp || Date.now();

    const notification: Notification = {
      id,
      type,
      messageKey,
      data,
      createdAt,
      expiresAt: expiresAt?.getTime(),
    };

    const inboxKey = this.getInboxKey(userId);
    const json = JSON.stringify(notification);

    // ZADD score 为时间戳（毫秒）
    await this.redis.zadd(inboxKey, createdAt, json);

    // 限制收件箱大小，只保留最新 MAX_INBOX_SIZE 条
    const count = await this.redis.zcard(inboxKey);
    if (count > MAX_INBOX_SIZE) {
      // 删除最旧的（score 最小的），保留最新的
      await this.redis.zremrangebyrank(inboxKey, 0, count - MAX_INBOX_SIZE - 1);
    }

    return notification;
  }

  /**
   * 创建全局广播（Stream）
   */
  async createGlobalBroadcast(
    type: NotificationType,
    messageKey: string,
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

    // 写入 Stream
    await this.redis.xadd(
      GLOBAL_STREAM_KEY,
      '*',
      'id',
      id,
      'type',
      type,
      'messageKey',
      messageKey,
      'data',
      JSON.stringify(data),
      'createdAt',
      createdAt.toString(),
    );

    // 同时写入 pending ZSET（用于离线用户拉取）
    await this.redis.zadd(
      GLOBAL_PENDING_KEY,
      createdAt,
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

    // 获取总数
    const total = await this.redis.zcard(inboxKey);

    // ZREVRANGE 获取最新消息（score 降序）
    const start = (page - 1) * limit;
    const stop = start + limit - 1;
    const rawItems = await this.redis.zrevrange(inboxKey, start, stop);

    const items = rawItems.map((item) => JSON.parse(item) as Notification);

    // 未读数 = 总数（因为已读即删）
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
    const inboxKey = this.getInboxKey(userId);

    if (!notificationIds || notificationIds.length === 0) {
      return 0;
    }

    // 获取所有通知，找出匹配的
    const allNotifications = await this.redis.zrange(inboxKey, 0, -1);
    const toDelete: string[] = [];

    for (const item of allNotifications) {
      const notification = JSON.parse(item) as Notification;
      if (notificationIds.includes(notification.id)) {
        toDelete.push(item);
      }
    }

    if (toDelete.length === 0) {
      return 0;
    }

    // ZREM 删除
    const deleted = await this.redis.zrem(inboxKey, ...toDelete);
    return deleted;
  }

  /**
   * 全部标为已读（清空收件箱）
   */
  async markAllAsRead(userId: string): Promise<number> {
    const inboxKey = this.getInboxKey(userId);
    const count = await this.redis.zcard(inboxKey);
    await this.redis.del(inboxKey);
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
   * @param userId 用户ID
   * @param since 时间戳（毫秒），返回此时间之后的全局通知
   */
  async getGlobalNotificationsSince(
    userId: string,
    since: number,
  ): Promise<Notification[]> {
    // 从 pending ZSET 中获取指定时间之后的消息
    const rawItems = await this.redis.zrangebyscore(
      GLOBAL_PENDING_KEY,
      since,
      '+inf',
    );

    return rawItems.map((item) => JSON.parse(item) as Notification);
  }

  /**
   * 清理过期的 pending 通知
   * 定时任务调用，删除指定时间之前的全局通知
   */
  async cleanupExpiredGlobalNotifications(
    beforeTimestamp: number,
  ): Promise<number> {
    const removed = await this.redis.zremrangebyscore(
      GLOBAL_PENDING_KEY,
      '-inf',
      beforeTimestamp,
    );
    return removed;
  }

  /**
   * 获取全局 Stream 的最新消息（用于在线用户）
   * @param lastId 上次读取的 Stream ID，'0' 表示从头开始
   */
  async readGlobalStream(
    lastId: string = '0',
  ): Promise<{ id: string; notification: Notification }[]> {
    // 读取新消息（阻塞等待最多1秒）
    const result = await this.redis.xread(
      'COUNT',
      100,
      'STREAMS',
      GLOBAL_STREAM_KEY,
      lastId,
    );

    if (!result || !result[GLOBAL_STREAM_KEY]) {
      return [];
    }

    return result[GLOBAL_STREAM_KEY].map(([id, fields]) => {
      const notification: Notification = {
        id: fields.id,
        type: fields.type as NotificationType,
        messageKey: fields.messageKey,
        data: JSON.parse(fields.data),
        createdAt: parseInt(fields.createdAt, 10),
      };
      return { id, notification };
    });
  }

  onModuleDestroy() {
    // Redis 连接由 NestJS 管理，无需手动关闭
  }
}
