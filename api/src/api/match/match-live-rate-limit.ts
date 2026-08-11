/**
 * match-live-rate-limit.ts — per-IP connection rate limit + active socket
 * cap for the live match WebSocket gateway.
 *
 * S2 from the live page review: the gateway previously accepted any
 * number of new connections from the same IP and let any single IP
 * hold an arbitrary number of open sockets. A misbehaving client (or
 * a small botnet) could open thousands of sockets and tie up gateway
 * resources + force repeated `getMatchState` / `getVisibleEvents` DB
 * reads on `join_match`.
 *
 * This module exposes:
 *   - The pure helpers `evaluateConnection` / `evaluateDisconnect`
 *     (originally the entire file) — used by the in-memory backend
 *     and reused verbatim in its spec.
 *   - A `RateLimiter` interface so the gateway can pick the right
 *     backend per environment without leaking the backend choice into
 *     gateway code.
 *   - Two implementations: in-memory (single-instance, default in
 *     dev/test) and Redis (multi-instance, used in production).
 *
 * The in-memory implementation is a class wrapper around the pure
 * helpers with a private `Map<ip, IpRateState>`. The Redis
 * implementation runs a single Lua script atomically against the
 * two keys (active counter + sliding-window sorted set). Both are
 * spec'd in `match-live-rate-limit.spec.ts`.
 */
import type { AllConfigType } from '@/config/config.type';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import Redis from 'ioredis';

export interface IpRateState {
  /** Timestamps of recent `handleConnection` invocations (oldest first). */
  connectTimestamps: number[];
  /** Currently-open sockets from this IP. Decremented in `handleDisconnect`. */
  activeSocketCount: number;
}

export interface RateLimitConfig {
  /** Sliding-window length, in milliseconds. */
  windowMs: number;
  /** Max new connections allowed within `windowMs` per IP. */
  maxConnectsPerWindow: number;
  /** Max simultaneously-open sockets allowed per IP. */
  maxActiveSockets: number;
}

export type AcceptResult =
  | { accept: true }
  | { accept: false; reason: 'rate_limited' | 'active_cap' };

/**
 * Decide whether a new connection from `ip` should be accepted and
 * return the updated state in one pass. Pure: the caller owns the
 * `Map<ip, IpRateState>` and persists `next` back into it.
 *
 * Rules (in evaluation order):
 *   1. Active socket cap — if the IP already has `maxActiveSockets`
 *      open, reject immediately. Done first so an attacker can't
 *      keep rotating the rate-limit window.
 *   2. Sliding-window rate — count `connectTimestamps` falling
 *      within the last `windowMs`. If the count is at
 *      `maxConnectsPerWindow`, reject. Otherwise record this attempt
 *      and accept.
 *
 * Returning `accept: false` does NOT mutate the caller's map — the
 * caller is expected to leave the previous state alone (active count
 * never went up; rate window was not advanced because we never got
 * the chance to record the would-be attempt).
 *
 * The internal return type carries `next` (the state to persist)
 * alongside `accept: true`; the public `RateLimiter` interface
 * (`tryConnect`) hides `next` so the gateway never sees the
 * backend-specific state shape.
 */
export function evaluateConnection(
  current: IpRateState | undefined,
  now: number,
  config: RateLimitConfig,
):
  | { accept: true; next: IpRateState }
  | { accept: false; reason: 'rate_limited' | 'active_cap' } {
  const prev: IpRateState = current ?? {
    connectTimestamps: [],
    activeSocketCount: 0,
  };

  // Rule 1: active socket cap. Checked first so the rate-limit
  // window doesn't get "burned" by a connection we never accepted.
  if (prev.activeSocketCount >= config.maxActiveSockets) {
    return { accept: false, reason: 'active_cap' };
  }

  // Rule 2: sliding-window rate. Drop expired timestamps first so
  // the array doesn't grow unboundedly for long-lived clients.
  const fresh = prev.connectTimestamps.filter((t) => now - t < config.windowMs);
  if (fresh.length >= config.maxConnectsPerWindow) {
    return { accept: false, reason: 'rate_limited' };
  }

  return {
    accept: true,
    next: {
      connectTimestamps: [...fresh, now],
      activeSocketCount: prev.activeSocketCount + 1,
    },
  };
}

/**
 * Decrement the active-socket counter on disconnect. Pure: the caller
 * is expected to persist `next` back into the map. The active-socket
 * cap floor at 0 protects against a stray double-disconnect (socket.io
 * can fire `disconnect` after the server has already torn down the
 * socket on rate-limit rejection).
 */
