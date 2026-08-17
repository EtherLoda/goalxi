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
 * "season 1 first kickoff" instant.
 *
 * Rule (per the design): the first match of the season
 * is **the next upcoming Monday** at 00:00:00 UTC. So:
 *   - Mon 2026-09-07 → Mon 2026-09-14 (+7 days)
 *   - Tue 2026-09-08 → Mon 2026-09-14 (+6 days)
 *   - Wed 2026-09-09 → Mon 2026-09-14 (+5 days)
 *   - Sun 2026-09-13 → Mon 2026-09-14 (+1 day)
 *
 * The Chinese-spec phrasing "下周周一 0 点" reads as
 * "the next Monday at 00:00" — always the very next
 * Monday on or after the init date, not the one *after*
 * next. This gives a manager a 1-7 day buffer to claim
 * a team and submit tactics depending on when they run
 * the init.
 *
 * The returned Date is in UTC; callers in `MatchEntity`
 * schedule the rest of the round-robin off this anchor
 * (1 round per week, 7-day spacing).
 */
export function computeFirstMatchAt(initDate: Date): Date {
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
