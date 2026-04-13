import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

export interface BidRecord {
  teamId: string;
  amount: number;
  timestamp: string;
}

export interface AuctionRedisState {
  currentBid: number;
  currentBidder: string | null;
  lockAmount: number;
  bidHistory: BidRecord[];
  expiresAt: string;
}

const AUCTION_BUFFER_HOURS = 24;

@Injectable()
export class AuctionRedisRepository implements OnModuleDestroy {
  private readonly logger = new Logger(AuctionRedisRepository.name);

  constructor(@Inject('REDIS_AUCTION_CLIENT') private readonly redis: any) {}

  private buildKey(auctionId: string, suffix: string): string {
    return `auction:${auctionId}:${suffix}`;
  }

  private calculateTTL(expiresAt: Date): number {
    const now = Date.now();
    const expiresAtMs = expiresAt.getTime();
    const bufferMs = AUCTION_BUFFER_HOURS * 60 * 60 * 1000;
    const ttlSeconds = Math.max(0, (expiresAtMs - now) / 1000) + bufferMs;
    return Math.ceil(ttlSeconds);
  }

  /**
   * Initialize Redis state for a new auction
   */
  async initializeAuction(auctionId: string, expiresAt: Date): Promise<void> {
    const ttl = this.calculateTTL(expiresAt);
    const pipeline = this.redis.pipeline();

    pipeline.setex(this.buildKey(auctionId, 'currentBid'), ttl, '0');
    pipeline.setex(this.buildKey(auctionId, 'bidder'), ttl, '');
    pipeline.setex(this.buildKey(auctionId, 'lockAmount'), ttl, '0');
    pipeline.setex(
      this.buildKey(auctionId, 'expiresAt'),
      ttl,
      expiresAt.toISOString(),
    );
    pipeline.del(this.buildKey(auctionId, 'bids'));

    await pipeline.exec();
    this.logger.debug(`Initialized Redis state for auction ${auctionId}`);
  }

  /**
   * Place a bid - atomically update all bid state in Redis
   * Returns the previous bidder info for releasing their lock
   */
  async placeBid(
    auctionId: string,
    teamId: string,
    amount: number,
    expiresAt: Date,
  ): Promise<{ previousBidder: string | null; previousLockAmount: number }> {
    const ttl = this.calculateTTL(expiresAt);

    // Get previous bidder info before updating
    const previousBidder = await this.redis.get(
      this.buildKey(auctionId, 'bidder'),
    );
    const previousLockAmountStr = await this.redis.get(
      this.buildKey(auctionId, 'lockAmount'),
    );
    const previousLockAmount = previousLockAmountStr
      ? parseInt(previousLockAmountStr, 10)
      : 0;

    // Use MULTI for atomic operations
    const multi = this.redis.multi();

    // Update current state
    multi.setex(this.buildKey(auctionId, 'currentBid'), ttl, amount.toString());
    multi.setex(this.buildKey(auctionId, 'bidder'), ttl, teamId);
    multi.setex(this.buildKey(auctionId, 'lockAmount'), ttl, amount.toString());

    // Push bid to history list
    const bidRecord: BidRecord = {
      teamId,
      amount,
      timestamp: new Date().toISOString(),
    };
    multi.rpush(this.buildKey(auctionId, 'bids'), JSON.stringify(bidRecord));
    multi.expire(this.buildKey(auctionId, 'bids'), ttl);

    await multi.exec();

    return {
      previousBidder: previousBidder || null,
      previousLockAmount,
    };
  }

  /**
   * Get the full state of an auction from Redis
   */
  async getAuctionState(auctionId: string): Promise<AuctionRedisState | null> {
    const [currentBidStr, bidder, lockAmountStr, expiresAt, bidsJson] =
      await Promise.all([
        this.redis.get(this.buildKey(auctionId, 'currentBid')),
        this.redis.get(this.buildKey(auctionId, 'bidder')),
        this.redis.get(this.buildKey(auctionId, 'lockAmount')),
        this.redis.get(this.buildKey(auctionId, 'expiresAt')),
        this.redis.lrange(this.buildKey(auctionId, 'bids'), 0, -1),
      ]);

    if (!currentBidStr && !bidder && !lockAmountStr) {
      return null; // Auction not in Redis
    }

    const bidHistory: BidRecord[] = bidsJson.map((json) => JSON.parse(json));

    return {
      currentBid: parseInt(currentBidStr || '0', 10),
      currentBidder: bidder || null,
      lockAmount: parseInt(lockAmountStr || '0', 10),
      bidHistory,
      expiresAt: expiresAt || '',
    };
  }

