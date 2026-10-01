import { ConfigService } from '@nestjs/config';
import { CronLockService } from './cron-lock.service';
import {
  applyCronLock,
  CRON_LOCK_METADATA,
  CronLocked,
} from './cron-lock.decorator';

/**
 * `CronLockService` is tested against a hand-rolled fake Redis rather
 * than a real one. That is a deliberate trade:
 *
 *  - The Lua CAS scripts cannot be executed by a JS fake, so the fake
 *    records the script and applies the intended semantics. The tests
 *    therefore assert "we issued a token-checked release", which is the
 *    property that matters, rather than "Redis deleted the key".
 *  - A real-Redis test would need a live server, and this repo has zero
 *    DB/Redis-backed tests by design (everything is mocked). Adding one
 *    infrastructure dependency here would be inconsistent and would make
 *    `pnpm test` non-hermetic.
 *
 * The scripts themselves are three lines each and are reviewed as source.
 */
class FakeRedis {
  /** key -> { token, expiresAt } */
  store = new Map<string, { token: string; expiresAt: number }>();
  evalCalls: Array<{ script: string; args: unknown[] }> = [];
  setCalls: Array<{ key: string; token: string; px: number; nx: boolean }> = [];
  failSet = false;
  failEval = false;
  now = 0;

  private live(key: string) {
    const e = this.store.get(key);
    if (!e) return null;
    if (e.expiresAt <= this.now) {
      this.store.delete(key);
      return null;
    }
    return e;
  }

  async set(
    key: string,
    token: string,
    _mode: string,
    px: number,
    nx: boolean,
  ) {
    if (this.failSet) throw new Error('ECONNREFUSED');
    this.setCalls.push({ key, token, px, nx });
    if (nx && this.live(key)) return null;
    this.store.set(key, { token, expiresAt: this.now + px });
    return 'OK';
  }

  async eval(
    script: string,
    _numKeys: number,
    key: string,
    ...args: unknown[]
  ) {
    if (this.failEval) throw new Error('ECONNREFUSED');
    this.evalCalls.push({ script, args: [key, ...args] });

    const current = this.live(key);
    const token = args[0] as string;

    if (script.includes('PEXPIRE')) {
      // RENEW: only if we still own it.
      if (!current || current.token !== token) return 0;
      current.expiresAt = this.now + Number(args[1]);
      return 1;
    }
    // RELEASE: only if we still own it.
    if (!current || current.token !== token) return 0;
    this.store.delete(key);
    return 1;
  }

  async quit() {
    return 'OK';
  }
  disconnect() {
    /* noop */
  }
}

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
} as any;

function makeService(redis: FakeRedis) {
  const svc = new CronLockService(logger, {
    getOrThrow: (k: string) => (k === 'REDIS_PORT' ? 6379 : 'test'),
    get: () => undefined,
  } as unknown as ConfigService);
  // Swap the private client for the fake.
  (svc as unknown as { redis: FakeRedis }).redis = redis;
  return svc;
}

const TTL = 60_000;

