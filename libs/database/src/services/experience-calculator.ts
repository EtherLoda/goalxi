/**
 * Experience Calculator - Pure calculation logic for player experience system
 * No database or NestJS dependencies - shareable between API and Settlement
 *
 * Experience gained from matches:
 * - experienceGain = baseXP × (minutes / 90)
 *
 * Level progression (linear cost, no cap):
 * - Level starts at 0 with 0 experience.
 * - cost(L) = 10 + 2L  →  XP needed to go from L to L+1
 *   L0→1: 10,  L1→2: 12,  L2→3: 14,  L3→4: 16,  ...
 * - Cumulative XP at L(N) = N² + 9N  (L0: 0, L1: 10, L2: 22, L3: 36, L5: 70, L10: 190, ...)
 * - No level cap — players keep gaining levels forever.
 */

import { MatchType } from '../entities/match.entity';

export interface ExperienceResult {
    playerId: number;
    experienceBefore: number;
    experienceAfter: number;
    levelBefore: number;
    levelAfter: number;
    experienceGained: number;
}

/** Base XP per match type */
export const MATCH_EXPERIENCE_CONFIG: Record<MatchType, number> = {
    [MatchType.LEAGUE]: 1.0,
    [MatchType.CUP]: 1.0,
    [MatchType.TOURNAMENT]: 0,
    [MatchType.FRIENDLY]: 0.1,
    [MatchType.NATIONAL_TEAM]: 5.0,
    [MatchType.PLAYOFF]: 2.0,
};

/** Base XP cost for the first level-up (L0 → L1). */
export const EXPERIENCE_BASE_COST = 10;
/** Marginal XP cost per level — arithmetic-progression step. */
export const EXPERIENCE_STEP_COST = 2;

/**
 * Calculate experience upgrade cost for given level.
 * Returns the XP needed to advance from currentLevel to currentLevel + 1.
 *
 * Linear curve: cost(L) = BASE + STEP × L
 */
export function getExperienceUpgradeCost(currentLevel: number): number {
    return EXPERIENCE_BASE_COST + EXPERIENCE_STEP_COST * currentLevel;
}

/**
 * Get player level from cumulative experience.
 * Level starts at 0 with 0 experience. No upper cap.
 */
export function getExperienceLevel(totalExperience: number): number {
    let level = 0;
    let remaining = totalExperience;

    while (true) {
        const cost = getExperienceUpgradeCost(level);
        if (remaining < cost) {
            break;
        }
        remaining -= cost;
        level++;
    }

    return level;
}

/**
 * Calculate experience gained from a match
 */
export function calculateMatchExperience(
    matchType: MatchType,
    minutesPlayed: number,
): number {
    const baseXP = MATCH_EXPERIENCE_CONFIG[matchType] ?? 0;
    const minutesFactor = Math.min(1, minutesPlayed / 90);
    return baseXP * minutesFactor;
}

/**
 * Add experience to player and handle level ups.
 * Returns the new experience value (residual after deducting level-up costs)
 * and the before/after levels. No level cap.
 */
export function addExperience(
    playerId: number,
    currentExperience: number,
    experienceToAdd: number,
): ExperienceResult {
    const levelBefore = getExperienceLevel(currentExperience);
    let experienceAfter = currentExperience + experienceToAdd;
    let levelAfter = levelBefore;

    while (true) {
        const cost = getExperienceUpgradeCost(levelAfter);
        if (experienceAfter < cost) {
            break;
        }
        experienceAfter -= cost;
        levelAfter++;
    }

    return {
        playerId,
        experienceBefore: currentExperience,
        experienceAfter,
        levelBefore,
        levelAfter,
        experienceGained: experienceToAdd,
    };
}
