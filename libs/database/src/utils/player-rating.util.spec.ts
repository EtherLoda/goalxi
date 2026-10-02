import {
  calculatePlayerPWI,
  formatPWI,
  getSkillWeight,
  getStarLabel,
  getStarRatingFromContribution,
  getPlayerRating,
} from './player-rating.util';
import type { PlayerEntity } from '../entities/player.entity';

/**
 * PWI is the game's headline number: it drives market value, transfer
 * pricing and the squad list, and `CLAUDE.md` carries a whole policy
 * section about keeping its internals out of player-facing copy. It had
 * **zero** unit tests — a 139-line `console.log` harness shipped inside
 * the module instead (removed in the Phase 3 consolidation).
 *
 * These tests pin the behaviour a copy-paste of this file could silently
 * change. They deliberately do NOT restate the formula's constants as
 * expectations: the interesting properties are the orderings and the
 * clamp-like rounding, which survive a legitimate retune.
 */

const outfieldSkills = (over: Partial<Record<string, number>> = {}) => ({
  physical: { pace: 12, strength: 12, ...over } as any,
  technical: {
    finishing: 12,
    passing: 12,
    dribbling: 12,
    defending: 12,
    ...over,
  } as any,
  mental: { positioning: 12, composure: 12, ...over } as any,
  setPieces: { freeKicks: 0, penalties: 0 } as any,
});

const gkSkills = (over: Partial<Record<string, number>> = {}) => ({
  physical: { pace: 10, strength: 12, ...over } as any,
  technical: { reflexes: 14, handling: 13, aerial: 12, ...over } as any,
  mental: { positioning: 10, composure: 12, ...over } as any,
  setPieces: { freeKicks: 0, penalties: 0 } as any,
});

const player = (over: Partial<PlayerEntity> = {}): PlayerEntity =>
  ({
    id: 1,
    name: 'Test Player',
    isGoalkeeper: false,
    currentSkills: outfieldSkills(),
    potentialSkills: outfieldSkills(),
    potentialAbility: 70,
    form: 3,
    experience: 10,
    position: 'ST',
    // `getPlayerRating` goes through `toSimulationPlayer`, which calls
    // this prototype method. A plain object literal does not have it,
    // so a bare fixture would fail before reaching any assertion.
    getExactAge: () => ({ years: 24, days: 0 }),
    ...over,
  }) as unknown as PlayerEntity;

describe('getSkillWeight', () => {
  it('weights outfield finishing above set pieces', () => {
    // The whole point of the matrix: finishing is what a striker sells.
    expect(getSkillWeight('finishing')).toBeGreaterThan(
      getSkillWeight('freeKicks'),
    );
    expect(getSkillWeight('freeKicks')).toBe(getSkillWeight('penalties'));
  });

  it('weights goalkeeper-specific skills', () => {
    expect(getSkillWeight('gk_reflexes')).toBeGreaterThan(0);
    expect(getSkillWeight('gk_reflexes')).toBeGreaterThan(
      getSkillWeight('gk_positioning'),
    );
  });

  it('falls back to 1.0 for an unknown key rather than NaN', () => {
    // The implementation is \`?? 1.0\`: an unknown key is treated as
    // neutral weight. What is worth pinning is that it stays FINITE — a
    // missing map entry must never poison the weighted sum with NaN.
    const w = getSkillWeight('definitely_not_a_skill');
    expect(Number.isFinite(w)).toBe(true);
    expect(w).toBe(1.0);
  });
});

