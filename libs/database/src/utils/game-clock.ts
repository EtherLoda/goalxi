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

import { GAME_SETTINGS } from '../constants/game.constants';

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

/**
 * Anchor for season/week arithmetic. Every consumer that previously
 * hard-coded `'2026-04-06T00:00:00Z'` (4 sites across `api` and
 * `settlement`) now reads this constant. Tests inject a different
 * `gameStart` via the `currentSeasonWeek(now, start)` overload.
 *
 * Treat as immutable post-launch: shifting it rewrites the season
 * every cron / API call writes to, so all in-flight transactions
 * land in the wrong week until the cache catches up.
 */
export const DEFAULT_GAME_START = new Date('2026-04-06T00:00:00Z');

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

/**
 * Pure: returns the current season + week (1-indexed) for a given
 * real-world timestamp, anchored to `gameStart` (defaults to
 * `DEFAULT_GAME_START`).
 *
 * Replaces 4 previously-divergent implementations:
 *   - `api/src/api/staffs/staffs.service.ts` (was hard-coded 2026-04-06)
 *   - `settlement/src/processors/training.processor.ts` (same)
 *   - `settlement/src/scheduler/finance-scheduler.service.ts` (same)
 *   - `api/src/api/game/game-state.service.ts` (was a different
 *     algorithm — "most recent Wednesday" — that produced a
 *     different season/week from the other three on the same input)
 *
 * The bug the old divergence caused: on the same real-world instant,
 * a staff renewal could write to season 1 while a settlement tick
 * for the same team wrote to season 2. Consolidating to one pure
 * function (and having all callers use it) closes the data split.
 *
 * `gameStart` is a parameter so tests can pin the clock. In
 * production, leave the default.
 */
export function currentSeasonWeek(
  now: Date = new Date(),
  gameStart: Date = DEFAULT_GAME_START,
): { season: number; week: number } {
  const weeksElapsed = Math.floor(
    (now.getTime() - gameStart.getTime()) / MS_PER_GAME_WEEK,
  );
  return {
    season: Math.floor(weeksElapsed / GAME_SETTINGS.SEASON_LENGTH_WEEKS) + 1,
    week: (weeksElapsed % GAME_SETTINGS.SEASON_LENGTH_WEEKS) + 1,
  };
}