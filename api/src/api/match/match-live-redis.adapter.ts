import type { AllConfigType } from '@/config/config.type';
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { Server } from 'socket.io';

/**
 * Owns the two ioredis clients (pub + sub) that the socket.io
 * redis-adapter needs and attaches itself to the gateway's `Server`
 * on `afterInit`. The pub/sub channels are how multiple Nest
 * instances share match rooms — without this, an event broadcast on
 * instance A only reaches sockets that happen to be on A, and any
 * client load-balanced to B will see a frozen feed.
 *
 * Why we own the clients here instead of reusing
 * `REDIS_AUCTION_CLIENT_RAW`:
 *
 *   - ioredis subscribes a connection to its pub/sub channel for the
 *     entire lifetime of that connection. Reusing the auction client
 *     would mean the auction's normal command channel goes into
 *     subscribed mode and every other `GET`/`SET` on it would fail
 *     with `Redis is loading` or just hang.
 *   - Matching the auction client's retry/tls config is easier when
 *     we read from the same `ConfigService` rather than sharing a
 *     reference to a client the auction already owns.
 *   - Lifecycle is a clean teardown: the @socket.io/redis-adapter
 *     `close()` returns once both clients are released, and we
 *     `quit()` the ioredis connections on `OnApplicationShutdown`.
 *
 * `INFRA_DISABLED` is the test escape hatch: when the env var is set
 * (e.g. in CI without a Redis container), `attachToServer` is a no-op
 * and the gateway falls back to the default in-memory adapter. The
 * rate-limit limiter has the same escape hatch — both stay
 * `in-memory` together so dev/CI doesn't need a live Redis to run
 * match-live tests.
 */
@Injectable()
export class MatchLiveRedisAdapter implements OnApplicationShutdown {
  private readonly logger = new Logger(MatchLiveRedisAdapter.name);
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;
  // Independent client used by the rate-limit Lua script. We keep it
  // separate from the pub/sub pair so a long-running `EVAL` (worst
  // case: Lua's full execution) can't block socket.io fan-out.
  private rateLimitClient: Redis | null = null;
  private attached = false;

  constructor(
    @Optional()
    @Inject(ConfigService)
    private readonly configService?: ConfigService<AllConfigType>,
  ) {}

  /**
   * Replace the gateway server's adapter with a Redis-backed one.
   * Idempotent: a second call is a no-op so the gateway can call this
   * from `afterInit` without worrying about double-attach (e.g.
   * hot-reload during `nest start --watch`).
   */
  attachToServer(server: Server): void {
    if (this.attached) {
      return;
    }
    if (this.isDisabledByEnv()) {
      this.logger.warn(
        '[MatchLive] MATCH_LIVE_INFRA_DISABLED — using in-memory socket.io adapter (single-instance only)',
      );
      this.attached = true;
      return;
    }

    const config = this.readClientConfig();
    this.pubClient = this.createClient(config);
    this.subClient = this.createClient(config);

    // @socket.io/redis-adapter factory returns a per-namespace
    // adapter constructor; assigning it to `server.adapter` makes
    // socket.io use it for every namespace under this server.
    server.adapter(
      createAdapter(this.pubClient, this.subClient, {
        key: 'match-live',
        requestsTimeout: 5_000,
      }),
    );

    this.attached = true;
    this.logger.log(
      '[MatchLive] Redis adapter attached — match events now fan out across Nest instances',
    );
  }

  /**
   * Return an ioredis client dedicated to the rate-limit Lua script,
   * or `null` when the per-IP infra is disabled (dev / CI without
   * Redis). One client is shared across every `tryConnect` call —
   * ioredis pipelines requests and `EVAL` is synchronous on the
   * server, so a single client is enough to serve the gateway's
   * connection rate. The client is `quit()`-ed in
   * `onApplicationShutdown`.
   */
  getRateLimitClient(): Redis | null {
    if (this.isDisabledByEnv() || !this.attached) {
      return null;
    }
    if (!this.rateLimitClient) {
      this.rateLimitClient = this.createClient(this.readClientConfig());
    }
    return this.rateLimitClient;
  }

  /**
   * Release the two ioredis clients. The adapter's own `close()` (if
   * we held a reference) tears down pub/sub listeners first; we
   * `quit()` the connections here. Either order works — we just need
   * to ensure `quit()` runs even if `close()` throws.
   */
  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(
      `Closing MatchLive Redis adapter (signal=${signal ?? 'n/a'})`,
    );
    await Promise.allSettled([
      this.pubClient ? this.pubClient.quit() : Promise.resolve(),
      this.subClient ? this.subClient.quit() : Promise.resolve(),
      this.rateLimitClient ? this.rateLimitClient.quit() : Promise.resolve(),
    ]);
  }

  private readClientConfig(): {
    host: string;
    port: number;
    password: string;
    db: number;
    tls: boolean | undefined;
  } {
    // Match the production config the auction client uses
    // (api/src/redis/redis.module.ts) so behavior is identical under
    // the same env. Falling back to localhost lets the unit spec run
    // without a full ConfigService registered.
    if (!this.configService) {
      return {
        host: 'localhost',
        port: 6379,
        password: 'redispass',
        db: 0,
        tls: undefined,
      };
    }
    return {
      host: this.configService.getOrThrow('redis.host', { infer: true }),
      port: this.configService.getOrThrow('redis.port', { infer: true }),
      password: this.configService.getOrThrow('redis.password', {
        infer: true,
      }),
      db: this.configService.getOrThrow('redis.db', { infer: true }),
      tls: this.configService.get('redis.tlsEnabled', { infer: true }),
    };
  }

  private createClient(config: {
    host: string;
    port: number;
    password: string;
    db: number;
    tls: boolean | undefined;
  }): Redis {
    // ioredis's overloads don't accept the union of options we
    // build (lazyConnect + retryStrategy + reconnectOnError + tls);
    // the existing auction/notification clients in
    // `api/src/redis/redis.module.ts` hit the same overload and
    // work because the type is loosely accepted at runtime. The
    // cast mirrors that — keeping the call shape identical so a
    // future ioredis upgrade only needs to revisit the cast site.
    return new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db,
      // ioredis `tls` accepts `true` to enable default TLS or an
      // options object — passing `false` would still engage the
      // TLS handshake. We collapse our config's boolean to
      // `true | undefined` so a `false` env value just leaves it
      // off the options entirely.
      ...(config.tls ? { tls: true as const } : {}),
      lazyConnect: true,
      // Same exponential-backoff-with-cap policy as the auction
      // client (Postfix-#4 in redis.module.ts) so a Redis blip
      // doesn't permanently take the live feed down.
      retryStrategy: (times: number) =>
        Math.min(50 * Math.pow(2, times - 1), 5_000),
      reconnectOnError: (err: Error) =>
        err.message.includes('READONLY') ? 2 : false,
      maxRetriesPerRequest: 3,
      // ioredis's overloads don't accept the union of options we
      // build (lazyConnect + retryStrategy + reconnectOnError + tls);
      // the existing auction/notification clients in
      // `api/src/redis/redis.module.ts` hit the same overload and
      // work because the type is loosely accepted at runtime. The
      // cast mirrors that — keeping the call shape identical so a
      // future ioredis upgrade only needs to revisit the cast site.
    } as any);
  }

  private isDisabledByEnv(): boolean {
    return process.env.MATCH_LIVE_INFRA_DISABLED === 'true';
  }
}
