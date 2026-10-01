import {
  Global,
  Inject,
  Injectable,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Key namespace for cron locks. Namespaced so an operator can
 * `KEYS cronlock:*` to see which ticks are in flight, and so
 * `DEL cronlock:*` is an available (if blunt) recovery tool after a
 * hard kill.
 */
export const CRON_LOCK_PREFIX = 'cronlock:';

/**
 * Release only if we still own the lock.
 *
 * Without the token comparison a slow handler whose TTL already expired
 * would delete the lock a DIFFERENT process has since acquired — turning
 * a lost race into two concurrent runs, which is the exact failure this
 * service exists to prevent.
 */
const RELEASE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`;

/**
 * Extend the TTL only if we still own the lock. Same token guard as
 * release: renewing a lock someone else holds would keep THEIR critical
 * section alive from under them.
 */
const RENEW_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("PEXPIRE", KEYS[1], ARGV[2])
else
  return 0
end
`;

export interface CronLockOptions {
  /**
   * How long the lock stays valid without a renewal, in ms.
   *
   * This is the safety net for a process that dies mid-tick: the lock
   * must expire on its own so the work is retried rather than stranded
   * forever. The renewer normally keeps pushing it out, so in practice
   * this is "how long until a crashed holder is assumed dead".
   */
  ttlMs: number;
}

export type AcquireResult =
  /** We hold the lock; `token` must be presented to release/renew. */
  | { status: 'acquired'; token: string }
  /** Another live holder has it. Skip this tick. */
  | { status: 'held' }
  /** Redis was unreachable. Run anyway — see `CronLockService.acquire`. */
  | { status: 'unavailable' };

export interface CronLockRun<T> {
  /** False when the tick was skipped because another holder had the lock. */
  executed: boolean;
  /** The handler's return value, or undefined when skipped. */
  result?: T;
}

/**
 * Distributed lock for settlement cron handlers.
 *
 * ## Why
 *
 * Until Phase 0 the api process ALSO booted settlement's `SchedulerModule`
 * and ran these same handlers, so every settlement cron fired twice in two
 * processes with nothing stopping the second run. Phase 0 removed that
 * second owner. This service closes the general case: two settlement
 * replicas, a restart during a tick, or a slow tick overlapping the next.
 *
 * Several of these handlers are explicitly NOT safe to run twice and have
 * no database-level guard:
 *
 *   - `season-transition` `checkAndProcessSeasonStart` — 5 ordered steps;
 *     a mid-sequence failure re-runs promotions and UN-SWAPs every pair
 *   - `promotion-relegation` `processAllTiers` — 5+ unwrapped writes,
 *     and `swapTeamLeague` is not commutative
 *   - `league-standing` `initNewSeasonStandings` — per-row saves
 *   - `league-admin` `addTeamToLeague` — 3 unwrapped writes
 *
 * Handlers that DO have a guard (`match-scheduler`'s conditional UPDATE,
 * the `playoff_swapped_at` latch, `league-award`'s event-existence check,
 * and the BullMQ business-key `jobId`s used by `weekly-settlement`) are
 * locked too. The point is that safety stops depending on every future
 * author remembering to add a latch.
 *
 * ## What this is NOT
 *
 * A mutual-exclusion lock, not a work queue. It does not make handlers
 * idempotent, does not guarantee a tick runs, and does not survive a
 * Redis flush. A holder that dies mid-tick has its partial writes
 * committed — that risk is addressed separately (transaction boundaries
 * and durable latches), not here.
 */
@Injectable()
export class CronLockService implements OnApplicationShutdown {
  private readonly redis: Redis;
  private readonly renewers = new Map<string, NodeJS.Timeout>();

  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    config: ConfigService,
  ) {
    this.redis = new Redis({
      host: config.getOrThrow<string>('REDIS_HOST'),
      port: config.getOrThrow<number>('REDIS_PORT'),
      password: config.getOrThrow<string>('REDIS_PASSWORD'),
      tls: config.get('REDIS_TLS_ENABLED') === 'true' ? {} : undefined,
    });
  }

  static buildKey(name: string): string {
    return `${CRON_LOCK_PREFIX}${name}`;
  }

  /**
   * Try to take the lock.
   *
   * A Redis failure returns `unavailable` rather than throwing, and the
   * caller runs the handler anyway. Failing closed would freeze the game
   * clock whenever Redis blipped; failing open degrades to the pre-P1
   * behaviour, which is recoverable. The alternative — letting the error
   * propagate — is worse still: settlement's global exception filter is
   * `@Catch()`-all and only logs, so the tick would vanish silently.
   */
  async acquire(name: string, ttlMs: number): Promise<AcquireResult> {
    const key = CronLockService.buildKey(name);
    const token = randomToken();

    try {
      const ok = await this.redis.set(key, token, 'PX', ttlMs, 'NX');
      return ok === 'OK' ? { status: 'acquired', token } : { status: 'held' };
    } catch (err) {
      this.logger.error(
        { cron: name, err: (err as Error)?.message },
        'Cron lock unavailable — running handler WITHOUT a lock (fail-open)',
      );
      return { status: 'unavailable' };
    }
  }

  async release(name: string, token: string): Promise<void> {
    try {
      await this.redis.eval(
        RELEASE_SCRIPT,
        1,
        CronLockService.buildKey(name),
        token,
      );
    } catch (err) {
      // The TTL will clean it up. Nothing to do but note it.
      this.logger.warn(
        { cron: name, err: (err as Error)?.message },
        'Cron lock release failed; relying on TTL expiry',
      );
    }
  }

  /**
   * Run `handler` under the lock.
   *
   * When the lock is held elsewhere, logs at debug and returns
   * `{ executed: false }` WITHOUT running the handler and WITHOUT
   * throwing. Not throwing is deliberate: settlement's global exception
   * filter is `@Catch()`-all and only logs, so a thrown "could not
   * acquire" would vanish and leave the tick silently skipped.
   */
  async run<T>(
    name: string,
    handler: () => Promise<T>,
    opts: CronLockOptions,
  ): Promise<CronLockRun<T>> {
    const acquired = await this.acquire(name, opts.ttlMs);

    if (acquired.status === 'held') {
      this.logger.debug(
        { cron: name },
        'Cron lock held elsewhere; skipping tick',
      );
      return { executed: false };
    }

    const failOpen = acquired.status === 'unavailable';
    const stopRenewing = failOpen
      ? () => undefined
      : this.startRenewing(name, acquired.token, opts.ttlMs);
    const startedAt = Date.now();

    try {
      const result = await handler();
      this.logger.info(
        { cron: name, durationMs: Date.now() - startedAt, failOpen },
        'Cron tick complete',
      );
      return { executed: true, result };
    } finally {
      stopRenewing();
      if (!failOpen) await this.release(name, acquired.token);
    }
  }

  /**
   * Keep pushing the TTL out while the handler runs.
   *
   * Without this the TTL must be sized for the worst case, and a static
   * guess is wrong in both directions: too short and the lock expires
   * mid-run (two processes in the critical section at once — the failure
   * this service exists to prevent), too long and a crashed holder blocks
   * the next tick for that whole window.
   *
   * Renewal failure is logged and ignored: the handler is already
   * running and must not be interrupted. Worst case is the TTL lapsing,
   * which is the same exposure as having no renewer.
   */
  private startRenewing(
    name: string,
    token: string,
    ttlMs: number,
  ): () => void {
    // Renew at a third of the TTL so two consecutive failures still
    // leave one retry inside the window.
    const intervalMs = Math.max(1000, Math.floor(ttlMs / 3));
    const timer = setInterval(() => {
      void this.redis
        .eval(
          RENEW_SCRIPT,
          1,
          CronLockService.buildKey(name),
          token,
          String(ttlMs),
        )
        .catch((err: Error) => {
          this.logger.warn(
            { cron: name, err: err.message },
            'Cron lock renewal failed; lock may lapse mid-tick',
          );
        });
    }, intervalMs);

    // Do not hold the event loop open for the sake of a lock.
    timer.unref?.();
    this.renewers.set(name, timer);

    return () => {
      clearInterval(timer);
      this.renewers.delete(name);
    };
  }

  async onApplicationShutdown(): Promise<void> {
    for (const timer of this.renewers.values()) clearInterval(timer);
    this.renewers.clear();
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}

/** Unambiguous token: cannot collide with another holder's token. */
function randomToken(): string {
  return `${process.pid}:${Date.now().toString(36)}:${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

@Global()
@Module({
  providers: [CronLockService],
  exports: [CronLockService],
})
export class CronLockModule {}
