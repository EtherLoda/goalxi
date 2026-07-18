/**
 * attribute-calculator.spec.ts — covers the slot-key normalizer and
 * the contributionRaw pipeline that depends on it.
 *
 * Background: see the SLOT_KEY_NORMALIZER table in
 * `attribute-calculator.ts`. Editor slots like `CB1`, `CM2`, `DMF1`,
 * `CAM3` previously returned 0 in every phase because
 * POSITION_WEIGHTS only knows the family-level keys. Those numbers
 * come from the formation-editor line-up storage and are the only
 * keys the engine ever sees at runtime.
 */

import {
  AttributeCalculator,
  normalizePositionKey,
} from './attribute-calculator';
import type { Player } from '../../types/player.types';

// ============================================================================
// Fixtures
// ============================================================================

const CB_KEYS = ['CB1', 'CB2', 'CB3'] as const;
const CM_KEYS = ['CM1', 'CM2', 'CM3'] as const;
const CAM_KEYS = ['CAM1', 'CAM2', 'CAM3'] as const;
const DMF_KEYS = ['DMF1', 'DMF2', 'DMF3'] as const;

/** Build a Player whose right.defense summing comes entirely from
 *  `defending` so the test math is easy to verify by hand. Accepts
 *  top-level overrides (e.g. `injuryPenalty`) AND attribute-level
 *  overrides via `attributes`. */
function mkPlayer(
  overrides: {
    attributes?: Partial<Player['attributes']>;
    injuryPenalty?: number;
  } = {},
): Player {
  return {
    id: 'p-test',
    name: 'Test Player',
    position: 'CB',
    attributes: {
      pace: 10,
      strength: 10,
      positioning: 10,
      composure: 10,
      freeKicks: 10,
      penalties: 10,
      finishing: 10,
      passing: 10,
      dribbling: 10,
      defending: 10,
      ...(overrides.attributes ?? {}),
    } as any,
    currentStamina: 5,
    form: 5,
    experience: 0,
    overall: 80,
    exactAge: [25, 0] as [number, number],
    injuryPenalty: overrides.injuryPenalty ?? 1.0,
  } as Player;
}

// ============================================================================
// normalizePositionKey — pure
// ============================================================================

describe('normalizePositionKey', () => {
  it.each(CB_KEYS)('folds "%s" → "CB"', (key) => {
    expect(normalizePositionKey(key)).toBe('CB');
  });

  it.each(CM_KEYS)('folds "%s" → "CM"', (key) => {
    expect(normalizePositionKey(key)).toBe('CM');
  });

  it.each(CAM_KEYS)('folds "%s" → "CAM"', (key) => {
    expect(normalizePositionKey(key)).toBe('CAM');
  });

  it.each(DMF_KEYS)('folds "%s" → "DM"', (key) => {
    expect(normalizePositionKey(key)).toBe('DM');
  });

  it('returns canonical keys unchanged', () => {
    for (const key of [
      'GK', 'CF', 'CFL', 'CFR', 'ST', 'LW', 'RW', 'LM', 'RM',
      'LB', 'RB', 'LWB', 'RWB', 'AM', 'AML', 'AMR', 'DM', 'CDM',
      'DML', 'DMR', 'CML', 'CMR', 'WML', 'WMR', 'CD', 'CB',
      'BENCH_GK', 'BENCH_CB',
    ]) {
      expect(normalizePositionKey(key)).toBe(key);
    }
  });

  it('returns unknown keys unchanged so the warn path can flag them', () => {
    expect(normalizePositionKey('XYZ_NOPE')).toBe('XYZ_NOPE');
  });
});

// ============================================================================
// calculateContributionRaw via calculateAndCacheContribution — effects
// ============================================================================

