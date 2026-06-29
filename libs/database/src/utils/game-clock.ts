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

/**
 * Absolute game-day count from `GAME_EPOCH` to `now` (or the supplied date).
 * Pure function — safe to call from entity getters.
 */
export function currentGameDay(now: Date = new Date()): number {
  return Math.floor((now.getTime() - GAME_EPOCH.getTime()) / MS_PER_GAME_DAY);
}