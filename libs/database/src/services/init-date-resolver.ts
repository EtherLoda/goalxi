import { EntityManager } from 'typeorm';
import { SystemConfigEntity } from '../entities/system-config.entity';
import { resolveGameStart, startOfUtcDay } from '../utils/game-clock';

/**
 * Key for the single row in `system_config` that pins the
 * game clock's anchor. Set once by the first `pnpm init:run`
 * and read by every subsequent boot of the settlement / api
 * services.
 *
 * Stored as `YYYY-MM-DD` (truncated to UTC midnight) so the
 * value is human-readable in `psql` and timezone-agnostic.
 */
export const SYSTEM_CONFIG_INIT_DATE_KEY = 'init_date';

/**
 * Resolve the "init date" — the calendar day the game
 * clock anchors to. Resolution order:
 *
 *   1. `system_config` row keyed `init_date` (authoritative
 *      once the init script has run). The init script
 *      writes this row last so a half-finished init doesn't
 *      lie about the date.
 *   2. `envValue` (the caller passes
 *      `process.env.GAME_START_DATE` here). Used for the
 *      first boot after a fresh DB, before the init script
 *      has had a chance to write the row.
 *   3. Today at UTC midnight — the dev fallback. Should
 *      never fire in production because the init script
 *      always writes the row and the env var is set.
 *
 * Returns the date at UTC midnight. Pure I/O — caller
 * provides the `EntityManager` (so it works inside a
 * transaction) and the env value (so tests can pin it).
 */
export async function resolveInitDate(
  manager: EntityManager,
  envValue?: string,
): Promise<Date> {
  const row = await manager.findOne(SystemConfigEntity, {
    where: { key: SYSTEM_CONFIG_INIT_DATE_KEY },
  });
  if (row) {
    const parsed = new Date(row.value);
    if (!isNaN(parsed.getTime())) {
      return startOfUtcDay(parsed);
    }
  }
  return resolveGameStart(envValue);
}

/**
 * Pure helper: given a calendar day, compute the
 * "season 1 week 1" anchor.
 *
 * Rule (per the design): the season enters its first
 * week at the **next upcoming Monday at 00:00:00 UTC**.
 * So:
 *   - Mon 2026-09-07 → Mon 2026-09-14 (+7 days)
 *   - Tue 2026-09-08 → Mon 2026-09-14 (+6 days)
 *   - Wed 2026-09-09 → Mon 2026-09-14 (+5 days)
 *   - Sun 2026-09-13 → Mon 2026-09-14 (+1 day)
 *
 * This Monday is the **week boundary**, NOT a match
 * time. The schedule generator then places matches on
 * Wednesday 20:00 UTC and Saturday 15:00 UTC of each
 * week (the historical `seed-main` cadence — 2
 * fixtures × 15 weeks = 30 rounds for a 16-team
 * league). Keeping matchday cadence the same and
 * changing only the *week anchor* preserves every
 * downstream consumer (match preprocessor, weekly
 * settlement, news cron) that already keys off
 * "this week's Wed/Sat".
 *
 * Chinese-spec phrasing: "下周周一 0 点" — the
 * Monday of the next calendar week, at 00:00 UTC.
 * For a Sun init the next-day Monday IS the
 * "next week" (the current week is just ending);
 * for a Mon init we always push +7 so the
 * "current" Monday isn't doubled up.
 */
export function computeSeasonWeekOneMonday(initDate: Date): Date {
  const day = startOfUtcDay(initDate);
  // 0 = Sunday, 1 = Monday, ... 6 = Saturday in JS getDay()
  const dayOfWeek = day.getUTCDay();
  // Days until the next Monday:
  //   Mon (1) → 7 (push a full week, never "today")
  //   Sun (0) → 1
  //   otherwise → (8 - dayOfWeek) % 7
  const daysToNextMonday = dayOfWeek === 1 ? 7 : (8 - dayOfWeek) % 7;
  return new Date(day.getTime() + daysToNextMonday * 24 * 60 * 60 * 1000);
}
