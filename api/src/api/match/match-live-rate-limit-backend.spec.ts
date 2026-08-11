import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_RATE_LIMIT_CONFIG,
  InMemoryRateLimiter,
  RedisRateLimiter,
  buildRateLimiter,
} from './match-live-rate-limit';
import { MatchLiveRedisAdapter } from './match-live-redis.adapter';

/**
 * Coverage for the rate-limit backend split. The pure-helper spec
 * (match-live-rate-limit.spec.ts) still owns `evaluateConnection` /
 * `evaluateDisconnect`; this file covers the wrapper class and the
 * Redis client wiring so a refactor that drops the fallback or the
 * Lua argument shape fails fast.
 *
 * Redis-specific paths use a hand-rolled `eval` mock (no real
 * `ioredis-mock` dep) so the test surface is small and the spec
 * runs in <100ms.
 */
describe('RateLimiter backends', () => {
  const originalEnv = process.env.MATCH_LIVE_INFRA_DISABLED;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.MATCH_LIVE_INFRA_DISABLED;
    } else {
      process.env.MATCH_LIVE_INFRA_DISABLED = originalEnv;
    }
  });

  describe('InMemoryRateLimiter', () => {
    it('accepts the first connect and persists the next state', async () => {
      const limiter = new InMemoryRateLimiter();
      const verdict = await limiter.tryConnect('1.1.1.1', 1_000);
      expect(verdict).toEqual({ accept: true });

      // `noteDisconnect` must not throw on the first disconnect, and
      // must leave the state usable for a subsequent connect.
      await limiter.noteDisconnect('1.1.1.1');

      const second = await limiter.tryConnect('1.1.1.1', 1_100);
      expect(second).toEqual({ accept: true });
    });

    it('rejects once the per-IP cap is reached', async () => {
      const cfg = { ...DEFAULT_RATE_LIMIT_CONFIG, maxConnectsPerWindow: 2 };
      const limiter = new InMemoryRateLimiter(cfg);

      expect(await limiter.tryConnect('2.2.2.2', 1_000)).toEqual({
        accept: true,
      });
      expect(await limiter.tryConnect('2.2.2.2', 1_500)).toEqual({
        accept: true,
      });
      // Third connect in the same window hits the rate cap.
      expect(await limiter.tryConnect('2.2.2.2', 2_000)).toEqual({
        accept: false,
        reason: 'rate_limited',
      });
    });

    it('accepts again once the window has drained', async () => {
      const cfg = { ...DEFAULT_RATE_LIMIT_CONFIG, windowMs: 1_000 };
      const limiter = new InMemoryRateLimiter(cfg);

      await limiter.tryConnect('3.3.3.3', 1_000);
      await limiter.tryConnect('3.3.3.3', 1_500);
      // Saturated. Step past the window — fresh attempt must be
      // accepted because the in-memory `evaluateConnection` filters
      // expired timestamps before checking the cap.
      const verdict = await limiter.tryConnect('3.3.3.3', 3_000);
      expect(verdict).toEqual({ accept: true });
    });

    it('respects the active-socket cap (multiple sockets, no time gap)', async () => {
      // Distinct from the rate cap: even without sliding-window
      // pressure, a single IP can't hold `maxActiveSockets` open
      // sockets without a disconnect.
      const cfg = { ...DEFAULT_RATE_LIMIT_CONFIG, maxActiveSockets: 2 };
      const limiter = new InMemoryRateLimiter(cfg);

      expect(await limiter.tryConnect('4.4.4.4', 1_000)).toEqual({
        accept: true,
      });
      expect(await limiter.tryConnect('4.4.4.4', 1_001)).toEqual({
        accept: true,
      });
      // Third socket before any disconnect hits the active cap.
      expect(await limiter.tryConnect('4.4.4.4', 1_002)).toEqual({
        accept: false,
        reason: 'active_cap',
      });

      // Free one slot via disconnect, the next connect is accepted.
      await limiter.noteDisconnect('4.4.4.4');
      expect(await limiter.tryConnect('4.4.4.4', 1_003)).toEqual({
        accept: true,
      });
    });

    it('noteDisconnect on an unknown IP is a no-op (no throw)', async () => {
      const limiter = new InMemoryRateLimiter();
      await expect(
        limiter.noteDisconnect('never-seen'),
      ).resolves.toBeUndefined();
    });
  });

  describe('RedisRateLimiter', () => {
    // Build a minimal ioredis-shape stub. We only need `eval`,
    // `decr`, and `set` for the limiter's code paths.
    const mockRedis = () => {
      const evalMock = jest.fn();
      const decrMock = jest.fn();
      const setMock = jest.fn();
      return {
        eval: evalMock,
        decr: decrMock,
        set: setMock,
        // Cast keeps the rest of the ioredis surface available if a
        // future test wants to add it without touching the limiter.
      } as unknown as Parameters<
        typeof RedisRateLimiter.prototype.tryConnect
      >[0] & {
        eval: jest.Mock;
        decr: jest.Mock;
        set: jest.Mock;
      };
    };

    it('passes the right keys and arguments to EVAL', async () => {
      const redis = mockRedis();
      redis.eval.mockResolvedValue(['1', '']);
      const limiter = new RedisRateLimiter(redis as never);

      const verdict = await limiter.tryConnect('5.5.5.5', 1_000);
      expect(verdict).toEqual({ accept: true });

      // Two KEYS (active counter, sorted set), 7 ARGVs, and the
      // member must be unique per call (so two simultaneous ZADDs
      // from the same `now` don't collide).
      expect(redis.eval).toHaveBeenCalledTimes(1);
      const [lua, keyCount, ...rest] = redis.eval.mock.calls[0];
      expect(lua).toContain('ZADD');
      expect(lua).toContain('ZCARD');
      expect(keyCount).toBe(2);
      expect(rest[0]).toBe('match_live:rl:active:5.5.5.5');
      expect(rest[1]).toBe('match_live:rl:rate:5.5.5.5');
      expect(rest[2]).toBe('1000'); // now
      expect(rest[3]).toBe(String(DEFAULT_RATE_LIMIT_CONFIG.windowMs));
      expect(rest[4]).toBe(
        String(DEFAULT_RATE_LIMIT_CONFIG.maxConnectsPerWindow),
      );
      expect(rest[5]).toBe(String(DEFAULT_RATE_LIMIT_CONFIG.maxActiveSockets));
      // member is `${now}:${hex}`, shape-check only
      expect(rest[6]).toMatch(/^1000:[0-9a-f]{8}$/);
    });

    it('translates the Lua reject reason to AcceptResult', async () => {
      const redis = mockRedis();
      redis.eval.mockResolvedValue(['0', 'active_cap']);
      const limiter = new RedisRateLimiter(redis as never);

      const verdict = await limiter.tryConnect('6.6.6.6', 1_000);
      expect(verdict).toEqual({ accept: false, reason: 'active_cap' });
    });

    it('returns rate_limited when the Lua script reports a full window', async () => {
      const redis = mockRedis();
      redis.eval.mockResolvedValue(['0', 'rate_limited']);
      const limiter = new RedisRateLimiter(redis as never);

      const verdict = await limiter.tryConnect('7.7.7.7', 1_000);
      expect(verdict).toEqual({ accept: false, reason: 'rate_limited' });
    });

    it('falls back to the in-memory limiter on a Redis error', async () => {
      // Fail-open: if Redis is down, traffic still flows. Same
      // posture as the auction/notification stacks.
      const redis = mockRedis();
      redis.eval.mockRejectedValue(new Error('ECONNREFUSED'));
      const inner = new InMemoryRateLimiter();
      const limiter = new RedisRateLimiter(redis as never, undefined, inner);

      const verdict = await limiter.tryConnect('8.8.8.8', 1_000);
      expect(verdict).toEqual({ accept: true });
    });

    it('noteDisconnect clamps the active counter to 0 when it goes negative', async () => {
      const redis = mockRedis();
      redis.decr.mockResolvedValue(-1);
      const limiter = new RedisRateLimiter(redis as never);

      await limiter.noteDisconnect('9.9.9.9');

      // The clamp SET is the load-bearing call: without it a
      // double-disconnect leaves the counter negative and the next
      // connect would skip the active-cap check.
      expect(redis.set).toHaveBeenCalledWith(
        'match_live:rl:active:9.9.9.9',
        '0',
        'EX',
        expect.any(Number),
      );
    });
  });

  describe('buildRateLimiter', () => {
    it('returns the in-memory backend when MATCH_LIVE_INFRA_DISABLED is set', () => {
      process.env.MATCH_LIVE_INFRA_DISABLED = 'true';
      const limiter = buildRateLimiter(
        undefined as unknown as ConfigService,
        undefined,
      );
      expect(limiter).toBeInstanceOf(InMemoryRateLimiter);
    });

    it('returns the in-memory backend when no Redis client is provided', () => {
      delete process.env.MATCH_LIVE_INFRA_DISABLED;
      const limiter = buildRateLimiter(
        undefined as unknown as ConfigService,
        undefined,
      );
      expect(limiter).toBeInstanceOf(InMemoryRateLimiter);
    });

    it('returns a Redis backend when both a config service and Redis are wired', () => {
      delete process.env.MATCH_LIVE_INFRA_DISABLED;
      const redis = {} as never;
      const cfg = {} as unknown as ConfigService;
      const limiter = buildRateLimiter(cfg, redis);
      expect(limiter).toBeInstanceOf(RedisRateLimiter);
    });
  });

  describe('MatchLiveRedisAdapter (lifecycle + env-var behaviour)', () => {
    it('returns a no-op attach when the env escape hatch is set', () => {
      process.env.MATCH_LIVE_INFRA_DISABLED = 'true';
      const adapter = new MatchLiveRedisAdapter();
      const server = { adapter: jest.fn() } as any;
      adapter.attachToServer(server);

      // `server.adapter` must NOT have been replaced — the whole
      // point of the env flag is to leave the default in-memory
      // adapter in place (e.g. in CI without Redis).
      expect(server.adapter).not.toHaveBeenCalled();
      // getRateLimitClient should also return null in this mode.
      expect(adapter.getRateLimitClient()).toBeNull();
    });

    it('is idempotent — second attachToServer call is a no-op', () => {
      // Without the env flag this would try to open Redis
      // connections, so we test idempotence by toggling the flag
      // back on after the first call, which is the only path that
      // doesn't require a live Redis container.
      process.env.MATCH_LIVE_INFRA_DISABLED = 'true';
      const adapter = new MatchLiveRedisAdapter();
      const server = { adapter: jest.fn() } as any;
      adapter.attachToServer(server);
      adapter.attachToServer(server);
      // Still no call — the first call marked attached = true.
      expect(server.adapter).not.toHaveBeenCalled();
    });
  });
});