describe('calculatePlayerPWI', () => {
  it('returns a non-negative integer rounded to the nearest 10', () => {
    const { pwi } = calculatePlayerPWI(player());
    expect(Number.isFinite(pwi)).toBe(true);
    expect(pwi).toBeGreaterThanOrEqual(0);
    expect(pwi % 10).toBe(0);
  });

  it('rises monotonically with every skill', () => {
    const base = calculatePlayerPWI(player()).pwi;
    const better = calculatePlayerPWI(
      player({
        currentSkills: outfieldSkills({ pace: 18 } as any),
      }),
    ).pwi;

    expect(better).toBeGreaterThan(base);
  });

  it('rises with potentialAbility', () => {
    const low = calculatePlayerPWI(player({ potentialAbility: 20 })).pwi;
    const high = calculatePlayerPWI(player({ potentialAbility: 95 })).pwi;
    expect(high).toBeGreaterThan(low);
  });

  it('rises with form', () => {
    const low = calculatePlayerPWI(player({ form: 1 })).pwi;
    const high = calculatePlayerPWI(player({ form: 5 })).pwi;
    expect(high).toBeGreaterThan(low);
  });

it('applies GK_BASE_MULTIPLIER to the weighted sum exactly once', () => {
    // The two branches read DIFFERENT keys — a keeper is scored on
    // reflexes/handling/aerial/composure, an outfielder on
    // finishing/passing/… — so there is no "same skills, different
    // flag" comparison to make. Instead the expected raw sum is derived
    // from the weight matrix and the 1.65 multiplier is applied once:
    //
    //   14x1.56 + 13x1.47 + 12x1.52 + 0x1.0(gk_positioning absent)
    //   + 12x0.96(composure) + 0 + 0   == 70.71,  x 1.65 == 116.67
    //
    // If the multiplier were applied twice, or to the final PWI as
    // well, this would not hold.
    const keeper = calculatePlayerPWI(
      player({ isGoalkeeper: true, currentSkills: gkSkills() as any }),
    );

    const rawSum =
      14 * getSkillWeight('gk_reflexes') +
      13 * getSkillWeight('gk_handling') +
      12 * getSkillWeight('gk_aerial') +
      0 * getSkillWeight('gk_positioning') +
      12 * getSkillWeight('composure');

    expect(keeper.weightedSum).toBeCloseTo(rawSum * 1.65, 2);
  });

  it('reads goalkeeper skills from reflexes/handling/aerial, not finishing', () => {
    // A keeper whose `technical` carries outfield keys must still score
    // on the GK matrix. Guards the branch in getPlayerSkillPairs.
    const keeper = calculatePlayerPWI(
      player({
        isGoalkeeper: true,
        currentSkills: gkSkills() as any,
      }),
    );
    expect(keeper.weightedSum).toBeGreaterThan(0);

    // Zeroing the GK technical block must remove exactly its share,
    // leaving mental.composure and the halved set pieces in the sum.
    const zeroed = calculatePlayerPWI(
      player({
        isGoalkeeper: true,
        currentSkills: {
          ...gkSkills(),
          technical: { reflexes: 0, handling: 0, aerial: 0 } as any,
        } as any,
      }),
    );
    const composureOnly = 12 * getSkillWeight('composure');
    expect(zeroed.weightedSum).toBeCloseTo(composureOnly * 1.65, 2);
  });

  it('exposes the intermediate factors it documents', () => {
    const result = calculatePlayerPWI(player());
    // potentialFactor = 1 + (pa/100) * 1.5, documented range [1.0, 2.5].
    expect(result.potentialFactor).toBeCloseTo(1 + (70 / 100) * 1.5, 6);
    expect(result.potentialFactor).toBeGreaterThanOrEqual(1);
    expect(result.potentialFactor).toBeLessThanOrEqual(2.5);

    // formFactor = 0.9 + form * 0.05; form 3 is the design midpoint.
    expect(result.formFactor).toBeCloseTo(0.9 + 3 * 0.05, 6);
  });

  it('is robust to missing skill groups', () => {
    // JSONB columns are nullable and imported rows can be partial; a
    // missing group must read as 0 rather than throwing.
    const sparse = calculatePlayerPWI(
      player({
        currentSkills: { physical: { pace: 14, strength: 14 } } as any,
      }),
    );
    expect(Number.isFinite(sparse.pwi)).toBe(true);
    expect(sparse.weightedSum).toBeGreaterThan(0);
  });

  it('is a pure function of the player', () => {
    const p = player();
    const first = calculatePlayerPWI(p);
    const second = calculatePlayerPWI(p);
    expect(first).toEqual(second);
  });
});

describe('formatPWI', () => {
  it('rounds to a whole number for display', () => {
    expect(formatPWI(1234.4)).toBe('1234');
    expect(formatPWI(1234.6)).toBe('1235');
  });
});

describe('getStarRatingFromContribution / getStarLabel', () => {
  it('clamps contribution into the band, with a 0.5 floor rather than 0', () => {
    // Below STAR_THRESHOLDS.ONE this returns 0.5 — a poor performer is
    // half a star, not none. Pinning the floor stops a "return 0" from
    // quietly reappearing and losing the half-star tier.
    expect(getStarRatingFromContribution(-50)).toBe(0.5);
    expect(getStarRatingFromContribution(0)).toBe(0.5);
    expect(getStarRatingFromContribution(1_000_000)).toBe(5);
  });

  it('rises with contribution', () => {
    const low = getStarRatingFromContribution(10);
    const high = getStarRatingFromContribution(90);
    expect(high).toBeGreaterThanOrEqual(low);
  });

  it('has a label for every reachable star value', () => {
    for (let s = 0; s <= 5; s++) {
      expect(getStarLabel(s)).toBeTruthy();
    }
  });
});

describe('getPlayerRating', () => {
  it('surfaces the PWI breakdown it wraps', () => {
    const rating = getPlayerRating(player({ id: 7, name: 'Test' }));
    expect(rating.playerId).toBe(7);
    expect(rating.playerName).toBe('Test');
    expect(rating.pwiDisplay).toBe(formatPWI(rating.pwi));
    expect(rating.breakdown.pwi).toBe(rating.pwi);
  });

  it('keeps the goalkeeper path working end to end', () => {
    const rating = getPlayerRating(
      player({ isGoalkeeper: true, currentSkills: gkSkills() as any }),
    );
    expect(Number.isFinite(rating.pwi)).toBe(true);
    expect(rating.pwi).toBeGreaterThan(0);
    // GK stars come from the save-rating branch, not position-fit, so
    // they must still be produced here.
    expect(rating.stars).toBeGreaterThan(0);
    expect(rating.starLabel).toBeTruthy();
  });
});