describe('calculateAndCacheContribution — numbered slot keys', () => {
  beforeEach(() => {
    AttributeCalculator.clearCache();
    AttributeCalculator.clearUnknownKeyWarnCache();
  });

  it('CB1 contributes to right.defense (16 weight on defending+positioning+pace+strength)', () => {
    const p = mkPlayer({ attributes: { defending: 8, positioning: 7, pace: 6, strength: 5 } });
    // Expected = 8*8 + 7*4 + 6*2 + 5*2 = 64 + 28 + 12 + 10 = 114
    expect(
      AttributeCalculator.calculateAndCacheContribution(p, 'CB1', 'right', 'defense'),
    ).toBeCloseTo(114, 5);
  });

  it('CB2 / CB3 contribute the same per-player value as CB1 (family-level)', () => {
    // CB_WEIGHTS.right.defense = {defending:8, positioning:4, pace:2, strength:2}.
    // The fixture defaults `pace` and `strength` to 10, so they also
    // contribute — explicitly zero them so the assertion is readable.
    const p = mkPlayer({
      attributes: { defending: 9, positioning: 9, pace: 0, strength: 0 },
    });
    for (const key of ['CB1', 'CB2', 'CB3']) {
      const score = AttributeCalculator.calculateAndCacheContribution(
        p,
        key,
        'right',
        'defense',
      );
      // 9*8 + 9*4 + 0*2 + 0*2 = 72 + 36 = 108
      expect(score).toBeCloseTo(108, 5);
    }
  });

  it('CM1 contributes to center.defense (CM weights center.defense = {defending:8, positioning:4, pace:2, composure:2})', () => {
    const p = mkPlayer({ attributes: { defending: 6, positioning: 5, pace: 4, composure: 3 } });
    // 6*8 + 5*4 + 4*2 + 3*2 = 48 + 20 + 8 + 6 = 82
    expect(
      AttributeCalculator.calculateAndCacheContribution(p, 'CM1', 'center', 'defense'),
    ).toBeCloseTo(82, 5);
  });

  it('DMF1 contributes 0 to left.attack (DM weights left.attack = {passing:2} only)', () => {
    const p = mkPlayer({ attributes: { passing: 10, dribbling: 10, finishing: 10 } });
    // left.attack for DM = {passing: 2} → only 10*2 = 20
    expect(
      AttributeCalculator.calculateAndCacheContribution(p, 'DMF1', 'left', 'attack'),
    ).toBeCloseTo(20, 5);
  });

  it('CAM1 contributes to center.attack (CAM uses AM weights: {passing:10, dribbling:12, finishing:6, pace:4})', () => {
    const p = mkPlayer({ attributes: { passing: 8, dribbling: 9, finishing: 7, pace: 6 } });
    // 8*10 + 9*12 + 7*6 + 6*4 = 80 + 108 + 42 + 24 = 254
    expect(
      AttributeCalculator.calculateAndCacheContribution(p, 'CAM1', 'center', 'attack'),
    ).toBeCloseTo(254, 5);
  });

  it('GK still returns 0 across every lane×phase', () => {
    const p = mkPlayer();
    for (const lane of ['left', 'center', 'right'] as const) {
      for (const phase of ['attack', 'defense', 'possession'] as const) {
        expect(
          AttributeCalculator.calculateAndCacheContribution(p, 'GK', lane, phase),
        ).toBe(0);
      }
    }
  });

  it('severe-injury player (injuryPenalty=0) contributes 0 to every phase', () => {
    const p = mkPlayer({ injuryPenalty: 0 });
    for (const lane of ['left', 'center', 'right'] as const) {
      for (const phase of ['attack', 'defense', 'possession'] as const) {
        expect(
          AttributeCalculator.calculateAndCacheContribution(p, 'CB1', lane, phase),
        ).toBe(0);
      }
    }
  });

  it('minor-injury player (injuryPenalty=0.95) contributes 95% of the family-level score', () => {
    // Distinct ids so the cache doesn't return the healthy score for
    // the minor player (cache key includes playerId).
    const healthy = mkPlayer({
      attributes: { defending: 8, positioning: 7, pace: 0, strength: 0 },
    });
    (healthy as any).id = 'p-healthy';
    const minor = mkPlayer({
      injuryPenalty: 0.95,
      attributes: { defending: 8, positioning: 7, pace: 0, strength: 0 },
    });
    (minor as any).id = 'p-minor';
    const healthyScore = AttributeCalculator.calculateAndCacheContribution(
      healthy,
      'CB1',
      'right',
      'defense',
    );
    const minorScore = AttributeCalculator.calculateAndCacheContribution(
      minor,
      'CB1',
      'right',
      'defense',
    );
    expect(minorScore).toBeCloseTo(healthyScore * 0.95, 4);
  });

  it('unknown slot key returns 0 without throwing, and the warn dedupe set stays quiet', () => {
    const p = mkPlayer();
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // First call warns.
      expect(
        AttributeCalculator.calculateAndCacheContribution(p, 'XYZ_FAKE', 'right', 'defense'),
      ).toBe(0);
      // Second call with the same unknown key is suppressed (one warn per key per process).
      expect(
        AttributeCalculator.calculateAndCacheContribution(p, 'XYZ_FAKE', 'left', 'attack'),
      ).toBe(0);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toContain("'XYZ_FAKE'");
    } finally {
      spy.mockRestore();
    }
  });
});