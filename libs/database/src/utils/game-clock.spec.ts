import {
  currentGameDay,
  currentSeasonWeek,
  currentWeekIndex,
  DEFAULT_GAME_START,
  endOfCurrentWeek,
  GAME_EPOCH,
  MS_PER_GAME_DAY,
  MS_PER_GAME_WEEK,
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
      // Sanity check: game-day counts are big positive numbers.
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
      // 5 days later = week 0 boundary.
      expect(end.getTime()).toBe(GAME_EPOCH.getTime() + MS_PER_GAME_WEEK);
    });
  });

  describe('currentSeasonWeek', () => {
    it('returns season 1, week 1 on the very first week after the start', () => {
      const { season, week } = currentSeasonWeek(
        new Date(DEFAULT_GAME_START.getTime()),
      );
      expect(season).toBe(1);
      expect(week).toBe(1);
    });

    it('rolls into week 2 exactly one real-world week later', () => {
      const { season, week } = currentSeasonWeek(
        new Date(DEFAULT_GAME_START.getTime() + MS_PER_GAME_WEEK),
      );
      expect(season).toBe(1);
      expect(week).toBe(2);
    });

    it('returns season 2 on the first week of the second season', () => {
      const seasonLengthWeeks = GAME_SETTINGS.SEASON_LENGTH_WEEKS;
      const { season, week } = currentSeasonWeek(
        new Date(
          DEFAULT_GAME_START.getTime() + seasonLengthWeeks * MS_PER_GAME_WEEK,
        ),
      );
      expect(season).toBe(2);
      expect(week).toBe(1);
    });

    it('returns the final week of a season correctly (no off-by-one)', () => {
      const seasonLengthWeeks = GAME_SETTINGS.SEASON_LENGTH_WEEKS;
      // Last week of season 1 = the week *before* season 2 starts.
      const { season, week } = currentSeasonWeek(
        new Date(
          DEFAULT_GAME_START.getTime() +
            (seasonLengthWeeks - 1) * MS_PER_GAME_WEEK,
        ),
      );
      expect(season).toBe(1);
      expect(week).toBe(seasonLengthWeeks);
    });

    it('handles a custom gameStart (test injection)', () => {
      // Pretend the game started on a Wednesday 10 weeks ago.
      const tenWeeksAgoStart = new Date(
        Date.now() - 10 * MS_PER_GAME_WEEK,
      );
      const { season, week } = currentSeasonWeek(new Date(), tenWeeksAgoStart);
      // 10 weeks elapsed, in a 16-week season → still season 1, week 11.
      expect(season).toBe(1);
      expect(week).toBe(11);
    });

    it('all callers see the same answer for the same instant (regression for #16)', () => {
      // This is the actual bug we fixed: 4 hard-coded copies of
      // 2026-04-06 plus GameStateService's "most recent Wednesday"
      // math produced different season/week on the same input. The
      // pure function is the single source of truth now; this test
      // guards against a future regression that re-introduces a
      // second algorithm.
      const now = new Date('2026-08-06T12:00:00Z');
      const a = currentSeasonWeek(now);
      const b = currentSeasonWeek(now);
      const c = currentSeasonWeek(now, new Date(DEFAULT_GAME_START));
      expect(a).toEqual(b);
      expect(a).toEqual(c);
      // Sanity: on 2026-08-06 anchored to 2026-04-06, we are
      // exactly 17 weeks in → season 2, week 2.
      expect(a).toEqual({ season: 2, week: 2 });
    });
  });
});
