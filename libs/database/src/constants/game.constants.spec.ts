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
  it('DAYS_PER_YEAR stays 112 (16 weeks × 7 days)', () => {
    // The injury-recovery cron uses `days / GAME_SETTINGS.DAYS_PER_YEAR`
    // to convert `(years, days)` from `PlayerEntity.getExactAge()` into
    // a fractional age that the sigmoid recovery formula expects.
    // Changing 112 to anything else will silently shift every player's
    // recovery rate.
    expect(GAME_SETTINGS.DAYS_PER_YEAR).toBe(112);
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
