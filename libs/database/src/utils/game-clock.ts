/**
 * Game-world clock utilities. All game-time computations anchor to a fixed
 * epoch so absolute day counts are stable across weeks / seasons / real-world
 * calendar shifts.
 *
 * 1 game-day = 1 real-day.
 * 1 game-year = GAME_SETTINGS.DAYS_PER_YEAR (112) game-days = 112 real-days.
 *
 * Note: This is intentionally distinct from `GameStateService.getCurrentSeasonWeek`
 * which uses a rolling "most recent Wednesday" anchor for match scheduling.
 * Player age is anchored to the fixed epoch so `createdDay` never shifts.
 */

/**
 * Epoch for absolute game-day counting. All `createdDay` values are measured
 * from this point. Changing this constant would shift every player's stored
 * age — pick a value once and treat it as immutable.
 *
 * Set to 1970-01-01 (Unix epoch) so `currentGameDay()` is always comfortably
 * larger than `daysAlive` for any plausible player age — even a 50-year-old
 * (5600 days) is well below ~20000.
 */
export const GAME_EPOCH = new Date('1970-01-01T00:00:00Z');

export const MS_PER_GAME_DAY = 24 * 60 * 60 * 1000;
export const DAYS_PER_WEEK = 7;
export const MS_PER_GAME_WEEK = DAYS_PER_WEEK * MS_PER_GAME_DAY;

/**
 * Absolute game-day count from `GAME_EPOCH` to `now` (or the supplied date).
 * Pure function — safe to call from entity getters.
 */
export function currentGameDay(now: Date = new Date()): number {
  return Math.floor((now.getTime() - GAME_EPOCH.getTime()) / MS_PER_GAME_DAY);
}

/**
 * Week index since epoch — `floor(currentGameDay() / 7)`. Used as the
 * bucketing key for weekly-reset state (e.g. the scout draw counter
 * on `TeamEntity`). 0 for the first week after 1970-01-01.
 */
export function currentWeekIndex(now: Date = new Date()): number {
  return Math.floor(currentGameDay(now) / DAYS_PER_WEEK);
}

/**
 * Absolute timestamp at the end of the current game-week (i.e. the
 * instant the next week starts). Used as the candidate TTL so the
 * inbox auto-prunes at the week boundary rather than after a fixed
 * 7-day window — keeps "week boundary" semantics consistent across
 * cron and manual draws.
 */
export function endOfCurrentWeek(now: Date = new Date()): Date {
  const week = currentWeekIndex(now);
  return new Date(GAME_EPOCH.getTime() + (week + 1) * MS_PER_GAME_WEEK);
}