export function evaluateDisconnect(current: IpRateState): IpRateState {
  return {
    connectTimestamps: current.connectTimestamps,
    activeSocketCount: Math.max(0, current.activeSocketCount - 1),
  };
}

/**
 * Default config used by the gateway. Exported so the spec can assert
 * the values without duplicating magic numbers in tests.
 */
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  windowMs: 5_000,
  maxConnectsPerWindow: 3,
  maxActiveSockets: 5,
};

/**
 * Pluggable rate-limit backend. The gateway calls `tryConnect` on
 * every new socket and `noteDisconnect` on every close, with no
 * awareness of whether the underlying state lives in a `Map` or
 * Redis. This is the seam that lets the gateway ship in dev with
 * the in-memory backend (no Redis dependency) and switch to the
 * Redis backend in production / multi-instance deploys.
 */
export interface RateLimiter {
  tryConnect(ip: string, now?: number): Promise<AcceptResult>;
  noteDisconnect(ip: string): Promise<void>;
}

/**
 * In-memory `RateLimiter` — wraps the pure helpers in this file. Use
 * in dev / single-instance deploys and in the unit spec (no Redis
 * dependency). State is per-process: a 3-replica deployment
 * effectively allows 3× the configured limits, which is the same
 * behaviour the gateway had before the S2 split.
 */
@Injectable()
export class InMemoryRateLimiter implements RateLimiter {
  private readonly state = new Map<string, IpRateState>();

  constructor(
    private readonly config: RateLimitConfig = DEFAULT_RATE_LIMIT_CONFIG,
  ) {}

  async tryConnect(
    ip: string,
    now: number = Date.now(),
  ): Promise<AcceptResult> {
    const result = evaluateConnection(this.state.get(ip), now, this.config);
    if (result.accept === true) {
      this.state.set(ip, result.next);
      return { accept: true };
    }
    return { accept: false, reason: result.reason };
  }

  async noteDisconnect(ip: string): Promise<void> {
    const current = this.state.get(ip);
    if (!current) {
      return;
    }
    this.state.set(ip, evaluateDisconnect(current));
  }
}

/**
 * Redis-backed `RateLimiter` — the right answer for multi-instance
 * deployments, where each Nest process would otherwise enforce limits
 * independently. The whole "is this connection accepted?" decision
 * is one Lua call so two concurrent connects from the same IP can't
 * both slip past the active-socket cap.
 *
 * Keys:
 *   - `match_live:rl:active:{ip}` — INCR counter, decremented on
 *     disconnect. TTL is 60s so an IP that stops connecting doesn't
 *     leak counter slots.
 *   - `match_live:rl:rate:{ip}` — sorted set, one member per
 *     accepted connection attempt scored by timestamp. We ZADD on
 *     entry, ZREMRANGEBYSCORE expired entries, then ZCARD to count.
 *     If the count exceeds the window cap, we roll back the just-
 *     added member so the rejected attempt doesn't itself burn
 *     rate budget on the next call.
 */
const RATE_LIMIT_LUA = `
-- KEYS[1] = active counter key
-- KEYS[2] = sorted-set key
-- ARGV[1] = now (ms)
-- ARGV[2] = windowMs
-- ARGV[3] = maxConnectsPerWindow
-- ARGV[4] = maxActiveSockets
-- ARGV[5] = unique member (so concurrent attempts don't collide on ZADD score)
-- ARGV[6] = TTL seconds for the sorted set
-- ARGV[7] = TTL seconds for the active counter
local active = tonumber(redis.call('GET', KEYS[1]) or '0')
if active >= tonumber(ARGV[4]) then
  return {'0', 'active_cap'}
end

redis.call('ZADD', KEYS[2], ARGV[1], ARGV[5])
redis.call('ZREMRANGEBYSCORE', KEYS[2], 0, ARGV[1] - tonumber(ARGV[2]))
redis.call('EXPIRE', KEYS[2], ARGV[6])

local count = redis.call('ZCARD', KEYS[2])
if count > tonumber(ARGV[3]) then
  -- roll back: the rejected attempt must not consume a slot in the
  -- next window. Pairs with the ZADD above so net effect = 0.
  redis.call('ZREM', KEYS[2], ARGV[5])
  return {'0', 'rate_limited'}
end

redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], ARGV[7])
return {'1', ''}
`;

