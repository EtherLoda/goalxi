import { currentGameDay } from '../utils/game-clock';
import { PlayerAbility, ScoutCandidatePlayerData } from '../index';

/**
 * Probability of a candidate falling into each potential tier. Sum should be 1.0.
 */
export type ScoutTier = 'LOW' | 'REGULAR' | 'HIGH_PRO' | 'ELITE' | 'LEGEND';

/**
 * Two algorithms are supported:
 * - 'gaussian': potential skills are gaussian-distributed around `gaussianMean`
 *   with std-dev `gaussianStdDev`, per-position impact coefficients apply.
 *   Used by `ScoutsService.generatePlayerData` (the API-facing generator).
 * - 'uniform': potential ability (PA) is uniform in `paRange`; per-skill values
 *   are clamped to PA/5 ± 3. Used by the cron-driven `ScoutSchedulerService`.
 */
export type ScoutGenerationAlgorithm = 'gaussian' | 'uniform';

export interface ScoutGeneratorOptions {
  /** Optional override for `Math.random()` to make the generator testable. */
  random?: () => number;
  /** Optional fixed "now" for deterministic `birthday`/`joinedAt` in tests. */
  now?: () => Date;
  /** Probability distribution across tiers; weights are normalized automatically. */
  tierDistribution: Partial<Record<ScoutTier, number>>;
  /** Skill-generation algorithm. */
  algorithm: ScoutGenerationAlgorithm;
  /** Algorithm = 'gaussian' */
  gaussianMean?: number;
  gaussianStdDev?: number;
  /** Impact coefficients for medium/low-skill impact per tier (gaussian only). */
  impactCoefficients?: Partial<Record<ScoutTier, { medium: number; low: number }>>;
  /** Algorithm = 'uniform' */
  paRange?: [number, number];
  /** Current-skill ratio applied to potential. Default: [0.5, 0.8]. */
  currentRatio?: [number, number];
  /** Pool of abilities the candidate may carry. */
  abilityPool: PlayerAbility[];
  /** Probability [0,1] of receiving one ability from the pool. */
  abilityChance: number;
  /** Number of revealed skill keys (split 50/50 between current & potential keys). */
  revealedSkillCount?: number;
  /** Outfield positions to pick from (non-GK only). */
  outfieldPositions: string[];
  /** Per-position impact buckets. Keys are position names. */
  positionSkillImpact: Record<string, { high: string[]; medium: string[]; low: string[] }>;
  /** Probability that the candidate is a goalkeeper. */
  goalkeeperChance?: number;
  /** Min / max age in years. */
  ageRange?: [number, number];
  /** Nationality pool + name provider, used to seed playerData.name. */
  pickRandomNationality: () => string;
  getRandomNameByNationality: (nationality: string) => { firstName: string; lastName: string };
}

/** A complete scout candidate payload ready to be persisted in `scout_candidate.playerData`. */
export interface GeneratedScoutCandidate
  extends Omit<ScoutCandidatePlayerData, 'revealedSkills' | 'joinedAt' | 'potentialRevealed' | 'potentialTier'> {
  potentialTier: ScoutTier;
  position: string;
  revealedSkills: string[];
  potentialRevealed: boolean;
  joinedAt: Date;
}

const SKILL_VALUE_MIN = 1;
const SKILL_VALUE_MAX = 20;
const SKILL_VALUE_MAX_DAYS = 112;

/**
 * Pure generator — no I/O, no DB. Produces a deterministic given a fixed
 * `random` source. Used by both the API-facing `ScoutsService` and the
 * cron-driven `ScoutSchedulerService`.
 */
