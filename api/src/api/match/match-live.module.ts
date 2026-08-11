import { MatchEntity, MatchEventEntity } from '@goalxi/database';
import { Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import {
  DEFAULT_RATE_LIMIT_CONFIG,
  buildRateLimiter,
  type RateLimiter,
} from './match-live-rate-limit';
import { MatchLiveRedisAdapter } from './match-live-redis.adapter';
import { MatchLiveGateway } from './match-live.gateway';
import { MatchLiveScheduler } from './match-live.scheduler';
import { MatchModule } from './match.module';

export const MATCH_LIVE_RATE_LIMITER = 'MATCH_LIVE_RATE_LIMITER';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([MatchEntity, MatchEventEntity]),
    forwardRef(() => AuthModule),
    forwardRef(() => MatchModule),
  ],
  providers: [
    MatchLiveGateway,
    MatchLiveScheduler,
    MatchLiveRedisAdapter,
    {
      // Build the right `RateLimiter` (in-memory vs Redis) at module
      // wiring time. The gateway injects this token — gateway code is
      // backend-agnostic. `MatchLiveRedisAdapter.getRateLimitClient()`
      // returns `null` when the per-IP infra is disabled (CI / dev
      // without Redis), which `buildRateLimiter` translates into the
      // in-memory backend. This way the gateway spec can run without
      // a Redis container.
      provide: MATCH_LIVE_RATE_LIMITER,
      useFactory: (
        configService: ConfigService,
        redisAdapter: MatchLiveRedisAdapter,
      ): RateLimiter => {
        const redis = redisAdapter.getRateLimitClient();
        return buildRateLimiter(
          configService,
          redis ?? undefined,
          DEFAULT_RATE_LIMIT_CONFIG,
        );
      },
      inject: [ConfigService, MatchLiveRedisAdapter],
    },
  ],
  exports: [MatchLiveGateway, MatchLiveRedisAdapter],
})
export class MatchLiveModule {}