  /**
   * Get bid history for an auction
   */
  async getBidHistory(auctionId: string): Promise<BidRecord[]> {
    const bidsJson = await this.redis.lrange(
      this.buildKey(auctionId, 'bids'),
      0,
      -1,
    );
    return bidsJson.map((json) => JSON.parse(json));
  }

  /**
   * Get current bid info (currentPrice and currentBidderId)
   */
  async getCurrentBid(
    auctionId: string,
  ): Promise<{ currentBid: number; currentBidder: string | null }> {
    const [currentBidStr, bidder] = await Promise.all([
      this.redis.get(this.buildKey(auctionId, 'currentBid')),
      this.redis.get(this.buildKey(auctionId, 'bidder')),
    ]);

    return {
      currentBid: parseInt(currentBidStr || '0', 10),
      currentBidder: bidder || null,
    };
  }

  /**
   * Update auction expiresAt (for time extensions)
   */
  async updateExpiresAt(auctionId: string, expiresAt: Date): Promise<void> {
    const ttl = this.calculateTTL(expiresAt);
    await this.redis.setex(
      this.buildKey(auctionId, 'expiresAt'),
      ttl,
      expiresAt.toISOString(),
    );
  }

  /**
   * Check if auction exists in Redis
   */
  async exists(auctionId: string): Promise<boolean> {
    const exists = await this.redis.exists(
      this.buildKey(auctionId, 'currentBid'),
    );
    return exists === 1;
  }

  /**
   * Track that a team has bid on an auction (for findMyBids queries)
   */
  async addTeamBid(
    auctionId: string,
    teamId: string,
    expiresAt: Date,
  ): Promise<void> {
    const ttl = this.calculateTTL(expiresAt);
    const key = `team:${teamId}:bids`;
    await this.redis.sadd(key, auctionId);
    await this.redis.expire(key, ttl);
  }

  /**
   * Get all auction IDs that a team has bid on
   */
  async getTeamBidAuctions(teamId: string): Promise<string[]> {
    const key = `team:${teamId}:bids`;
    return this.redis.smembers(key);
  }

  /**
   * Remove auction from team's bid set (cleanup)
   */
  async removeTeamBid(auctionId: string, teamId: string): Promise<void> {
    const key = `team:${teamId}:bids`;
    await this.redis.srem(key, auctionId);
  }

  /**
   * Cleanup all Redis data for an auction (after settlement)
   */
  async cleanupAuction(auctionId: string): Promise<void> {
    const keys = [
      this.buildKey(auctionId, 'bids'),
      this.buildKey(auctionId, 'currentBid'),
      this.buildKey(auctionId, 'bidder'),
      this.buildKey(auctionId, 'lockAmount'),
      this.buildKey(auctionId, 'expiresAt'),
    ];
    await this.redis.del(...keys);
    this.logger.debug(`Cleaned up Redis data for auction ${auctionId}`);
  }

  /**
   * Acquire a distributed lock for auction settlement
   */
  async acquireSettlementLock(
    auctionId: string,
    ttlSeconds: number = 300,
  ): Promise<boolean> {
    const lockKey = `auction:${auctionId}:settlement:lock`;
    const result = await this.redis.set(lockKey, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  /**
   * Release settlement lock
   */
  async releaseSettlementLock(auctionId: string): Promise<void> {
    const lockKey = `auction:${auctionId}:settlement:lock`;
    await this.redis.del(lockKey);
  }

  async onModuleDestroy() {
    try {
      await this.redis.quit();
    } catch (error) {
      this.logger.warn('Error closing Redis connection:', error);
    }
  }
}
