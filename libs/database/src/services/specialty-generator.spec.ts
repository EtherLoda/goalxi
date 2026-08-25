import {
  ACTIVE_SPECIALTIES,
  ACTIVE_SPECIALTY_SET,
  DEPRECATED_SPECIALTIES,
  GK_SPECIALTIES,
  GK_SPECIALTY_SET,
  OUTFIELD_SPECIALTIES,
  OUTFIELD_SPECIALTY_SET,
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
  it('returns null ~50% of the time across a large sample (outfield path)', () => {
    let nullCount = 0;
    const N = 100_000;
    for (let i = 0; i < N; i++) {
      if (rollSpecialty(seeded(i), false) === null) nullCount++;
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
      const r = rollSpecialty(seeded(i + 1), false);
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

  it('tier distribution holds in the GK pool (2 codes, 1/3/6/90 — v2.8.1)', () => {
    // v2.8.1: GK 走 GOALKEEPER_TIER_DISTRIBUTION (1/3/6/90),
    // 不是 outfield 的 TIER_DISTRIBUTION (5/15/30/50). 只有 10%
    // GK 有特技 (vs outfield 50%), 守门员是场上最稀缺位置,
    // GK with spec 应该像 "discovery"。条件化 tier ratio
    // (Gold 10% / Silver 30% / Bronze 60% of "has spec") 不变。
    const counts = { GOLD: 0, SILVER: 0, BRONZE: 0 };
    const N = 100_000;
    for (let i = 0; i < N; i++) {
      const r = rollSpecialty(seeded(i + 1001), true);
      if (r !== null) counts[r.tier]++;
    }
    const total = counts.GOLD + counts.SILVER + counts.BRONZE;
    const goldPct = counts.GOLD / total;
    const silverPct = counts.SILVER / total;
    const bronzePct = counts.BRONZE / total;
    // ±1.5% tolerance. The conditional ratio is the same as
    // outfield (5/15/30 → 10/30/60).
    expect(goldPct).toBeGreaterThan(0.085);
    expect(goldPct).toBeLessThan(0.115);
    expect(silverPct).toBeGreaterThan(0.285);
    expect(silverPct).toBeLessThan(0.315);
    expect(bronzePct).toBeGreaterThan(0.585);
    expect(bronzePct).toBeLessThan(0.615);
  });

  it('v2.8.1: GK has-spec rate is 10% (vs outfield 50%)', () => {
    // User 2026-08-25 request: GK specialty is 5× rarer. outfield
    // 50% have spec, GK only 10%. ±0.5% tolerance with N=100k.
    let outfieldHasSpec = 0;
    let gkHasSpec = 0;
    const N = 100_000;
    for (let i = 0; i < N; i++) {
      if (rollSpecialty(seeded(i + 2001), false) !== null) outfieldHasSpec++;
      if (rollSpecialty(seeded(i + 3001), true) !== null) gkHasSpec++;
    }
    const outfieldRate = outfieldHasSpec / N;
    const gkRate = gkHasSpec / N;
    // outfield ~50% (TIER_DISTRIBUTION.NO_SPEC = 50)
    expect(outfieldRate).toBeGreaterThan(0.495);
    expect(outfieldRate).toBeLessThan(0.505);
    // GK ~10% (GOALKEEPER_TIER_DISTRIBUTION.NO_SPEC = 90)
    expect(gkRate).toBeGreaterThan(0.095);
    expect(gkRate).toBeLessThan(0.105);
  });

  it('outfield path: returned codes are always from the outfield pool (never GK, never deprecated)', () => {
    for (let i = 0; i < 10_000; i++) {
      const r = rollSpecialty(seeded(i + 100), false);
      if (r === null) continue;
      expect(OUTFIELD_SPECIALTY_SET.has(r.code)).toBe(true);
      expect(GK_SPECIALTY_SET.has(r.code)).toBe(false);
      expect(DEPRECATED_SPECIALTIES.includes(r.code as any)).toBe(false);
    }
  });

  it('GK path: returned codes are always from the GK pool (never outfield, never deprecated)', () => {
    for (let i = 0; i < 10_000; i++) {
      const r = rollSpecialty(seeded(i + 200), true);
      if (r === null) continue;
      expect(GK_SPECIALTY_SET.has(r.code)).toBe(true);
      expect(OUTFIELD_SPECIALTY_SET.has(r.code)).toBe(false);
      expect(DEPRECATED_SPECIALTIES.includes(r.code as any)).toBe(false);
    }
  });

  it('outfield path covers all 10 outfield codes (no code is unreachable)', () => {
    // Chi-square-style sanity check: each of the 10 outfield codes
    // should appear at least once in a modest sample. Catches "we
    // forgot to include the new code in the pool" regressions
    // (and would catch a future contributor accidentally putting an
    // outfield code behind the GK gate).
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      const r = rollSpecialty(seeded(i + 300), false);
      if (r !== null) seen.add(r.code);
    }
    expect(seen.size).toBe(OUTFIELD_SPECIALTIES.length);
    for (const code of OUTFIELD_SPECIALTIES) {
      expect(seen.has(code)).toBe(true);
    }
  });

  it('GK path covers both GK codes (no code is unreachable)', () => {
    // Same as the outfield version, just for the 2-code GK pool.
    // Smaller sample is fine — 10k against a 2-code pool yields an
    // expected ~5000 hits per code, which is plenty to surface a
    // missing entry.
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      const r = rollSpecialty(seeded(i + 400), true);
      if (r !== null) seen.add(r.code);
    }
    expect(seen.size).toBe(GK_SPECIALTIES.length);
    for (const code of GK_SPECIALTIES) {
      expect(seen.has(code)).toBe(true);
    }
  });

  it('is deterministic for a given rand function', () => {
    const r1 = rollSpecialty(seeded(42), false);
    const r2 = rollSpecialty(seeded(42), false);
    expect(r1).toEqual(r2);
    // Different isGoalkeeper flag → different pool, different result.
    // Not asserting the exact result here (deterministic within a
    // path is the property that matters); the GK-vs-outfield
    // disjointness tests above cover cross-path divergence.
  });
});

describe('rollSpecialtyOrThrow', () => {
  it('always returns a non-null roll on the outfield path', () => {
    for (let i = 0; i < 1000; i++) {
      const r = rollSpecialtyOrThrow(seeded(i + 500), false);
      expect(r).not.toBeNull();
      expect(r.code).toBeDefined();
      expect(OUTFIELD_SPECIALTY_SET.has(r.code)).toBe(true);
      expect(['GOLD', 'SILVER', 'BRONZE']).toContain(r.tier);
    }
  });

  it('always returns a non-null roll on the GK path', () => {
    for (let i = 0; i < 1000; i++) {
      const r = rollSpecialtyOrThrow(seeded(i + 600), true);
      expect(r).not.toBeNull();
      expect(r.code).toBeDefined();
      expect(GK_SPECIALTY_SET.has(r.code)).toBe(true);
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
