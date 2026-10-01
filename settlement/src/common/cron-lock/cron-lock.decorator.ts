import { SetMetadata } from '@nestjs/common';
import type { CronLockOptions } from './cron-lock.service';
/**
 * Metadata key read by the cron-lock wiring tripwire in
 * `settlement/src/processors/processor-wiring.spec.ts`. Declared here so
 * the decorator and the test cannot drift apart.
 */
export const CRON_LOCK_METADATA = 'goalxi:cron-lock';

export interface CronLockMetadata extends CronLockOptions {
  name: string;
}

/**
 * Runs a `@Cron` handler under the distributed lock in
 * `CronLockService`.
 *
 * The handler body is untouched — the decorator wraps `descriptor.value`
 * so the guard is a single added line per cron, not a re-indented
 * closure. That matters here: 16 handlers, several hundreds of lines
 * total, and re-indenting them would bury a security-relevant change in
 * whitespace noise.
 *
 * ## Ordering — `@CronLocked` goes BELOW `@Cron`
 *
 * Decorators apply bottom-up, so the wrapper must be installed first and
 * `@Cron` must then attach its metadata to the wrapper:
 *
 * ```ts
 * @Cron('0 0 * * 1', { timeZone: GAME_SETTINGS.CRON_TIME_ZONE })
 * @CronLocked('season-transition.playoffs', { ttlMs: 60_000 })
 * async checkAndGeneratePlayoffs() {}
 * ```
 *
 * Reversed, `@Cron` would attach to the inner method, Nest would
 * schedule the UNGUARDED original, and the lock would be decorative.
 * The tripwire test asserts this pairing.
 *
 * ## Injection
 *
 * The wrapper reads `this.cronLock`, so the host class must expose it:
 *
 * ```ts
 * @Inject(CronLockService) private readonly cronLock: CronLockService;
 * ```
 *
 * `CronLockModule` is `@Global()`, so no per-module import is needed.
 */
export const CronLocked = (name: string, opts: CronLockOptions) => {
  const meta: CronLockMetadata = { name, ...opts };

  return (
    target: object,
    key: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor => {
    // Wrap FIRST, then attach metadata.
    //
    // `SetMetadata` calls `Reflect.defineMetadata(key, value,
    // descriptor.value)` — it binds to whatever function is in
    // `descriptor.value` AT THAT MOMENT. Setting metadata first and
    // wrapping second silently discards it along with the original
    // function. Order matters here.
    descriptor.value = applyCronLock(
      descriptor.value as (...args: unknown[]) => Promise<unknown>,
      meta,
    );
    SetMetadata(CRON_LOCK_METADATA, meta)(target, key, descriptor);

    return descriptor;
  };
};

/**
 * The shape the wrapper depends on. Declared structurally rather than
 * importing `CronLockService` so a plain object satisfies it in tests.
 */
export interface CronLockRunner {
  run<T>(
    name: string,
    handler: () => Promise<T>,
    opts: CronLockOptions,
  ): Promise<{ executed: boolean; result?: T }>;
}

/** Property name the wrapper reads the lock runner from. */
export const CRON_LOCK_PROP = 'cronLock' as const;

/**
 * Installs the guard. Applied by {@link CronLocked}.
 *
 * ## Transparency
 *
 * The wrapper returns the handler's OWN value, not
 * `CronLockRun`. `CronLockService.run` reports `executed: false` when it
 * skips a tick, which resolves to `undefined` here — indistinguishable
 * from a `void` handler, and that is correct: a skipped cron did
 * nothing. Returning the wrapper object instead would leak
 * `{ executed, result }` out of a method declared `Promise<void>`.
 *
 * Exported for unit tests that need to wrap a handler without going
 * through Nest's decorator pipeline.
 */
export function applyCronLock<T>(
  original: (...args: unknown[]) => Promise<T>,
  meta: CronLockMetadata,
): (...args: unknown[]) => Promise<T | undefined> {
  // Deliberately a `function`, not an arrow: the wrapped handler is a
  // class method and needs the instance as `this`.
  return function wrapped(
    this: Record<string, CronLockRunner>,
    ...args: unknown[]
  ): Promise<T | undefined> {
    const lock = this?.[CRON_LOCK_PROP];
    if (!lock) {
      // Fail loudly rather than silently running unguarded. This is a
      // wiring bug, not a runtime condition, and running the handler
      // without the lock is precisely the outcome the lock exists to
      // prevent.
      throw new Error(
        `@CronLocked('${meta.name}') requires a '${CRON_LOCK_PROP}' property ` +
          `on the host class (e.g. '@Inject(CronLockService) private readonly ` +
          `cronLock: CronLockService'). Refusing to run the cron unguarded.`,
      );
    }
    // `original` is invoked with the instance as receiver via `.apply`,
    // matching how Nest invokes an unbound cron handler.
    //
    // `CronLockRunner.run` is generic, but it is declared on the
    // structural interface above with `T` inferred as `unknown` at this
    // call site, so the outcome needs re-widening to `T`.
    return lock
      .run(
        meta.name,
        () => original.apply(this, args) as Promise<unknown>,
        meta,
      )
      .then((outcome) => outcome.result as T | undefined);
  };
}