@Injectable()
export class RedisRateLimiter implements RateLimiter {
  private readonly logger = new Logger(RedisRateLimiter.name);
  // Counter TTL is 60s — long enough that a single idle client doesn't
  // lose its slot between bursty reconnects, short enough that a
  // vanished IP doesn't leak counter space forever. 2× the rate
  // window is a safe default.
  private static readonly ACTIVE_TTL_SECONDS = 60;
  // Sorted set TTL is windowMs rounded up + 1s cushion.
  private readonly rateTtlSeconds: number;

  constructor(
    @Inject('MATCH_LIVE_RATE_LIMIT_REDIS') private readonly redis: Redis,
    private readonly config: RateLimitConfig = DEFAULT_RATE_LIMIT_CONFIG,
    @Optional()
    @Inject('MATCH_LIVE_RATE_LIMIT_REDIS_FALLBACK')
    private readonly fallback?: RateLimiter,
  ) {
    this.rateTtlSeconds = Math.ceil(this.config.windowMs / 1000) + 1;
  }

  async tryConnect(
    ip: string,
    now: number = Date.now(),
  ): Promise<AcceptResult> {
    try {
      const member = `${now}:${randomBytes(4).toString('hex')}`;
      const result = (await this.redis.eval(
        RATE_LIMIT_LUA,
        2,
        this.activeKey(ip),
        this.rateKey(ip),
        String(now),
        String(this.config.windowMs),
        String(this.config.maxConnectsPerWindow),
        String(this.config.maxActiveSockets),
        member,
        String(this.rateTtlSeconds),
        String(RedisRateLimiter.ACTIVE_TTL_SECONDS),
      )) as [string, string];

      const [accepted, reason] = result;
      if (accepted === '1') {
        return { accept: true };
      }
      if (reason === 'active_cap' || reason === 'rate_limited') {
        return { accept: false, reason };
      }
      // Unknown Lua return — treat as accepted (fail-open) but log
      // so a script regression doesn't silently let traffic through.
      this.logger.warn(
        `Unexpected rate-limit Lua return: ${JSON.stringify(result)}`,
      );
      return { accept: true };
    } catch (err) {
      // Fail-open: if Redis is down, the worst case is we lose
      // rate-limiting for the duration of the outage, not that we
      // reject every legitimate user. Same posture as the
      // auction/notification stacks (redis.module.ts retryStrategy).
      this.logger.error(
        `Rate-limit Redis call failed (${err instanceof Error ? err.message : String(err)}); falling back to in-memory limiter`,
      );
      if (this.fallback) {
        return this.fallback.tryConnect(ip, now);
      }
      return { accept: true };
    }
  }

  async noteDisconnect(ip: string): Promise<void> {
    try {
      // Floor at 0: Lua's INCR is the only path that increments, so
      // a stray double-disconnect could otherwise push the counter
      // negative and let the same IP "store up" negative budget.
      const remaining = await this.redis.decr(this.activeKey(ip));
      if (remaining < 0) {
        await this.redis.set(
          this.activeKey(ip),
          '0',
          'EX',
          RedisRateLimiter.ACTIVE_TTL_SECONDS,
        );
      }
    } catch (err) {
      this.logger.error(
        `Rate-limit noteDisconnect failed (${err instanceof Error ? err.message : String(err)})`,
      );
      if (this.fallback) {
        await this.fallback.noteDisconnect(ip);
      }
    }
  }

  private activeKey(ip: string): string {
    return `match_live:rl:active:${ip}`;
  }

  private rateKey(ip: string): string {
    return `match_live:rl:rate:${ip}`;
  }
}

/**
 * Pick a `RateLimiter` based on the environment. The gateway injects
 * this token (`MATCH_LIVE_RATE_LIMITER`) so the choice is made once
 * at module wiring time, not per-connection. The default is
 * in-memory; the Redis backend is only wired in if the env tells us
 * a real ioredis client is available and the per-IP infra isn't
 * explicitly disabled (same escape hatch as `MatchLiveRedisAdapter`).
 */
export function buildRateLimiter(
  configService: ConfigService<AllConfigType> | undefined,
  redis: Redis | undefined,
  limiterConfig: RateLimitConfig = DEFAULT_RATE_LIMIT_CONFIG,
): RateLimiter {
  if (
    process.env.MATCH_LIVE_INFRA_DISABLED === 'true' ||
    !redis ||
    !configService
  ) {
    return new InMemoryRateLimiter(limiterConfig);
  }
  return new RedisRateLimiter(
    redis,
    limiterConfig,
    new InMemoryRateLimiter(limiterConfig),
  );
}
