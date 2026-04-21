import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export enum NotificationType {
  MATCH_RESULT_WIN = 'MATCH_RESULT_WIN',
  MATCH_RESULT_LOSS = 'MATCH_RESULT_LOSS',
  MATCH_RESULT_DRAW = 'MATCH_RESULT_DRAW',
  PLAYER_SKILL_IMPROVED = 'PLAYER_SKILL_IMPROVED',
  PLAYER_SKILL_DECREASED = 'PLAYER_SKILL_DECREASED',
  PLAYER_INJURED = 'PLAYER_INJURED',
  PLAYER_RECOVERED = 'PLAYER_RECOVERED',
  PLAYER_PURCHASED = 'PLAYER_PURCHASED',
  PLAYER_SOLD = 'PLAYER_SOLD',
  AUCTION_OUTBID = 'AUCTION_OUTBID',
  AUCTION_WON = 'AUCTION_WON',
  AUCTION_LOST = 'AUCTION_LOST',
  LEAGUE_POSITION_CHANGED = 'LEAGUE_POSITION_CHANGED',
  SEASON_STARTED = 'SEASON_STARTED',
  SEASON_ENDED = 'SEASON_ENDED',
  TEAM_INVITATION = 'TEAM_INVITATION',
  SYSTEM_MESSAGE = 'SYSTEM_MESSAGE',
}

export interface NotificationData {
  [key: string]: any;
  matchId?: string;
  playerId?: string;
  playerName?: string;
  skillType?: string;
  homeTeamName?: string;
  awayTeamName?: string;
  homeScore?: number;
  awayScore?: number;
  amount?: number;
  auctionId?: string;
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
const MAX_INBOX_SIZE = 100;

@Injectable()
export class NotificationService {
  private readonly redis: Redis;

  constructor(private readonly config: ConfigService) {
    this.redis = new Redis({
      host: this.config.getOrThrow<string>('REDIS_HOST'),
      port: this.config.getOrThrow<number>('REDIS_PORT'),
      password: this.config.getOrThrow<string>('REDIS_PASSWORD'),
      tls: this.config.get('REDIS_TLS_ENABLED') === 'true' ? {} : undefined,
    });
  }

  private getInboxKey(userId: string): string {
    return `${INBOX_KEY_PREFIX}${userId}`;
  }

  async create(
    userId: string,
    type: NotificationType,
    messageKey: string,
    data: NotificationData = {},
  ): Promise<Notification> {
    return this.createWithTime(userId, type, messageKey, data, Date.now());
  }

  async createWithTime(
    userId: string,
    type: NotificationType,
    messageKey: string,
    data: NotificationData = {},
    timestamp: number,
  ): Promise<Notification> {
    const id = require('uuid').v4();

    const notification: Notification = {
      id,
      type,
      messageKey,
      data,
      createdAt: timestamp,
    };

    const inboxKey = this.getInboxKey(userId);
    const json = JSON.stringify(notification);

    // Use provided timestamp as ZSET score for correct ordering
    await this.redis.zadd(inboxKey, timestamp, json);

    const count = await this.redis.zcard(inboxKey);
    if (count > MAX_INBOX_SIZE) {
      await this.redis.zremrangebyrank(inboxKey, 0, count - MAX_INBOX_SIZE - 1);
    }

    return notification;
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }
}
