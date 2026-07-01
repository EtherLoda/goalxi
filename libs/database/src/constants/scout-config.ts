/**
 * Shared scout candidate configuration used by both the API-facing
 * `ScoutsService` and the cron-driven `ScoutSchedulerService`.
 *
 * Kept in `@goalxi/database` so the two services stay in lockstep on
 * position buckets, ability pools, and per-tier impact coefficients.
 * Adding a new outfield position or ability here automatically propagates
 * to every generator call site.
 */
import { PlayerAbility } from '../types/simulation-player';

export const SCOUT_OUTFIELD_POSITIONS = [
  'ST',
  'CF',
  'LW',
  'RW',
  'AM',
  'CM',
  'DM',
  'LB',
  'RB',
  'CB',
] as const;

export type ScoutOutfieldPosition = (typeof SCOUT_OUTFIELD_POSITIONS)[number];

export const SCOUT_ABILITY_POOL: PlayerAbility[] = [
  'fast_start',
  'header_specialist',
  'long_passer',
  'cross_specialist',
  'dribble_master',
  'tackle_master',
  'long_shooter',
];

/**
 * Per-position impact buckets. Skills listed under `high` are seeded at
 * the algorithm's full mean; `medium` skills take a tier-dependent
 * coefficient (see SCOUT_IMPACT_COEFFICIENTS); `low` skills take the
 * smaller of the two.
 */
export const SCOUT_POSITION_SKILL_IMPACT: Record<
  string,
  { high: string[]; medium: string[]; low: string[] }
> = {
  ST: {
    high: ['finishing', 'positioning', 'pace'],
    medium: ['strength', 'composure', 'dribbling'],
    low: ['passing', 'defending'],
  },
  CF: {
    high: ['finishing', 'positioning', 'strength'],
    medium: ['pace', 'composure', 'dribbling'],
    low: ['passing', 'defending'],
  },
  LW: {
    high: ['pace', 'dribbling', 'finishing'],
    medium: ['passing', 'strength'],
    low: ['defending', 'composure'],
  },
  RW: {
    high: ['pace', 'dribbling', 'finishing'],
    medium: ['passing', 'strength'],
    low: ['defending', 'composure'],
  },
  AM: {
    high: ['dribbling', 'passing', 'finishing'],
    medium: ['positioning', 'pace'],
    low: ['defending', 'strength', 'composure'],
  },
  CM: {
    high: ['passing', 'dribbling', 'positioning'],
    medium: ['composure', 'defending', 'strength'],
    low: ['finishing', 'pace'],
  },
  DM: {
    high: ['defending', 'positioning', 'passing'],
    medium: ['dribbling', 'composure', 'strength'],
    low: ['finishing', 'pace'],
  },
  LB: {
    high: ['defending', 'positioning', 'pace'],
    medium: ['strength', 'composure', 'passing'],
    low: ['finishing', 'dribbling'],
  },
  RB: {
    high: ['defending', 'positioning', 'pace'],
    medium: ['strength', 'composure', 'passing'],
    low: ['finishing', 'dribbling'],
  },
  CB: {
    high: ['defending', 'positioning', 'strength'],
    medium: ['pace', 'composure'],
    low: ['dribbling', 'passing', 'finishing'],
  },
  GK: {
    high: ['reflexes', 'handling'],
    medium: ['aerial', 'positioning', 'composure'],
    low: ['pace', 'strength'],
  },
};

/**
 * Per-tier coefficients for medium/low skill impact, applied under the
 * gaussian algorithm. Tighter tier (LEGEND) widens the gap between high
 * and low skills; looser tier (LOW) keeps them close to the algorithm
 * mean.
 */
export const SCOUT_IMPACT_COEFFICIENTS = {
  LEGEND: { medium: 0.8, low: 0.45 },
  ELITE: { medium: 0.85, low: 0.5 },
  HIGH_PRO: { medium: 0.9, low: 0.65 },
  REGULAR: { medium: 0.95, low: 0.8 },
  LOW: { medium: 0.98, low: 0.9 },
} as const;

export const SCOUT_GOALKEEPER_CHANCE = 0.1;
export const SCOUT_REVEALED_SKILL_COUNT = 4;
export const SCOUT_ABILITY_CHANCE = 0.3;
export const SCOUT_AGE_RANGE: [number, number] = [15, 16];
export const SCOUT_CANDIDATES_PER_TEAM = 3;
export const SCOUT_CANDIDATE_TTL_DAYS = 7;
