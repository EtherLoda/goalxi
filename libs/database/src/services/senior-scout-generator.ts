import {
  SCOUT_ABILITY_CHANCE,
  SCOUT_ABILITY_POOL,
  SCOUT_GOALKEEPER_CHANCE,
  SCOUT_IMPACT_COEFFICIENTS,
  SCOUT_OUTFIELD_POSITIONS,
  SCOUT_POSITION_SKILL_IMPACT,
  SCOUT_REVEALED_SKILL_COUNT,
  SCOUT_SENIOR_AGE_RANGE,
  SCOUT_SENIOR_CURRENT_MAX,
  SCOUT_SENIOR_CURRENT_MIN,
  SCOUT_SENIOR_GAUSSIAN_MEAN,
  SCOUT_SENIOR_GAUSSIAN_STDDEV,
  SCOUT_SENIOR_POTENTIAL_MAX,
  SCOUT_SENIOR_POTENTIAL_MIN,
} from '../constants/scout-config';
import {
  ScoutCandidateEntity,
  ScoutCandidatePlayerData,
  TeamEntity,
} from '../index';
import { DataSource } from 'typeorm';
import { currentWeekIndex, endOfCurrentWeek } from '../utils/game-clock';
import { generateScoutCandidate, GeneratedScoutCandidate } from './scout-generator';
import { getRandomNameByNationality } from '../constants/name-database';

/**
 * Hard skill caps for senior-mode candidates. Pulled out as
 * module-level constants so the post-processing pass in
 * `generateSeniorScoutCandidate` can read them without
 * re-declaring the magic numbers.
 */
const SENIOR_AGE_RANGE = SCOUT_SENIOR_AGE_RANGE;
const SENIOR_CURRENT_MIN = SCOUT_SENIOR_CURRENT_MIN;
const SENIOR_CURRENT_MAX = SCOUT_SENIOR_CURRENT_MAX;
const SENIOR_POTENTIAL_MIN = SCOUT_SENIOR_POTENTIAL_MIN;
const SENIOR_POTENTIAL_MAX = SCOUT_SENIOR_POTENTIAL_MAX;

/**
 * Default nationality for the synthetic team shim used when
 * the caller has no team row (e.g. orphan cron runs). Mirrors
 * the `DEFAULT_TEAM_NATIONALITY` constant in the original
 * `ScoutsService`.
 */
export const DEFAULT_TEAM_NATIONALITY = 'CN';

/**
 * Build a senior-mode (17–18 years old, current in
 * [SENIOR_CURRENT_MIN..SENIOR_CURRENT_MAX], potential in
 * [SENIOR_POTENTIAL_MIN..SENIOR_POTENTIAL_MAX]) candidate
 * using the shared `generateScoutCandidate` algorithm and the
 * post-clamp pass that enforces the `current ≤ potential`
 * invariant.
 *
 * The candidate's nationality is pinned to the team's own;
 * if the team has no `nationality` set, the fallback is
 * `DEFAULT_TEAM_NATIONALITY`. This is the senior-mode
 * equivalent of the previously-inline `generatePlayerData`
 * in `api/src/api/scouts/scouts.service.ts` — moved here so
 * the settlement worker's `OnboardingProcessor` can produce
 * the exact same shape when seeding the first scout
 * candidate for a freshly-claimed BOT team.
 */
export function generateSeniorScoutCandidate(
  team: Pick<TeamEntity, 'nationality'>,
  random: () => number = Math.random,
): GeneratedScoutCandidate {
  const nationality = team.nationality ?? DEFAULT_TEAM_NATIONALITY;
  const raw = generateScoutCandidate({
    tierDistribution: {
      LEGEND: 0.005,
      ELITE: 0.015,
      HIGH_PRO: 0.05,
      REGULAR: 0.43,
      LOW: 0.5,
    },
    algorithm: 'gaussian',
    gaussianMean: SCOUT_SENIOR_GAUSSIAN_MEAN,
    gaussianStdDev: SCOUT_SENIOR_GAUSSIAN_STDDEV,
    impactCoefficients: SCOUT_IMPACT_COEFFICIENTS,
    currentRatio: [0.5, 0.8],
    abilityPool: SCOUT_ABILITY_POOL,
    abilityChance: SCOUT_ABILITY_CHANCE,
    revealedSkillCount: SCOUT_REVEALED_SKILL_COUNT,
    outfieldPositions: SCOUT_OUTFIELD_POSITIONS as unknown as string[],
    positionSkillImpact: SCOUT_POSITION_SKILL_IMPACT,
    goalkeeperChance: SCOUT_GOALKEEPER_CHANCE,
    ageRange: SENIOR_AGE_RANGE,
    pickRandomNationality: () => nationality,
    // Real name lookup from the shared `NAME_DATABASE` —
    // settlement can import this because the database
    // already publishes it via `@goalxi/database`. Falls
    // back to GB (the function's own fallback) when the
    // team's nationality isn't in the table.
    getRandomNameByNationality,
    random,
  });

  // Clamp the raw skill map into the senior-mode range and
  // swap any current > potential pair so the UI never sees a
  // card that lies.
  const current = flattenSkills(raw.currentSkills as unknown as Record<string, unknown>);
  const potential = flattenSkills(raw.potentialSkills as unknown as Record<string, unknown>);
  applySeniorSkillCaps(current, potential);
  return {
    ...raw,
    currentSkills: rebuildSkills(current, raw.isGoalkeeper) as GeneratedScoutCandidate['currentSkills'],
    potentialSkills: rebuildSkills(potential, raw.isGoalkeeper) as GeneratedScoutCandidate['potentialSkills'],
  };
}

