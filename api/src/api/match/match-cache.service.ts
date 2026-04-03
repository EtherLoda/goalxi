import { MatchEventEntity } from '@goalxi/database';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cache } from 'cache-manager';

// Plain object interface for caching (no TypeORM metadata)
interface CachedMatchEvent {
  id: string;
  matchId: string;
  minute: number;
  second: number;
  type: number;
  typeName: string;
  teamId?: string;
  playerId?: string;
  relatedPlayerId?: string;
  data?: Record<string, any>;
  eventScheduledTime?: Date;
  isRevealed: boolean;
  createdAt: Date;
}

@Injectable()
export class MatchCacheService {
  private readonly logger = new Logger(MatchCacheService.name);
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  async getMatchEvents(matchId: string): Promise<MatchEventEntity[] | null> {
    try {
      const key = `match_events:${matchId}`;
      const cachedEvents = await this.cacheManager.get<CachedMatchEvent[]>(key);
      if (cachedEvents) {
        this.logger.debug(`Cache hit for match events ${matchId}`);
        // Convert plain objects back to entities (shallow conversion)
        return cachedEvents as any[];
      }
      return null;
    } catch (error) {
      this.logger.error(`Error reading match events cache: ${error.message}`);
      return null;
    }
  }

  async cacheMatchEvents(
    matchId: string,
    events: MatchEventEntity[],
  ): Promise<void> {
    try {
      const key = `match_events:${matchId}`;
      // Convert entities to plain objects for caching (removes TypeORM metadata)
      const plainEvents: CachedMatchEvent[] = events.map((e) => ({
        id: e.id,
        matchId: e.matchId,
        minute: e.minute,
        second: e.second,
        type: e.type,
        typeName: e.typeName,
        teamId: e.teamId,
        playerId: e.playerId,
        relatedPlayerId: e.relatedPlayerId,
        data: e.data,
        eventScheduledTime: e.eventScheduledTime,
        isRevealed: e.isRevealed,
        createdAt: e.createdAt,
      }));
      await this.cacheManager.set(key, plainEvents, this.CACHE_TTL);
      this.logger.debug(`Cached ${events.length} events for match ${matchId}`);
    } catch (error) {
      this.logger.error(
        `Error caching match events: ${error.message}`,
        error.stack,
      );
    }
  }

  async invalidateMatchCache(matchId: string): Promise<void> {
    try {
      const key = `match_events:${matchId}`;
      await this.cacheManager.del(key);
      this.logger.debug(`Invalidated cache for match ${matchId}`);
    } catch (error) {
      this.logger.error(`Error invalidating match cache: ${error.message}`);
    }
  }

  async isMatchProcessed(matchId: string): Promise<boolean> {
    try {
      const key = `match_stats_processed:${matchId}`;
      const processed = await this.cacheManager.get(key);
      return !!processed;
    } catch (error) {
      this.logger.error(
        `Error checking match processed status: ${error.message}`,
      );
      return false;
    }
  }

  async setMatchProcessed(matchId: string): Promise<void> {
    try {
      const key = `match_stats_processed:${matchId}`;
      await this.cacheManager.set(key, true, this.CACHE_TTL);
    } catch (error) {
      this.logger.error(
        `Error setting match processed status: ${error.message}`,
      );
    }
  }
}
