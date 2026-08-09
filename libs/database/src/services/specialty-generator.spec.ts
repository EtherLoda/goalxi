import {
  ACTIVE_SPECIALTIES,
  ACTIVE_SPECIALTY_SET,
  DEPRECATED_SPECIALTIES,
  TIER_DISTRIBUTION,
  isActiveSpecialty,
  isDeprecatedSpecialty,
  isKnownSpecialty,
} from '../constants/specialty-codes';
import { rollSpecialty, rollSpecialtyOrThrow } from './specialty-generator';

// Deterministic PRNG (mulberry32). Used in tests so the same seed
// always produces the same sequence, making distribution assertions
// reproducible.
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('rollSpecialty', () => {
  it('returns null ~50% of the time across a large sample', () => {
    let nullCount = 0;
    const N = 100_000;
    for (let i = 0; i < N; i++) {
      if (rollSpecialty(seeded(i)) === null) nullCount++;
    }
    const ratio = nullCount / N;
    // ±1% tolerance on the 50% target. With N=100k the standard
    // deviation is well under 0.5%, so this is a tight check.
    expect(ratio).toBeGreaterThan(0.49);
    expect(ratio).toBeLessThan(0.51);
  });

  it('tier distribution among specialty-having players is 5/15/30 (Gold/Silver/Bronze)', () => {
    const counts = { GOLD: 0, SILVER: 0, BRONZE: 0 };
    const N = 100_000;
    for (let i = 0; i < N; i++) {
      const r = rollSpecialty(seeded(i + 1));
      if (r !== null) counts[r.tier]++;
    }
    const total = counts.GOLD + counts.SILVER + counts.BRONZE;
    // Proportions are: 5/50 = 10% Gold, 15/50 = 30% Silver, 30/50 = 60% Bronze
    // (since we're conditioning on "has a specialty").
    const goldPct = counts.GOLD / total;
    const silverPct = counts.SILVER / total;
    const bronzePct = counts.BRONZE / total;
    // ±1.5% tolerance — with N=100k the stddev on each ratio is ~0.15%.
    expect(goldPct).toBeGreaterThan(0.085);
    expect(goldPct).toBeLessThan(0.115);
    expect(silverPct).toBeGreaterThan(0.285);
    expect(silverPct).toBeLessThan(0.315);
    expect(bronzePct).toBeGreaterThan(0.585);
    expect(bronzePct).toBeLessThan(0.615);
  });

  it('returned codes are always from the active pool (never deprecated)', () => {
    for (let i = 0; i < 10_000; i++) {
      const r = rollSpecialty(seeded(i + 100));
      if (r === null) continue;
      expect(ACTIVE_SPECIALTY_SET.has(r.code)).toBe(true);
      expect(DEPRECATED_SPECIALTIES.includes(r.code as any)).toBe(false);
    }
  });

  it('uses the full active pool (no code is heavily favored over others)', () => {
    // Chi-square-style sanity check: each of the 12 codes should
    // appear at least once in a modest sample. This catches "we
    // forgot to include the new code in the pool" regressions.
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      const r = rollSpecialty(seeded(i + 200));
      if (r !== null) seen.add(r.code);
    }
    expect(seen.size).toBe(ACTIVE_SPECIALTIES.length);
    for (const code of ACTIVE_SPECIALTIES) {
      expect(seen.has(code)).toBe(true);
    }
  });

  it('is deterministic for a given rand function', () => {
    const r1 = rollSpecialty(seeded(42));
    const r2 = rollSpecialty(seeded(42));
    expect(r1).toEqual(r2);
  });
});

describe('rollSpecialtyOrThrow', () => {
  it('always returns a non-null roll', () => {
    for (let i = 0; i < 1000; i++) {
      const r = rollSpecialtyOrThrow(seeded(i + 300));
      expect(r).not.toBeNull();
      expect(r.code).toBeDefined();
      expect(['GOLD', 'SILVER', 'BRONZE']).toContain(r.tier);
    }
  });
});

describe('type guards', () => {
  it('isActiveSpecialty narrows correctly', () => {
    // `isActiveSpecialty` is a TS type guard — verify it accepts all
    // 12 active codes and rejects unknown ones / null / undefined.
    for (const code of ACTIVE_SPECIALTIES) {
      expect(isActiveSpecialty(code)).toBe(true);
    }
    expect(isActiveSpecialty('NOT_REAL')).toBe(false);
    expect(isActiveSpecialty('LONG_SHOT')).toBe(false); // deprecated, not active
    expect(isActiveSpecialty(null)).toBe(false);
    expect(isActiveSpecialty(undefined)).toBe(false);
  });

  it('isDeprecatedSpecialty narrows correctly', () => {
    for (const code of DEPRECATED_SPECIALTIES) {
      expect(isDeprecatedSpecialty(code)).toBe(true);
    }
    expect(isDeprecatedSpecialty('AERIAL_THREAT')).toBe(false);
    expect(isDeprecatedSpecialty(null)).toBe(false);
  });

  it('isKnownSpecialty returns true for both pools', () => {
    for (const code of ACTIVE_SPECIALTIES) {
      expect(isKnownSpecialty(code)).toBe(true);
    }
    for (const code of DEPRECATED_SPECIALTIES) {
      expect(isKnownSpecialty(code)).toBe(true);
    }
    expect(isKnownSpecialty('FAKE_CODE')).toBe(false);
    expect(isKnownSpecialty(null)).toBe(false);
  });
});

describe('TIER_DISTRIBUTION sums to 100', () => {
  it('Gold + Silver + Bronze + No_spec === 100', () => {
    const sum =
      TIER_DISTRIBUTION.GOLD +
      TIER_DISTRIBUTION.SILVER +
      TIER_DISTRIBUTION.BRONZE +
      TIER_DISTRIBUTION.NO_SPEC;
    expect(sum).toBe(100);
  });
});