/**
 * Insert one senior-mode scout candidate for the given team.
 *
 * Used by:
 *   - `api/src/api/scouts/scouts.service.ts` (manual refresh
 *     + weekly cron)
 *   - `settlement/src/processors/onboarding.processor.ts`
 *     (initial seed after a fresh team claim)
 *
 * Both call sites use the exact same shape and the exact same
 * weekly-cap policy, so the write lives here rather than being
 * duplicated. The function does NOT consult the per-team
 * `scoutDrawsThisWeek` counter — that is the caller's
 * responsibility (see `OnboardingProcessor` for the rationale;
 * the onboarding seed deliberately skips the cap so the new
 * manager always has at least one candidate to look at).
 */
export async function seedSeniorScoutCandidate(
  dataSource: DataSource,
  teamId: string,
  teamNationality: string | null,
  random: () => number = Math.random,
): Promise<ScoutCandidateEntity> {
  const teamShim = { nationality: teamNationality ?? DEFAULT_TEAM_NATIONALITY };
  const playerData = generateSeniorScoutCandidate(teamShim, random);
  const expiresAt = endOfCurrentWeek();

  const repo = dataSource.manager.getRepository(ScoutCandidateEntity);
  const candidate = repo.create({
    teamId,
    playerData: {
      ...playerData,
      // The shared generator produces a potentialTier for
      // every candidate; only reveal it externally when
      // `potentialRevealed === true`.
      potentialTier: playerData.potentialRevealed
        ? playerData.potentialTier
        : undefined,
    } as unknown as ScoutCandidatePlayerData,
    expiresAt,
  });
  return await repo.save(candidate);
}

// ---------- helpers (private) ----------

/** Walk a flat map and run `fn` on every numeric leaf. */
function forEachSkillValue(
  skills: Record<string, unknown>,
  fn: (v: number) => number,
): void {
  for (const cat of Object.values(skills)) {
    if (!cat || typeof cat !== 'object') continue;
    for (const [k, v] of Object.entries(cat as Record<string, number>)) {
      if (typeof v === 'number') {
        (cat as Record<string, number>)[k] = fn(v);
      }
    }
  }
}

/** Pull every skill value (pace, strength, finishing, …) into a flat map. */
function flattenSkills(
  skills: Record<string, unknown>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const cat of Object.values(skills)) {
    if (!cat || typeof cat !== 'object') continue;
    for (const [k, v] of Object.entries(cat as Record<string, number>)) {
      if (typeof v === 'number') out[k] = v;
    }
  }
  return out;
}

function applySeniorSkillCaps(
  current: Record<string, number>,
  potential: Record<string, number>,
): void {
  forEachSkillValue(current, (v) =>
    Math.max(SENIOR_CURRENT_MIN, Math.min(SENIOR_CURRENT_MAX, v)),
  );
  forEachSkillValue(potential, (v) =>
    Math.max(SENIOR_POTENTIAL_MIN, Math.min(SENIOR_POTENTIAL_MAX, v)),
  );
  // Enforce current ≤ potential — if the dice rolled an
  // awkward pairing, swap the two values.
  for (const k of Object.keys(potential)) {
    const cur = current[k];
    const pot = potential[k];
    if (typeof cur === 'number' && typeof pot === 'number' && cur > pot) {
      current[k] = pot;
      potential[k] = cur;
    }
  }
}

function rebuildSkills(
  flat: Record<string, number>,
  isGoalkeeper: boolean,
): GeneratedScoutCandidate['currentSkills'] {
  const technical = isGoalkeeper
    ? {
        reflexes: flat.reflexes,
        handling: flat.handling,
        aerial: flat.aerial,
      }
    : {
        finishing: flat.finishing,
        passing: flat.passing,
        dribbling: flat.dribbling,
        defending: flat.defending,
      };
  return {
    physical: { pace: flat.pace, strength: flat.strength },
    technical,
    mental: { positioning: flat.positioning, composure: flat.composure },
    setPieces: { freeKicks: flat.freeKicks, penalties: flat.penalties },
  } as GeneratedScoutCandidate['currentSkills'];
}

/**
 * Re-export of the time helpers the API service used to import
 * from this module's old home. Kept here so settlement can
 * `import { currentWeekIndex, endOfCurrentWeek } from
 * '@goalxi/database'` without pulling in the full clock utils
 * namespace.
 */
export { currentWeekIndex, endOfCurrentWeek };
