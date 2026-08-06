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
 * Truncate a Date to UTC midnight (00:00:00.000Z). The season/week
 * grid is day-aligned so two timestamps on the same UTC day produce
 * the same answer. The clock's HMS component is intentionally
 * dropped — `12:34:56Z` and `23:59:59Z` on the same day both
 * resolve to the same `gameStart`.
 */
export function startOfUtcDay(d: Date): Date {
  const out = new Date(d.getTime());
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

/**
 * Resolve the game start date for this process.
 *
 * Sources, in priority order:
 *   1. `envValue` (i.e. `process.env.GAME_START_DATE` from the caller)
 *      — accepted as either an ISO date string (`2026-08-06`,
 *      `2026-08-06T12:34:56Z`) or anything `new Date(...)` can
 *      parse. Truncated to UTC midnight.
 *   2. today at UTC midnight (dev fallback).
 *
 * Production: set `GAME_START_DATE=YYYY-MM-DD` in the deploy env so
 * every replica agrees on the anchor and a restart doesn't reset
 * the season. Without it, an instance restart re-anchors to
 * "today", which would split data across weeks if a cron tick
 * straddles the restart.
 *
 * `main.ts` (in api + settlement) reads the same env and WARN-logs
 * loudly when the fallback fires, so the missing-config case is
 * obvious in the boot logs.
 */
export function resolveGameStart(envValue?: string): Date {
  if (envValue && envValue.trim().length > 0) {
    const parsed = new Date(envValue);
    if (!isNaN(parsed.getTime())) {
      return startOfUtcDay(parsed);
    }
    // Malformed env — fall through to the auto fallback. The
    // WARN log in main.ts will already have flagged this string
    // as unparseable, so we don't duplicate the noise here.
  }
  return startOfUtcDay(new Date());
}

/**
 * Pure: returns the current season + week (1-indexed) for a given
 * real-world timestamp, anchored to `gameStart`.
 *
 * Replaces 4 previously-divergent implementations (the consolidation
 * landed in the same commit; this doc keeps the rationale for future
 * readers). The 5 callers in production all reach this function via
 * `resolveGameStart(process.env.GAME_START_DATE)` so a single env
 * var controls the anchor across api + settlement.
 *
 * `gameStart` is a parameter so tests can pin the clock. In
 * production, leave the default and let the caller pass the
 * resolved value from `resolveGameStart`.
 */
export function currentSeasonWeek(
  now: Date = new Date(),
  gameStart: Date = startOfUtcDay(new Date()),
): { season: number; week: number } {
  const weeksElapsed = Math.floor(
    (now.getTime() - gameStart.getTime()) / MS_PER_GAME_WEEK,
  );
  return {
    season: Math.floor(weeksElapsed / GAME_SETTINGS.SEASON_LENGTH_WEEKS) + 1,
    week: (weeksElapsed % GAME_SETTINGS.SEASON_LENGTH_WEEKS) + 1,
  };
}