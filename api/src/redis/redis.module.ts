import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuctionRedisRepository } from './auction-redis.repository';

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_AUCTION_CLIENT',
      useFactory: (configService: ConfigService) => {
        // Using dynamic import for ioredis
        const Redis = require('ioredis');
        return new Redis({
          host: configService.getOrThrow('redis.host', { infer: true }),
          port: configService.getOrThrow('redis.port', { infer: true }),
          password: configService.getOrThrow('redis.password', { infer: true }),
          tls: configService.get('redis.tlsEnabled', { infer: true }),
          lazyConnect: true,
          retryStrategy: (times: number) => {
            if (times > 3) {
              return null; // Stop retrying
            }
            return Math.min(times * 200, 2000);
          },
        });
      },
      inject: [ConfigService],
    },
    AuctionRedisRepository,
  ],
  exports: ['REDIS_AUCTION_CLIENT', AuctionRedisRepository],
})
export class RedisModule {}
