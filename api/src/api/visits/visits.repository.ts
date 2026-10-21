import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { VisitSubjectType } from './visit-subject.type';

/**
 * Visitors are ephemeral by design (plan D6): a sorted set per subject,
 * three-day window, no table and no cleanup job.
 *
 * The member is the visitor's user id, so a person who comes back ten
 * times is still one row; the score is the timestamp of the last visit,
 * so the ordering is "most recent first" for free.
 */

/** How long a visit stays visible. Matches the plan's D6 (3 days). */
export const VISIT_WINDOW_SECONDS = 3 * 24 * 60 * 60;

export interface RawVisit {
  userId: string;
  lastVisitAt: Date;
}

export interface RawVisits {
  todayCount: number;
  visitors: RawVisit[];
}

@Injectable()
export class VisitsRepository {
  private readonly logger = new Logger(VisitsRepository.name);

  constructor(@Inject('REDIS_AUCTION_CLIENT') private readonly redis: Redis) {}

  private buildKey(type: VisitSubjectType, id: string): string {
    return `goalxi:visit:${type}:${id}`;
  }

  /**
   * Record a visit, pruned to the window.
   *
   * The explicit `ZREMRANGEBYSCORE` matters: the key's TTL is refreshed by
   * *everyone's* visits, so a member that is never pruned would outlive
   * its three days for as long as anyone else keeps visiting.
   */
  async record(
    type: VisitSubjectType,
    id: string,
    visitorUserId: string,
  ): Promise<void> {
    const key = this.buildKey(type, id);
    const now = Math.floor(Date.now() / 1000);
    await this.redis.zremrangebyscore(key, '-inf', now - VISIT_WINDOW_SECONDS);
    await this.redis.zadd(key, now, visitorUserId);
    await this.redis.expire(key, VISIT_WINDOW_SECONDS);
  }

  async list(
    type: VisitSubjectType,
    id: string,
    limit: number,
  ): Promise<RawVisits> {
    const key = this.buildKey(type, id);
    const midnightUtc = Math.floor(
      Date.UTC(
        new Date().getUTCFullYear(),
        new Date().getUTCMonth(),
        new Date().getUTCDate(),
      ) / 1000,
    );

    const [rows, todayCount] = await Promise.all([
      this.redis.zrevrange(key, 0, limit - 1, 'WITHSCORES'),
      this.redis.zcount(key, midnightUtc, '+inf'),
    ]);

    // ioredis returns a flat [member, score, member, score, …] array.
    const visitors: RawVisit[] = [];
    for (let i = 0; i < rows.length; i += 2) {
      visitors.push({
        userId: rows[i],
        lastVisitAt: new Date(Number(rows[i + 1]) * 1000),
      });
    }

    return { todayCount, visitors };
  }
}
