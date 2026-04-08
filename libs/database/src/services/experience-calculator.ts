/**
 * Experience Calculator - Pure calculation logic for player experience system
 * No database or NestJS dependencies - shareable between API and Settlement
 *
 * Experience gained from matches:
 * - experienceGain = baseXP × (minutes / 90)
 *
 * Experience upgrade cost (sigmoid):
 * - cost = 5 + 25 / (1 + e^(-0.6 × (level - 8)))
 */

import { MatchType } from '../entities/match.entity';

export interface ExperienceResult {
    playerId: string;
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

/**
 * Calculate experience upgrade cost for given level
 * Uses sigmoid curve: cost = 4 + 60 / (1 + e^(-0.3 × (level - 11)))
 */
export function getExperienceUpgradeCost(currentLevel: number): number {
    return 4 + 60 / (1 + Math.exp(-0.3 * (currentLevel - 11)));
}

/**
 * Get player level from experience
 * Level starts at 1, calculated from total accumulated experience
 */
export function getExperienceLevel(totalExperience: number): number {
    let level = 1;
    let remaining = totalExperience;

    while (level < 20) {
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
 * Add experience to player and handle level up
 * Returns the new experience value and level changes
 */
export function addExperience(
    playerId: string,
    currentExperience: number,
    experienceToAdd: number,
): ExperienceResult {
    const levelBefore = getExperienceLevel(currentExperience);
    let experienceAfter = currentExperience + experienceToAdd;
    let levelAfter = levelBefore;

    // Handle level ups (max level 20)
    while (levelAfter < 20) {
        const cost = getExperienceUpgradeCost(levelAfter);
        if (experienceAfter < cost) {
            break;
        }
        experienceAfter -= cost;
        levelAfter++;
    }

    // Clamp to max level
    if (levelAfter >= 20) {
        experienceAfter = Math.min(experienceAfter, currentExperience);
    }

    return {
        playerId,
        experienceBefore: currentExperience,
        experienceAfter: experienceAfter,
        levelBefore,
        levelAfter,
        experienceGained: experienceToAdd,
    };
}