describe('CronLockService.acquire', () => {
  it('acquires an uncontended lock and returns a token', async () => {
    const redis = new FakeRedis();
    const res = await makeService(redis).acquire('cron.a', TTL);

    expect(res.status).toBe('acquired');
    expect(redis.store.get('cronlock:cron.a')?.token).toBe(
      (res as { token: string }).token,
    );
  });

  it('sets NX and PX so the key is exclusive and self-expiring', async () => {
    const redis = new FakeRedis();
    await makeService(redis).acquire('cron.a', TTL);

    // ioredis takes the mode flags as literal strings.
    expect(redis.setCalls[0]).toMatchObject({
      key: 'cronlock:cron.a',
      px: TTL,
      nx: 'NX',
    });
  });

  it('reports "held" when another holder owns it', async () => {
    const redis = new FakeRedis();
    const svc = makeService(redis);

    expect((await svc.acquire('cron.a', TTL)).status).toBe('acquired');
    expect((await svc.acquire('cron.a', TTL)).status).toBe('held');
  });

  it('reports "unavailable" and does not throw when Redis is down', async () => {
    // Fail-open matters: settlement's global exception filter is
    // `@Catch()`-all and only logs, so a thrown error here would make the
    // tick vanish silently. Worse, failing closed would freeze the game
    // clock every time Redis blipped.
    const redis = new FakeRedis();
    redis.failSet = true;

    const res = await makeService(redis).acquire('cron.a', TTL);
    expect(res.status).toBe('unavailable');
    expect(logger.error).toHaveBeenCalled();
  });

  it('does not throw when Redis fails mid-handler (renew path)', async () => {
    const redis = new FakeRedis();
    const svc = makeService(redis);
    redis.failEval = true;

    await expect(
      svc.run('cron.a', async () => 'ok', { ttlMs: TTL }),
    ).resolves.toMatchObject({ executed: true, result: 'ok' });
  });
});

