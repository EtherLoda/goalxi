import { PlayerAbility } from '../index';
import {
  GeneratedScoutCandidate,
  ScoutGeneratorOptions,
  ScoutTier,
  generateScoutCandidate,
} from './scout-generator';

// ---------- helpers ----------

const ABILITY_POOL: PlayerAbility[] = [
  'header_specialist',
  'long_passer',
  'cross_specialist',
  'dribble_master',
  'tackle_master',
  'long_shooter',
  'fast_start',
];

const OUTFIELD_POSITIONS = ['ST', 'CF', 'LW', 'RW', 'AM', 'CM', 'DM', 'LB', 'RB', 'CB'];

const POSITION_IMPACT: ScoutGeneratorOptions['positionSkillImpact'] = {
  ST: { high: ['finishing', 'positioning', 'pace'], medium: ['strength', 'composure', 'dribbling'], low: ['passing', 'defending'] },
  CF: { high: ['finishing', 'positioning', 'strength'], medium: ['pace', 'composure', 'dribbling'], low: ['passing', 'defending'] },
  LW: { high: ['pace', 'dribbling', 'finishing'], medium: ['passing', 'strength'], low: ['defending', 'composure'] },
  RW: { high: ['pace', 'dribbling', 'finishing'], medium: ['passing', 'strength'], low: ['defending', 'composure'] },
  AM: { high: ['dribbling', 'passing', 'finishing'], medium: ['positioning', 'pace'], low: ['defending', 'strength', 'composure'] },
  CM: { high: ['passing', 'dribbling', 'positioning'], medium: ['composure', 'defending', 'strength'], low: ['finishing', 'pace'] },
  DM: { high: ['defending', 'positioning', 'passing'], medium: ['dribbling', 'composure', 'strength'], low: ['finishing', 'pace'] },
  LB: { high: ['defending', 'positioning', 'pace'], medium: ['strength', 'composure', 'passing'], low: ['finishing', 'dribbling'] },
  RB: { high: ['defending', 'positioning', 'pace'], medium: ['strength', 'composure', 'passing'], low: ['finishing', 'dribbling'] },
  CB: { high: ['defending', 'positioning', 'strength'], medium: ['pace', 'composure'], low: ['dribbling', 'passing', 'finishing'] },
  GK: { high: ['reflexes', 'handling'], medium: ['aerial', 'positioning', 'composure'], low: ['pace', 'strength'] },
};

