import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AuctionRedisRepository } from './auction-redis.repository';

export const REDIS_AUCTION_CLIENT = 'REDIS_AUCTION_CLIENT';

/**
 * ioredis client wrapper. Holds a single Redis instance used by the
 * auction + notification + game services and owns its lifecycle so
 * graceful shutdown can call `quit()`.
 *
 * Reconnect policy (P0-#4):
 *   - `retryStrategy` returns a positive number forever — never give
 *     up. The old code stopped after 3 attempts, which meant a single
 *     Redis blip permanently took down the auction + notification
 *     stack until someone restarted the API.
 *   - Exponential backoff with a 5s ceiling keeps tight loops from
 *     hammering a downed node while still recovering fast when the
 *     blip is brief.
 *   - `reconnectOnError` only reconnects on READONLY (cluster
 *     failover) — silently swallowing everything else masks
 *     application bugs.
 */
@Injectable()
export class RedisAuctionClient implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisAuctionClient.name);

  constructor(
    // Postfix-#5: dropped the dead `ConfigService` dep — the raw
    // client factory has already consumed the config. The wrapper
    // just owns lifecycle + event logging.
    @Inject('REDIS_AUCTION_CLIENT_RAW') public readonly client: Redis,
  ) {
    this.client.on('error', (err) => {
      this.logger.error(
        `Redis client error: ${err.message}`,
        err instanceof Error ? err.stack : undefined,
      );
    });
    this.client.on('reconnecting', (delayMs: number) => {
      this.logger.warn(`Redis reconnecting in ${delayMs}ms`);
    });
    this.client.on('end', () => {
      this.logger.warn('Redis connection ended');
    });
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(`Closing Redis client (signal=${signal ?? 'n/a'})`);
    try {
      await this.client.quit();
    } catch (err) {
      this.logger.error(
        `Redis quit failed: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }
}

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_AUCTION_CLIENT_RAW',
      useFactory: (configService: ConfigService): Redis => {
        return new Redis({
          host: configService.getOrThrow('redis.host', { infer: true }),
          port: configService.getOrThrow('redis.port', { infer: true }),
          password: configService.getOrThrow('redis.password', { infer: true }),
          // P2-#30: align with the other redis.* fields — getOrThrow.
          // P2-#31: also forward the DB number so dev/staging/prod
          // can share a Redis instance without colliding on keys.
          tls: configService.getOrThrow('redis.tlsEnabled', { infer: true }),
          db: configService.getOrThrow('redis.db', { infer: true }),
          // 保留 lazyConnect 行为，依赖 service 第一次命令触发 connect；
          // 如果你之后在启动时需要主动校验连通性，去掉这行并在 main.ts
          // 调一次 client.ping()。
          lazyConnect: true,
          // 无限重试 + 指数退避封顶 5s。给一个永远返回正数的函数即可。
          retryStrategy: (times: number) => {
            return Math.min(50 * Math.pow(2, times - 1), 5000);
          },
          // 只在 READONLY（failover 后）时重连，其它错误不掩盖。
          reconnectOnError: (err: Error) => {
            const msg = err.message;
            if (msg.includes('READONLY')) return 2;
            return false;
          },
          // 单次命令最大重试次数（与重连策略独立，是 command-level retry）
          maxRetriesPerRequest: 3,
        });
      },
      inject: [ConfigService],
    },
    {
      // 兼容既有注入：`@Inject('REDIS_AUCTION_CLIENT')` 直接拿到 client
      provide: REDIS_AUCTION_CLIENT,
      useFactory: (wrapper: RedisAuctionClient) => wrapper.client,
      inject: [RedisAuctionClient],
    },
    RedisAuctionClient,
    AuctionRedisRepository,
  ],
  exports: [REDIS_AUCTION_CLIENT, AuctionRedisRepository, RedisAuctionClient],
})
export class RedisModule {}
