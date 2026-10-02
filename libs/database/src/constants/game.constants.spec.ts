import { GAME_SETTINGS } from './game.constants';

/**
 * Tripwires for the injury-chain shared constants.
 *
 * These values are referenced from THREE separate packages
 * (`@goalxi/database`, `settlement`, `simulator`) so a silent
 * retune would silently change game balance. The assertions below
 * pin the current values so a future refactor has to either
 * update the tests consciously or fail loud.
 */
describe('GAME_SETTINGS — injury chain constants', () => {
  it('DAYS_PER_YEAR stays 77 (11 weeks × 7 days)', () => {
    // `DAYS_PER_YEAR` is the age denominator
    // (`player.age = floor(daysAlive / DAYS_PER_YEAR)`), so it is the
    // single most load-bearing number in the game: it sets how long a
    // player's career lasts in wall-clock time. It WAS 112 (16 weeks).
    //
    // Changing it re-bases every existing player's age on deploy — a
    // 31% jump — so any change here requires a re-seed, not just a
    // constant edit. See `plans/season-compression-16w2m-to-11w3m.md`.
    //
    // The injury-recovery path also reads `DAYS_PER_YEAR` to turn
    // `getExactAge()`'s `(years, days)` into the fractional age its
    // sigmoid expects, so this moves injury recovery curves too.
    expect(GAME_SETTINGS.DAYS_PER_YEAR).toBe(77);
    expect(GAME_SETTINGS.SEASON_LENGTH_WEEKS * GAME_SETTINGS.DAYS_PER_WEEK).toBe(
      GAME_SETTINGS.DAYS_PER_YEAR,
    );
  });

  it('INJURY_MINOR_VALUE_THRESHOLD stays 30', () => {
    // Both the simulator's injury-write path (P1-#1 in the
    // injury-chain review) and the recovery cron's daily-tick
    // upgrade (P1-#1 again) compare `currentInjuryValue` against
    // this constant to decide between `injuryState = 'minor'`
    // (player can play at 95%) and `injuryState = 'severe'`
    // (player must sit out). The 30 cutoff aligns with the
    // simulator's mild injury value range (20-55) — most mild
    // injuries land in the "minor / playable" bucket, but a few
    // (e.g. ligament/head mild at the upper end) cross the line
    // and get treated as severe. See
    // `libs/database/src/types/simulation-player.ts` for the
    // penalty mapping.
    expect(GAME_SETTINGS.INJURY_MINOR_VALUE_THRESHOLD).toBe(30);
  });
});

/**
 * Season-shape arithmetic.
 *
 * These constants are the contract between the schedule generators, the
 * transition crons, the age model and the frontend. Nothing type-checks
 * that they still agree — a mismatch produces a season that silently
 * ends a week early, or fixtures dated outside the season-year, both of
 * which are invisible until weeks of wall-clock time have passed.
 *
 * This block exists so that changing one of them without the others fails
 * immediately and says what broke.
 */
describe('GAME_SETTINGS — season shape', () => {
  /** A 16-team double round-robin: each team meets each other twice. */
  const ROUNDS_16_TEAM_DOUBLE = 2 * (16 - 1);

  it('the regular season holds exactly one full double round-robin', () => {
    // If this fails, the season either ends with fixtures unplayed or the
    // last weeks overflow into the playoff week. Both are silent: the
    // playoff trigger only checks that week N-1 is *complete*, not that
    // it contained the right number of matches.
    expect(
      GAME_SETTINGS.REGULAR_SEASON_WEEKS * GAME_SETTINGS.ROUNDS_PER_WEEK,
    ).toBe(ROUNDS_16_TEAM_DOUBLE);
  });

  it('rounds divide evenly into whole weeks', () => {
    // A fractional last week would force the date maths into
    // `floor(round / 3) * 7 + offset` with an off-by-one at the seam,
    // and would desynchronise `week` stamps from `scheduledAt`.
    expect(ROUNDS_16_TEAM_DOUBLE % GAME_SETTINGS.ROUNDS_PER_WEEK).toBe(0);
  });

  it('REGULAR_SEASON_WEEKS is the season minus the playoff week', () => {
    expect(GAME_SETTINGS.REGULAR_SEASON_WEEKS).toBe(
      GAME_SETTINGS.SEASON_LENGTH_WEEKS - 1,
    );
  });

  it('one matchday per ROUNDS_PER_WEEK, one per MATCH_DAY_OFFSETS entry', () => {
    expect(GAME_SETTINGS.MATCH_DAY_OFFSETS).toHaveLength(
      GAME_SETTINGS.ROUNDS_PER_WEEK,
    );
  });

  it('match days are strictly increasing and inside Mon-Sun', () => {
    const days = GAME_SETTINGS.MATCH_DAY_OFFSETS;
    for (let i = 1; i < days.length; i++) {
      expect({ i, ascending: days[i] > days[i - 1] }).toEqual({
        i,
        ascending: true,
      });
    }
    // Monday=0 … Sunday=6. A 7 would spill into the following week and
    // break the `week` stamp.
    expect(Math.min(...days)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...days)).toBeLessThanOrEqual(6);
  });

  it('never schedules a Monday fixture', () => {
    // Monday 00:00 UTC already carries the finance settlement, the
    // senior-decline tick, playoff generation and season start. A Monday
    // 06:00 kickoff would sit six hours downstream of all of them.
    expect(GAME_SETTINGS.MATCH_DAY_OFFSETS).not.toContain(0);
  });

  it('ends the week on a Saturday, for the season-award cron', () => {
    // `league-award.service.ts` runs Sunday 00:00 gated on the final
    // regular week being complete. The last matchday must therefore land
    // on Friday or Saturday — Saturday gives the most margin (18 h).
    // A Sunday entry here silently kills the award for the whole season:
    // the cron evaluates 6 h before those matches finish, the season
    // number rolls over on Monday, and the gate is never true again.
    expect(GAME_SETTINGS.MATCH_DAY_OFFSETS.at(-1)).toBe(5);
  });

  it('spaces the fixtures as evenly as the week allows', () => {
    // 3 fixtures in 7 days cannot be perfectly even (7/3 = 2.33); the
    // best split is 2 / 2 / 3. Guard the shape, not the exact values, so
    // a future day change that keeps the cadence still passes.
    const gaps = GAME_SETTINGS.MATCH_DAY_OFFSETS.slice(1).map(
      (d, i) => d - GAME_SETTINGS.MATCH_DAY_OFFSETS[i],
    );
    expect({ gaps, total: gaps.reduce((a, b) => a + b, 0) }).toEqual({
      gaps: [2, 2],
      total: 4,
    });
  });

  it('SEASON_LENGTH_DAYS agrees with the week constant', () => {
    expect(GAME_SETTINGS.SEASON_LENGTH_DAYS).toBe(
      GAME_SETTINGS.SEASON_LENGTH_WEEKS * GAME_SETTINGS.DAYS_PER_WEEK,
    );
  });
});