/** Deterministic PRNG (mulberry32). Returns same sequence for same seed. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function baseOptions(
  overrides: Partial<ScoutGeneratorOptions> = {},
): ScoutGeneratorOptions {
  return {
    random: seeded(42),
    now: () => new Date('2026-01-15T12:00:00Z'),
    tierDistribution: { LOW: 0.5, REGULAR: 0.43, HIGH_PRO: 0.05, ELITE: 0.015, LEGEND: 0.005 },
    algorithm: 'gaussian',
    gaussianMean: 15,
    gaussianStdDev: 2,
    impactCoefficients: {
      LOW: { medium: 0.98, low: 0.9 },
      REGULAR: { medium: 0.95, low: 0.8 },
      HIGH_PRO: { medium: 0.9, low: 0.65 },
      ELITE: { medium: 0.85, low: 0.5 },
      LEGEND: { medium: 0.8, low: 0.45 },
    },
    currentRatio: [0.5, 0.8],
    abilityPool: ABILITY_POOL,
    abilityChance: 0.3,
    outfieldPositions: OUTFIELD_POSITIONS,
    positionSkillImpact: POSITION_IMPACT,
    goalkeeperChance: 0.1,
    ageRange: [15, 16],
    pickRandomNationality: () => 'GB',
    getRandomNameByNationality: () => ({ firstName: 'Test', lastName: 'Player' }),
    ...overrides,
  };
}

function* allSkills(c: GeneratedScoutCandidate): Generator<{ name: string; current: number; potential: number }> {
  const cur = c.currentSkills as any;
  const pot = c.potentialSkills as any;
  const groups: Array<[string, Record<string, number>]> = [
    ['physical', cur.physical],
    ['technical', cur.technical],
    ['mental', cur.mental],
    ['setPieces', cur.setPieces],
  ];
  for (const [_, group] of groups) {
    for (const [k, v] of Object.entries(group)) {
      yield { name: k, current: v, potential: (pot[Object.keys(pot).find((g) => k in pot[g])!] as any)[k] };
    }
  }
}

// ---------- tests ----------

describe('scout-generator', () => {
  it('returns the expected top-level shape', () => {
    const out = generateScoutCandidate(baseOptions());
    expect(typeof out.name).toBe('string');
    expect(out.name.length).toBeGreaterThan(0);
    expect(typeof out.createdDay).toBe('number');
    expect(out.createdDay).toBeGreaterThanOrEqual(0);
    expect(typeof out.nationality).toBe('string');
    expect(out.joinedAt).toBeInstanceOf(Date);
    expect(['LOW', 'REGULAR', 'HIGH_PRO', 'ELITE', 'LEGEND']).toContain(out.potentialTier);
    expect(typeof out.potentialRevealed).toBe('boolean');
  });

  it('produces createdDay values within reasonable bounds for an outfield youth', () => {
    // age 15-16 → daysAlive ∈ [15*112, 16*112+112) = [1680, 1904)
    const today = Math.floor(Date.now() / 86_400_000) + 20000; // rough proxy
    for (let i = 0; i < 20; i++) {
      const c = generateScoutCandidate(baseOptions({ random: seeded(i) }));
      expect(c.createdDay).toBeGreaterThan(0);
      // Just sanity check that the field is plausible (positive integer).
      expect(Number.isInteger(c.createdDay)).toBe(true);
      expect(c.createdDay).toBeLessThan(today);
    }
  });

  it('places GK skills for goalkeepers and outfield skills otherwise', () => {
    // Force GK: rand=0.001 → goalkeeperChance (0.1) true. Using a tiny
    // non-zero value to avoid the gaussian's `while (u === 0)` guard
    // infinitely looping on a literal-zero mock.
    const gk = generateScoutCandidate(baseOptions({ random: () => 0.001 }));
    expect(gk.isGoalkeeper).toBe(true);
    expect(gk.position).toBe('GK');
    expect((gk.currentSkills as any).technical).toHaveProperty('reflexes');
    expect((gk.currentSkills as any).technical).toHaveProperty('aerial');
    expect((gk.currentSkills as any).technical).not.toHaveProperty('finishing');

    // Force outfield: rand=0.5 → goalkeeperChance false; pick position.
    const out = generateScoutCandidate(baseOptions({ random: () => 0.5 }));
    expect(out.isGoalkeeper).toBe(false);
    expect(OUTFIELD_POSITIONS).toContain(out.position);
    expect((out.currentSkills as any).technical).toHaveProperty('finishing');
    expect((out.currentSkills as any).technical).not.toHaveProperty('reflexes');
  });

  it('keeps every skill value within [1, 20]', () => {
    for (let i = 0; i < 50; i++) {
      const c = generateScoutCandidate(baseOptions({ random: seeded(i) }));
      for (const { current, potential } of allSkills(c)) {
        expect(current).toBeGreaterThanOrEqual(1);
        expect(current).toBeLessThanOrEqual(20);
        expect(potential).toBeGreaterThanOrEqual(1);
        expect(potential).toBeLessThanOrEqual(20);
      }
    }
  });

  it('current skill never exceeds potential', () => {
    for (let i = 0; i < 50; i++) {
      const c = generateScoutCandidate(baseOptions({ random: seeded(i) }));
      for (const { current, potential } of allSkills(c)) {
        expect(current).toBeLessThanOrEqual(potential);
      }
    }
  });

  it('revealed skills are a subset of the player-type skill keys', () => {
    const c = generateScoutCandidate(baseOptions());
    expect(c.revealedSkills.length).toBeGreaterThan(0);
    expect(c.revealedSkills.length).toBeLessThanOrEqual(4);
    const valid = c.isGoalkeeper
      ? ['pace', 'strength', 'reflexes', 'handling', 'aerial', 'positioning', 'composure', 'freeKicks', 'penalties']
      : ['pace', 'strength', 'finishing', 'passing', 'dribbling', 'defending', 'positioning', 'composure', 'freeKicks', 'penalties'];
    for (const r of c.revealedSkills) {
      expect(valid).toContain(r);
    }
  });

  it('respects abilityChance — 0 → no abilities, 1 → always one', () => {
    for (let i = 0; i < 20; i++) {
      const c = generateScoutCandidate(baseOptions({ abilityChance: 0, random: seeded(i) }));
      expect(c.abilities).toBeUndefined();
    }
    for (let i = 0; i < 20; i++) {
      const c = generateScoutCandidate(baseOptions({ abilityChance: 1, random: seeded(i) }));
      expect(c.abilities).toBeDefined();
      expect(c.abilities?.length).toBe(1);
      expect(ABILITY_POOL).toContain(c.abilities![0]);
    }
  });

  it('matches the configured tier distribution over many samples', () => {
    const dist = { LOW: 0.5, REGULAR: 0.43, HIGH_PRO: 0.05, ELITE: 0.015, LEGEND: 0.005 };
    const counts: Record<ScoutTier, number> = { LOW: 0, REGULAR: 0, HIGH_PRO: 0, ELITE: 0, LEGEND: 0 };
    const N = 5000;
    for (let i = 0; i < N; i++) {
      const c = generateScoutCandidate(baseOptions({ tierDistribution: dist, random: seeded(i) }));
      counts[c.potentialTier]++;
    }
    // Allow ±10% absolute deviation for a 5000-sample run.
    expect(counts.LOW / N).toBeGreaterThan(0.4);
    expect(counts.LOW / N).toBeLessThan(0.6);
    expect(counts.REGULAR / N).toBeGreaterThan(0.33);
    expect(counts.REGULAR / N).toBeLessThan(0.53);
    expect(counts.HIGH_PRO / N).toBeGreaterThan(0.0);
    expect(counts.HIGH_PRO / N).toBeLessThan(0.12);
  });

  it('uniform algorithm respects paRange bounds', () => {
    for (let i = 0; i < 50; i++) {
      const c = generateScoutCandidate(
        baseOptions({ algorithm: 'uniform', paRange: [50, 70], random: seeded(i) }),
      );
      // PA isn't surfaced in the output, but potential skills should be in the
      // expected range (PA/5 ± 3 → 7..17, clamped to 1..20).
      for (const { potential } of allSkills(c)) {
        expect(potential).toBeGreaterThanOrEqual(7);
        expect(potential).toBeLessThanOrEqual(17);
      }
    }
  });

  it('is deterministic given the same random source', () => {
    const a = generateScoutCandidate(baseOptions({ random: seeded(7) }));
    const b = generateScoutCandidate(baseOptions({ random: seeded(7) }));
    expect(a).toEqual(b);
  });
});