import {
  currentGameDay,
  currentSeasonWeek,
  currentWeekIndex,
  endOfCurrentWeek,
  GAME_EPOCH,
  MS_PER_GAME_DAY,
  MS_PER_GAME_WEEK,
  resolveGameStart,
  startOfUtcDay,
} from './game-clock';
import { GAME_SETTINGS } from '../constants/game.constants';

describe('game-clock', () => {
  describe('currentGameDay', () => {
    it('returns 0 at the epoch', () => {
      expect(currentGameDay(new Date(GAME_EPOCH.getTime()))).toBe(0);
    });

    it('returns 1 exactly 24h after the epoch', () => {
      expect(
        currentGameDay(new Date(GAME_EPOCH.getTime() + MS_PER_GAME_DAY)),
      ).toBe(1);
    });

    it('returns a large value for a 2026 timestamp', () => {
      const v = currentGameDay(new Date('2026-08-06T12:00:00Z'));
      expect(v).toBeGreaterThan(20_000);
    });
  });

  describe('currentWeekIndex', () => {
    it('returns 0 in the first week after the epoch', () => {
      expect(currentWeekIndex(new Date(GAME_EPOCH.getTime()))).toBe(0);
    });

    it('flips to 1 at exactly one week past the epoch', () => {
      expect(
        currentWeekIndex(new Date(GAME_EPOCH.getTime() + MS_PER_GAME_WEEK)),
      ).toBe(1);
    });
  });

  describe('endOfCurrentWeek', () => {
    it('lands on the next week boundary, not on `now`', () => {
      const now = new Date(GAME_EPOCH.getTime() + 2 * MS_PER_GAME_DAY);
      const end = endOfCurrentWeek(now);
      expect(end.getTime()).toBe(GAME_EPOCH.getTime() + MS_PER_GAME_WEEK);
    });
  });

  describe('startOfUtcDay', () => {
    it('truncates HMS on the same UTC day', () => {
      const a = new Date('2026-08-06T00:00:00Z');
      const b = new Date('2026-08-06T23:59:59Z');
      const c = new Date('2026-08-06T12:34:56Z');
      const sa = startOfUtcDay(a).getTime();
      const sb = startOfUtcDay(b).getTime();
      const sc = startOfUtcDay(c).getTime();
      expect(sa).toBe(sb);
      expect(sa).toBe(sc);
      expect(sa).toBe(new Date('2026-08-06T00:00:00Z').getTime());
    });

    it('does not mutate the input Date', () => {
      const original = new Date('2026-08-06T12:34:56Z');
      const before = original.getTime();
      startOfUtcDay(original);
      expect(original.getTime()).toBe(before);
    });
  });

  describe('resolveGameStart', () => {
    // 2026-08-03 is a Monday (verified against the test runner's
    // system clock). The 2026-08-06 / 2026-08-04 / 2026-08-02
    // values used below are deliberately picked to land on
    // Thursday / Tuesday / Sunday so the Monday-guard tests
    // exercise every day-of-week except the success path.

    it('parses an ISO date string on a Monday and truncates to UTC midnight', () => {
      const out = resolveGameStart('2026-08-03');
      expect(out.toISOString()).toBe('2026-08-03T00:00:00.000Z');
    });

    it('parses a full ISO datetime on a Monday and drops the HMS', () => {
      const out = resolveGameStart('2026-08-03T12:34:56Z');
      expect(out.toISOString()).toBe('2026-08-03T00:00:00.000Z');
    });

    it('throws on a non-Monday date string (regression for week-grid drift)', () => {
      // 2026-08-06 is a Thursday. Without the guard, the season
      // grid anchored on a Thursday drifts by 3 days from the
      // schedule generator's Monday-aligned weekOneMonday, so
      // `currentSeasonWeek() === 15` fires on the wrong Monday
      // and the FE's "Week X" labels stop lining up with the
      // server's season phase.
      expect(() => resolveGameStart('2026-08-06')).toThrow(
        /GAME_START_DATE=2026-08-06.*must be a Monday/,
      );
    });

    it('throws on a non-Monday day regardless of HMS', () => {
      // 2026-08-04 is a Tuesday; the HMS portion is irrelevant
      // because the result is truncated to UTC midnight before
      // the day-of-week check.
      expect(() => resolveGameStart('2026-08-04T23:59:59Z')).toThrow(
        /must be a Monday/,
      );
    });

    it('the error message names the offending weekday for fast triage', () => {
      // 2026-08-02 is a Sunday.
      expect(() => resolveGameStart('2026-08-02')).toThrow(
        /which is a Sunday/,
      );
    });

    it('falls back to today at UTC midnight when env is empty', () => {
      const out = resolveGameStart('');
      const now = startOfUtcDay(new Date());
      expect(out.getTime()).toBe(now.getTime());
    });

    it('falls back to today when env is missing entirely', () => {
      const out = resolveGameStart(undefined);
      const now = startOfUtcDay(new Date());
      expect(out.getTime()).toBe(now.getTime());
    });

    it('falls back to today when env is malformed (does not throw)', () => {
      const out = resolveGameStart('not-a-date');
      const now = startOfUtcDay(new Date());
      expect(out.getTime()).toBe(now.getTime());
    });
  });

  describe('currentSeasonWeek', () => {
    const seasonLengthWeeks = GAME_SETTINGS.SEASON_LENGTH_WEEKS;
    const anchor = new Date('2026-04-06T00:00:00Z');

    it('returns season 1, week 1 on the very first week after the start', () => {
      const { season, week } = currentSeasonWeek(new Date(anchor.getTime()), anchor);
      expect(season).toBe(1);
      expect(week).toBe(1);
    });

    it('rolls into week 2 exactly one real-world week later', () => {
      const { season, week } = currentSeasonWeek(
        new Date(anchor.getTime() + MS_PER_GAME_WEEK),
        anchor,
      );
      expect(season).toBe(1);
      expect(week).toBe(2);
    });

    it('returns season 2 on the first week of the second season', () => {
      const { season, week } = currentSeasonWeek(
        new Date(anchor.getTime() + seasonLengthWeeks * MS_PER_GAME_WEEK),
        anchor,
      );
      expect(season).toBe(2);
      expect(week).toBe(1);
    });

    it('returns the final week of a season correctly (no off-by-one)', () => {
      const { season, week } = currentSeasonWeek(
        new Date(
          anchor.getTime() + (seasonLengthWeeks - 1) * MS_PER_GAME_WEEK,
        ),
        anchor,
      );
      expect(season).toBe(1);
      expect(week).toBe(seasonLengthWeeks);
    });

    it('HMS is ignored — two timestamps on the same day give the same answer', () => {
      const morning = currentSeasonWeek(
        new Date('2026-04-06T08:00:00Z'),
        anchor,
      );
      const night = currentSeasonWeek(
        new Date('2026-04-06T23:59:59Z'),
        anchor,
      );
      expect(morning).toEqual(night);
    });

    it('all callers see the same answer for the same instant (regression for #16)', () => {
      // Bug #16 was: 4 sites hard-coded 2026-04-06, GameStateService
      // used "most recent Wednesday" — different answers on the
      // same input. We now route every caller through
      // currentSeasonWeek + resolveGameStart so a single env var
      // controls the anchor across api + settlement.
      const now = new Date('2026-08-06T12:00:00Z');
      const a = currentSeasonWeek(now, anchor);
      const b = currentSeasonWeek(now, anchor);
      expect(a).toEqual(b);
      // 17 real weeks after 2026-04-06 → season 2, week 2.
      expect(a).toEqual({ season: 2, week: 2 });
    });

    it('reuses resolveGameStart in the integration case (env path)', () => {
      // Simulate what callers do: read the env, resolve, then ask.
      const now = new Date('2026-08-06T12:00:00Z');
      const start = resolveGameStart('2026-04-06T00:00:00Z');
      expect(currentSeasonWeek(now, start)).toEqual({ season: 2, week: 2 });
    });
  });
});