describe('CronLockService.run', () => {
  it('runs the handler and releases the lock afterwards', async () => {
    const redis = new FakeRedis();
    const handler = jest.fn().mockResolvedValue('done');

    const res = await makeService(redis).run('cron.a', handler, { ttlMs: TTL });

    expect(res).toMatchObject({ executed: true, result: 'done' });
    expect(handler).toHaveBeenCalledTimes(1);
    // Released, not left to expire.
    expect(redis.store.has('cronlock:cron.a')).toBe(false);
  });

  it('SKIPS the handler and does not throw when the lock is held', async () => {
    // Not throwing is the point: a `@Catch()`-all filter would swallow a
    // rejection and turn a skip into a silent disappearance.
    const redis = new FakeRedis();
    const svc = makeService(redis);
    await svc.acquire('cron.a', TTL);

    const handler = jest.fn().mockResolvedValue('done');
    const res = await svc.run('cron.a', handler, { ttlMs: TTL });

    expect(res.executed).toBe(false);
    expect(res.result).toBeUndefined();
    expect(handler).not.toHaveBeenCalled();
  });

  it('releases the lock even when the handler throws', async () => {
    const redis = new FakeRedis();
    const svc = makeService(redis);

    await expect(
      svc.run(
        'cron.a',
        async () => {
          throw new Error('handler blew up');
        },
        { ttlMs: TTL },
      ),
    ).rejects.toThrow('handler blew up');

    // A leaked lock would block every future tick until the TTL lapsed.
    expect(redis.store.has('cronlock:cron.a')).toBe(false);
  });

  it('runs the handler unguarded when Redis is unavailable (fail-open)', async () => {
    const redis = new FakeRedis();
    redis.failSet = true;
    const handler = jest.fn().mockResolvedValue('done');

    const res = await makeService(redis).run('cron.a', handler, { ttlMs: TTL });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(res.executed).toBe(true);
  });

  it('does not attempt a release it cannot own (fail-open token)', async () => {
    const redis = new FakeRedis();
    redis.failSet = true;

    await makeService(redis).run('cron.a', async () => 'ok', { ttlMs: TTL });

    // Nothing was ever acquired, so nothing should be released or renewed.
    expect(redis.evalCalls).toHaveLength(0);
  });

  it('two concurrent runs of the same cron execute exactly once', async () => {
    // The actual guarantee: replicas racing the same tick.
    const redis = new FakeRedis();
    const svc = makeService(redis);
    let ran = 0;
    const handler = async () => {
      ran++;
      // Yield so the two calls interleave the way two processes would.
      await new Promise((r) => setImmediate(r));
    };

    const [a, b] = await Promise.all([
      svc.run('cron.a', handler, { ttlMs: TTL }),
      svc.run('cron.a', handler, { ttlMs: TTL }),
    ]);

    expect(ran).toBe(1);
    expect([a.executed, b.executed].filter(Boolean)).toHaveLength(1);
  });

  it('different crons do not block each other', async () => {
    // Guards against a copy-paste that gives two crons the same name.
    const redis = new FakeRedis();
    const svc = makeService(redis);

    const a = svc.run('cron.a', async () => 'a', { ttlMs: TTL });
    const b = svc.run('cron.b', async () => 'b', { ttlMs: TTL });

    expect((await a).executed).toBe(true);
    expect((await b).executed).toBe(true);
  });

  it('renews the TTL so a long handler does not lose its lock', async () => {
    jest.useFakeTimers();
    try {
      const redis = new FakeRedis();
      const svc = makeService(redis);
      let release!: () => void;
      const blocked = new Promise<void>((r) => {
        release = r;
      });

      const run = svc.run('cron.long', () => blocked, { ttlMs: 9_000 });

      // Past the original TTL, but inside a renewal window.
      await jest.advanceTimersByTimeAsync(12_000);
      expect(redis.live('cronlock:cron.long')).not.toBeNull();

      // A competing run must still be excluded.
      expect((await svc.acquire('cron.long', 9_000)).status).toBe('held');

      release();
      await run;
      expect(redis.live('cronlock:cron.long')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('a crashed holder lets the next tick in after the TTL lapses', async () => {
    // The crash-recovery direction: acquire, "die" (never release), and
    // confirm the key expires on its own rather than wedging forever.
    const redis = new FakeRedis();
    const svc = makeService(redis);
    await svc.acquire('cron.crash', 1_000);
    expect((await svc.acquire('cron.crash', 1_000)).status).toBe('held');

    redis.now += 1_001;
    expect((await svc.acquire('cron.crash', 1_000)).status).toBe('acquired');
  });

  it('never releases a lock it has lost ownership of', async () => {
    // The reason release is a Lua CAS and not a bare DEL: a slow handler
    // whose TTL lapsed must not delete the lock a DIFFERENT holder has
    // since taken, which would turn a lost race into two live runs.
    const redis = new FakeRedis();
    const svc = makeService(redis);
    const first = await svc.acquire('cron.cas', 1_000);
    if (first.status !== 'acquired') throw new Error('setup failed');

    // TTL lapses; a second holder takes over.
    redis.now += 1_001;
    const second = await svc.acquire('cron.cas', 1_000);
    expect(second.status).toBe('acquired');

    // The ORIGINAL holder now finishes and tries to release.
    await svc.release('cron.cas', first.token);

    // Second holder must still be excluded.
    expect(redis.live('cronlock:cron.cas')?.token).toBe(
      (second as { token: string }).token,
    );
  });

  it('stops renewing once the handler settles', async () => {
    jest.useFakeTimers();
    try {
      const redis = new FakeRedis();
      const svc = makeService(redis);
      await svc.run('cron.a', async () => 'ok', { ttlMs: 9_000 });
      const renewalsDuringRun = redis.evalCalls.length;

      await jest.advanceTimersByTimeAsync(30_000);

      // No further renewals: a cleared interval is what keeps the
      // process from holding the event loop open on a lock it no longer
      // owns.
      expect(redis.evalCalls.length).toBe(renewalsDuringRun);
    } finally {
      jest.useRealTimers();
    }
  });

  it('clears outstanding renewers on shutdown', async () => {
    jest.useFakeTimers();
    try {
      const redis = new FakeRedis();
      const svc = makeService(redis);
      let release!: () => void;
      const blocked = new Promise<void>((r) => {
        release = r;
      });
      const run = svc.run('cron.a', () => blocked, { ttlMs: 9_000 });

      // Let the run reach `startRenewing` before shutting down, otherwise
      // there is no timer to clear and the test proves nothing.
      await jest.advanceTimersByTimeAsync(0);

      await svc.onApplicationShutdown();
      const after = redis.evalCalls.length;
      await jest.advanceTimersByTimeAsync(30_000);
      expect(redis.evalCalls.length).toBe(after);

      release();
      await run;
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('@CronLocked wrapper', () => {
  const meta = { name: 'cron.test', ttlMs: TTL };

  it('delegates to the lock runner with the declared name and ttl', async () => {
    const original = jest.fn().mockResolvedValue('value');
    // Mirror the real service: invoke the handler it is given.
    const run = jest.fn(async (_n: string, h: () => Promise<unknown>) => ({
      executed: true,
      result: await h(),
    }));

    const wrapped = applyCronLock(original as any, meta);
    const res = await wrapped.call({ cronLock: { run } } as any);

    expect(run).toHaveBeenCalledWith('cron.test', expect.any(Function), meta);
    // Transparent: the handler's own value, not the lock bookkeeping.
    expect(res).toBe('value');
    expect(original).toHaveBeenCalledTimes(1);
  });

  it('resolves to undefined when the tick was skipped', async () => {
    // A cron declared `Promise<void>` must not start resolving to
    // `{ executed, result }` once it is wrapped.
    const run = jest.fn().mockResolvedValue({ executed: false });
    const original = jest.fn().mockResolvedValue('value');

    const wrapped = applyCronLock(original as any, meta);
    const res = await wrapped.call({ cronLock: { run } } as any);

    expect(res).toBeUndefined();
    expect(original).not.toHaveBeenCalled();
  });

  it('preserves `this` for the wrapped handler', async () => {
    // A cron handler routinely reads `this.someRepo`; an arrow-function
    // wrapper would silently lose the instance.
    class Svc {
      value = 42;
      async read() {
        return this.value;
      }
    }
    const inst = new Svc();
    inst.cronLock = {
      run: async (_n: string, h: () => Promise<unknown>) => ({
        executed: true,
        result: await h(),
      }),
    } as any;

    const wrapped = applyCronLock(Svc.prototype.read as any, meta);
    await expect(wrapped.call(inst as any)).resolves.toBe(42);
  });

  it('forwards arguments', async () => {
    const original = jest.fn().mockResolvedValue(undefined);
    const run = jest.fn(async (_n: string, h: () => Promise<unknown>) => ({
      executed: true,
      result: await h(),
    }));

    const wrapped = applyCronLock(original as any, meta);
    await wrapped.call({ cronLock: { run } } as any, 'a', 7);
    expect(original).toHaveBeenCalledWith('a', 7);
  });

  it('THROWS rather than running unguarded when cronLock is missing', async () => {
    // Wiring bug, not a runtime condition. Running the handler without the
    // lock is the exact outcome the lock exists to prevent, so this must
    // be loud instead of silently degrading.
    const original = jest.fn().mockResolvedValue('value');
    const wrapped = applyCronLock(original as any, meta);

    expect(() => wrapped.call({} as any)).toThrow(/cronLock/);
    expect(original).not.toHaveBeenCalled();
  });

  it('attaches metadata so the tripwire can read name and ttl', () => {
    class Target {
      @CronLocked('cron.meta', { ttlMs: 30_000 })
      async tick() {
        return 1;
      }
    }
    // Force decorator evaluation.
    void Target;

    const metaOnMethod = Reflect.getMetadata(
      CRON_LOCK_METADATA,
      Target.prototype.tick,
    );
    expect(metaOnMethod).toEqual({ name: 'cron.meta', ttlMs: 30_000 });
  });

  it('replaces the method with a wrapper, so the decorator is not decorative', async () => {
    class Target {
      raw() {
        return 'original';
      }
      @CronLocked('cron.meta', { ttlMs: 1_000 })
      guarded() {
        return 'original';
      }
    }
    void Target;

    const calls: unknown[] = [];
    const inst = new Target();
    inst.cronLock = {
      run: async (n: string, h: () => Promise<unknown>) => {
        calls.push(n);
        return { executed: true, result: await h() };
      },
    } as any;

    await inst.guarded();
    expect(calls).toEqual(['cron.meta']);
  });
});
