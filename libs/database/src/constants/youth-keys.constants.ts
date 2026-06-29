/**
 * Single source of truth for the skill keys used by youth players and scout
 * candidates. Senior `PlayerEntity` reads from the same JSONB structure, so
 * these keys cover both youth and senior domains.
 *
 * The lists are intentionally small `as const` arrays — they are used both at
 * runtime (e.g. looping over a player's current skills) and at compile time
 * (e.g. `PlayerSkills` shape enforcement in `player.entity.ts`).
 */

/** All 10 skill keys tracked for an outfield player. */
export const OUTFIELD_KEYS = [
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
] as const;

/**
 * All 9 skill keys tracked for a goalkeeper.
 * Note: uses `aerial` (not `distribution`) — `GKTechnical.positioning` was
 * removed in the consolidation; GK reads `positioning` from `mental`.
 */
export const GK_KEYS = [
  'pace',
  'strength',
  'reflexes',
  'handling',
  'aerial',
  'positioning',
  'composure',
  'freeKicks',
  'penalties',
] as const;

export type OutfieldSkillKey = (typeof OUTFIELD_KEYS)[number];
export type GoalkeeperSkillKey = (typeof GK_KEYS)[number];
export type YouthSkillKey = OutfieldSkillKey | GoalkeeperSkillKey;

/** Return the appropriate skill-key list for a player type. */
export function getYouthSkillKeys(
  isGoalkeeper: boolean,
): readonly YouthSkillKey[] {
  return isGoalkeeper ? GK_KEYS : OUTFIELD_KEYS;
}

/**
 * Minimum fraction of skills that must be revealed before promotion is
 * allowed. Outfield = 5/10, GK = 5/9 (Math.ceil rounds up).
 */
export const PROMOTION_REVEAL_THRESHOLD = 0.5;

/** Default weekly wage for a freshly promoted youth player (matches
 *  `PlayerEntity.currentWage` default). */
export const YOUTH_PROMOTION_DEFAULT_WAGE = 2000;

/** Default contract length in weeks for a freshly promoted youth player.
 *  Roughly 2 seasons at 16 weeks/season. */
export const YOUTH_PROMOTION_CONTRACT_WEEKS = 32;