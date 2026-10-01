import { CronLockService } from '../common/cron-lock/cron-lock.service';

/**
 * Pass-through `CronLockService` for scheduler specs.
 *
 * Every scheduler cron is decorated `@CronLocked`, so its handler is a
 * wrapper that calls `this.cronLock.run(...)`. Specs that invoke a cron
 * method directly therefore need a `cronLock` on the instance, or the
 * wrapper throws "Refusing to run the cron unguarded".
 *
 * This mock always acquires. That is the right default for a unit test:
 * the lock's own behaviour is covered in `cron-lock.spec.ts` against a
 * fake Redis, and a spec that cared about exclusion would be testing the
 * lock, not the cron.
 *
 * Use it in `Test.createTestingModule({ providers: [...] })` alongside
 * the service under test.
 */
export const passThroughCronLock = {
  run: async (_name: string, handler: () => Promise<unknown>) => ({
    executed: true,
    result: await handler(),
  }),
  acquire: () =>
    Promise.resolve({ status: 'acquired' as const, token: 'test' }),
  release: () => Promise.resolve(undefined),
};

/**
 * Pass-through `CronLockService` for specs that build their subject with
 * `Test.createTestingModule`.
 */
export const cronLockPassThrough = {
  provide: CronLockService,
  useValue: passThroughCronLock,
};
