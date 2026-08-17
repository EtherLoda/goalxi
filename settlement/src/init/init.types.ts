/**
 * Options for the one-shot `pnpm init:run` script.
 *
 * Built in the CLI entry point (`settlement/scripts/init.ts`)
 * from `process.argv` flags and passed to `InitService.run()`.
 * The CLI is the only caller today; the option bag exists so
 * tests can call `InitService.run` directly without spawning
 * a subprocess.
 */
export interface InitOptions {
  /**
   * Calendar day the init is "anchored" to. Stored in
   * `system_config.init_date` and used to compute the first
   * match instant (next-Monday 00:00 UTC). Required — the
   * CLI rejects a missing value rather than silently
   * defaulting to today.
   */
  initDate: Date;

  /**
   * `--force`: drop every row from every game table and
   * rebuild from scratch. Idempotent without it (the
   * existing data is preserved). Wipe uses DELETE (with
   * CASCADE for FKs) — schema is left intact.
   */
  force: boolean;

  /**
   * `--wipe-only`: drop all data and exit without
   * rebuilding. Useful for an ops engineer who wants to
   * wipe a half-corrupted DB and re-init in a separate
   * step.
   */
  wipeOnly: boolean;

  /**
   * `--small`: build a 1-L1 + 1-L2 = 32-team pyramid
   * instead of the full 85-league / 1360-team pyramid.
   * Local-dev-friendly (runs in seconds instead of
   * minutes). The full pyramid is the production default.
   */
  small: boolean;
}
