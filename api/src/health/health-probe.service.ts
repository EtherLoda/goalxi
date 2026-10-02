import { REDIS_AUCTION_CLIENT } from '@/redis/redis.module';
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Redis } from 'ioredis';
import { DataSource } from 'typeorm';
import { HealthStateService } from './health-state.service';

/**
 * Render an unknown thrown value as a string worth showing an operator.
 *
 * The naive `err instanceof Error ? err.message : String(err)` is not
 * enough here. When Postgres goes away mid-flight, node-postgres rejects
 * pool-level waiters with an error whose `message` is an **empty
 * string**, and `String(err)` on a non-Error is often `"[object
 * Object]"` or `""` too. Either way `/health` reports
 * `"lastError": ""` while `state` is `failing` — so during a real
 * outage the endpoint says "the database is broken" and gives no hint
 * why.
 *
 * So: always prefix the constructor name, and only append the message
 * when there is one.
 */
export function describeProbeError(err: unknown): string {
  if (err instanceof Error) {
    const name = err.name || err.constructor?.name || 'Error';
    const message = err.message?.trim();
    return message ? `${name}: ${message}` : name;
  }
  const asString = String(err);
  // `String({})` and `String([])` are noise; keep the object tag so the
  // value is at least identifiable.
  return asString && asString !== '[object Object]'
    ? asString
    : Object.prototype.toString.call(err);
}

/**
 * Background liveness probe. Every `intervalMs` it pings Postgres
 * with `SELECT 1` and Redis with `PING`, both wrapped in a hard
 * `timeoutMs` deadline. Results feed `HealthStateService` which
 * the readiness guard and `/health` endpoint read from.
 *
 * The interval is intentionally decoupled from the K8s probe period
 * (default 10s). A 5s tick gives the readiness guard roughly two
 * chances to detect a failure before K8s pulls the pod, which is
 * enough slack for normal transient blips.
 *
 * The `unref()` on the timer is important: this service must NOT
 * be the reason the process keeps running past `app.close()`. The
 * timer is best-effort observability; nest's lifecycle handles
 * actual shutdown.
 */
@Injectable()
export class HealthProbeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HealthProbeService.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly intervalMs = 5_000;
  private readonly timeoutMs = 2_000;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    // Inject the public `REDIS_AUCTION_CLIENT` token (the wrapper's
    // client) rather than `REDIS_AUCTION_CLIENT_RAW` — the raw token
    // is a private implementation detail of `RedisModule` and is
    // NOT in its `exports` array (see Postfix-#5 in redis.module.ts).
    // The wrapper resolves to the same underlying ioredis instance,
    // so this is the right boundary for any non-Redis-module consumer.
    @Inject(REDIS_AUCTION_CLIENT) private readonly redis: Redis,
    private readonly state: HealthStateService,
  ) {}

  onModuleInit(): void {
    // Fire one tick immediately on boot so /health is meaningful
    // before the first interval fires. If DB is still in the
    // TypeORM retry window (commit affe7dc widens it to 60s), the
    // probe will record that as a failure and the state machine
    // counts toward the threshold naturally.
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    await Promise.allSettled([this.probeDb(), this.probeRedis()]);
  }

  private async probeDb(): Promise<void> {
    // During the TypeORM retry window `isInitialized` stays false.
    // Treat that as a transient failure rather than letting the
    // .query() call throw an unhandled rejection.
    if (!this.dataSource.isInitialized) {
      this.state.markDbFailure('not initialized');
      return;
    }
    try {
      await this.raceWithTimeout(this.dataSource.query('SELECT 1'));
      this.state.markDbSuccess();
    } catch (err) {
      this.state.markDbFailure(describeProbeError(err));
    }
  }

  private async probeRedis(): Promise<void> {
    try {
      await this.raceWithTimeout(this.redis.ping());
      this.state.markRedisSuccess();
    } catch (err) {
      this.state.markRedisFailure(describeProbeError(err));
    }
  }

  private async raceWithTimeout<T>(promise: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | null = null;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`probe timeout after ${this.timeoutMs}ms`)),
            this.timeoutMs,
          );
          timer.unref?.();
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