export function generateScoutCandidate(
  options: ScoutGeneratorOptions,
): GeneratedScoutCandidate {
  const rand = options.random ?? Math.random;
  const now = options.now ?? (() => new Date());

  const isGoalkeeper = rand() < (options.goalkeeperChance ?? 0.1);
  const nationality = options.pickRandomNationality();
  const { firstName, lastName } = options.getRandomNameByNationality(nationality);
  const ageRange = options.ageRange ?? [15, 16];
  const ageYears =
    ageRange[0] +
    Math.floor(rand() * (ageRange[1] - ageRange[0] + 1));
  // Game-world age in days: age in years × 112 + jitter [0, 112).
  const daysAlive = ageYears * SKILL_VALUE_MAX_DAYS + Math.floor(rand() * SKILL_VALUE_MAX_DAYS);
  // Place creation day so the player is `daysAlive` days old as of "now".
  const createdDay = currentGameDay(new Date(now())) - daysAlive;

  const position = isGoalkeeper ? 'GK' : pick(options.outfieldPositions, rand);
  const impact = options.positionSkillImpact[position];
  const keys = isGoalkeeper
    ? [
        'pace',
        'strength',
        'reflexes',
        'handling',
        'aerial',
        'positioning',
        'composure',
        'freeKicks',
        'penalties',
      ]
    : [
        'pace',
        'strength',
        'finishing',
        'passing',
        'dribbling',
        'defending',
        'positioning',
        'composure',
        'freeKicks',
        'penalties',
      ];

  const targetTier = pickTier(options.tierDistribution, rand);
  const coeffs =
    options.impactCoefficients?.[targetTier] ?? { medium: 0.9, low: 0.8 };

  const potential: Record<string, number> = {};
  const current: Record<string, number> = {};

  if (options.algorithm === 'gaussian') {
    const mean = options.gaussianMean ?? 15;
    const stdDev = options.gaussianStdDev ?? 2;
    for (const k of keys) {
      let m: number;
      if (impact.low.includes(k)) m = mean * coeffs.low;
      else if (impact.high.includes(k)) m = mean;
      else m = mean * coeffs.medium;
      potential[k] = round2(
        clamp(gaussianRandom(m, stdDev, rand), SKILL_VALUE_MIN, SKILL_VALUE_MAX),
      );
    }
    // Current skills: 50-80% of potential (gaussian), capped at potential.
    // Both values are rounded to 2dp so the invariant `current ≤ potential`
    // survives JSON serialization (where 12.7586 would become 12.76).
    const ratio = options.currentRatio ?? [0.5, 0.8];
    for (const k of keys) {
      const ratioPick = ratio[0] + rand() * (ratio[1] - ratio[0]);
      const meanCurrent = potential[k] * ratioPick;
      current[k] = round2(
        clamp(gaussianRandom(meanCurrent, 1.5, rand), SKILL_VALUE_MIN, potential[k]),
      );
    }
  } else {
    // uniform: pick PA in paRange, then derive per-skill from PA/5 ± 3.
    const paRange = options.paRange ?? [40, 90];
    const pa = paRange[0] + Math.floor(rand() * (paRange[1] - paRange[0] + 1));
    const targetAvg = pa / 5;
    const ratio = options.currentRatio ?? [0.35, 0.45];
    for (const k of keys) {
      const potVal = clamp(targetAvg + (rand() * 6 - 3), SKILL_VALUE_MIN, SKILL_VALUE_MAX);
      potential[k] = round2(potVal);
      const curVal = clamp(potential[k] * (ratio[0] + rand() * (ratio[1] - ratio[0])), SKILL_VALUE_MIN, potential[k]);
      current[k] = round2(curVal);
    }
  }

  // 4 revealed skills: 2 + 2
  const revealedCount = options.revealedSkillCount ?? 4;
  const revealedSkills = pickRevealedSkills(keys, revealedCount, rand);

  const abilities =
    rand() < options.abilityChance ? [pick(options.abilityPool, rand)] : undefined;

  // 30% chance that potential tier is revealed
  const potentialRevealed = rand() < 0.3;

  const [currentSkills, potentialSkills] = buildSkillStructures(
    current,
    potential,
    isGoalkeeper,
  );

  return {
    name: `${firstName} ${lastName}`,
    createdDay,
    nationality,
    isGoalkeeper,
    position,
    currentSkills: currentSkills as ScoutCandidatePlayerData['currentSkills'],
    potentialSkills: potentialSkills as ScoutCandidatePlayerData['potentialSkills'],
    abilities,
    potentialTier: targetTier,
    potentialRevealed,
    revealedSkills,
    joinedAt: now(),
  };
}

// ---------- helpers (kept private to this module) ----------

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function round2(v: number): number {
  return parseFloat(v.toFixed(2));
}

function gaussianRandom(mean: number, stdDev: number, rand: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return mean + z * stdDev;
}

function pick<T>(arr: readonly T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

function pickTier(
  distribution: Partial<Record<ScoutTier, number>>,
  rand: () => number,
): ScoutTier {
  const entries = Object.entries(distribution) as [ScoutTier, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) return 'LOW';
  const r = rand() * total;
  let acc = 0;
  for (const [tier, weight] of entries) {
    acc += weight;
    if (r < acc) return tier;
  }
  return entries[entries.length - 1][0];
}

function randomBirthdayForAge(
  age: number,
  rand: () => number,
  now: () => Date = () => new Date(),
): Date {
  // Kept for backward-compat with existing callers, but unused now that we
  // store `createdDay` instead of a Date. Returns a Date that is `age` real
  // years before `now()`.
  const nowDate = now();
  const yearAgo = new Date(
    nowDate.getFullYear() - age,
    nowDate.getMonth(),
    nowDate.getDate(),
  );
  const offset = Math.floor(rand() * 365) * 24 * 60 * 60 * 1000;
  return new Date(yearAgo.getTime() - offset);
}

function pickRevealedSkills(
  keys: readonly string[],
  count: number,
  rand: () => number,
): string[] {
  const shuffled = [...keys].sort(() => rand() - 0.5);
  return shuffled.slice(0, count);
}

function buildSkillStructures(
  current: Record<string, number>,
  potential: Record<string, number>,
  isGoalkeeper: boolean,
): [ScoutCandidatePlayerData['currentSkills'], ScoutCandidatePlayerData['potentialSkills']] {
  const technical = isGoalkeeper
    ? {
        reflexes: current.reflexes,
        handling: current.handling,
        aerial: current.aerial,
      }
    : {
        finishing: current.finishing,
        passing: current.passing,
        dribbling: current.dribbling,
        defending: current.defending,
      };
  const potentialTechnical = isGoalkeeper
    ? {
        reflexes: potential.reflexes,
        handling: potential.handling,
        aerial: potential.aerial,
      }
    : {
        finishing: potential.finishing,
        passing: potential.passing,
        dribbling: potential.dribbling,
        defending: potential.defending,
      };

  return [
    {
      physical: { pace: current.pace, strength: current.strength },
      technical,
      mental: { positioning: current.positioning, composure: current.composure },
      setPieces: { freeKicks: current.freeKicks, penalties: current.penalties },
    } as ScoutCandidatePlayerData['currentSkills'],
    {
      physical: { pace: potential.pace, strength: potential.strength },
      technical: potentialTechnical,
      mental: { positioning: potential.positioning, composure: potential.composure },
      setPieces: { freeKicks: potential.freeKicks, penalties: potential.penalties },
    } as ScoutCandidatePlayerData['potentialSkills'],
  ];
}