import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { MatchEventEntity, MatchStatus } from '@goalxi/database';

@Injectable()
export class MatchCacheService {
    private readonly logger = new Logger(MatchCacheService.name);
    private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

    constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) { }

    async getMatchEvents(matchId: string): Promise<MatchEventEntity[] | null> {
        try {
            const key = `match_events:${matchId}`;
            const events = await this.cacheManager.get<MatchEventEntity[]>(key);
            if (events) {
                this.logger.debug(`Cache hit for match events ${matchId}`);
                return events;
            }
            return null;
        } catch (error) {
            this.logger.error(`Error reading match events cache: ${error.message}`);
            return null;
        }
    }

    async cacheMatchEvents(matchId: string, events: MatchEventEntity[]): Promise<void> {
        try {
            const key = `match_events:${matchId}`;
            await this.cacheManager.set(key, events, this.CACHE_TTL);
            this.logger.debug(`Cached ${events.length} events for match ${matchId}`);
        } catch (error) {
            this.logger.error(`Error caching match events: ${error.message}`);
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
}
