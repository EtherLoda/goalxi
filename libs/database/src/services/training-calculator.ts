/**
 * Training Calculator - Pure calculation logic for training system
 * No database or NestJS dependencies - shareable between API and Settlement
 */

import { PlayerSkills, TrainingCategory, TrainingSlot } from '../entities/player.entity';
import { StaffEntity, StaffRole } from '../entities/staff.entity';
import {
    TRAINING_SETTINGS,
    getAgeTrainingFactor,
    getSkillUpgradeCost,
} from '../constants/training.constants';

export interface SkillGain {
    skill: string;
    levels: number;
}

export interface TrainingResult {
    playerId: string;
    weeklyPoints: number;
    skillsGained: SkillGain[];
    totalPointsSpent: number;
}

/**
 * Calculate weekly training points for a player
 * Formula: BASE_WEEKLY × slotMultiplier × ageFactor × coachBonus
 */
export function calculateWeeklyTrainingPoints(
    age: number,
    trainingSlot: TrainingSlot,
    trainingCategory: TrainingCategory,
    staffList: StaffEntity[],
): number {
    const slotMultiplier = getSlotMultiplier(trainingSlot);
    if (slotMultiplier === 0) return 0;

    const ageFactor = getAgeTrainingFactor(age);
    const coachBonus = calculateCoachBonus(staffList, trainingCategory);

    return Math.round(
        TRAINING_SETTINGS.BASE_WEEKLY_TRAINING *
            slotMultiplier *
            ageFactor *
            coachBonus *
            100,
    ) / 100;
}

function getSlotMultiplier(slot: TrainingSlot): number {
    switch (slot) {
        case TrainingSlot.ENHANCED:
            return TRAINING_SETTINGS.ENHANCED_MULTIPLIER;
        case TrainingSlot.REGULAR:
            return TRAINING_SETTINGS.REGULAR_MULTIPLIER;
        case TrainingSlot.NONE:
        default:
            return TRAINING_SETTINGS.NONE_MULTIPLIER;
    }
}

/**
 * Calculate combined coach bonus for a player
 * Formula: 1 + headBonus + relevantCategoryBonus
 */
export function calculateCoachBonus(staffList: StaffEntity[], trainingCategory: TrainingCategory): number {
    const activeStaff = staffList.filter(s => s.isActive);
    const headCoach = activeStaff.find(s => s.role === StaffRole.HEAD_COACH);
    const headBonus = headCoach
        ? headCoach.level * TRAINING_SETTINGS.COACH_BONUS_PER_LEVEL
        : 0;

    // Get the relevant category coach based on trainingCategory
    const categoryStr = trainingCategory as string;
    const coachRole = getCoachRoleForCategory(categoryStr);
    let categoryBonus = 0;
    if (coachRole) {
        const categoryCoach = activeStaff.find(s => s.role === coachRole);
        if (categoryCoach) {
            categoryBonus = categoryCoach.level * TRAINING_SETTINGS.COACH_BONUS_PER_LEVEL;
        }
    }

    return 1 + headBonus + categoryBonus;
}

function getCoachRoleForCategory(category: string): StaffRole | null {
    const map: Record<string, StaffRole> = {
        physical: StaffRole.FITNESS_COACH,
        technical: StaffRole.TECHNICAL_COACH,
        goalkeeper: StaffRole.GOALKEEPER_COACH,
        mental: StaffRole.PSYCHOLOGY_COACH,
        setPieces: StaffRole.SET_PIECE_COACH,
    };
    return map[category] || null;
}

/**
 * Get all skill keys for a player type
 */
export function getPlayerSkillKeys(isGoalkeeper: boolean): string[] {
    if (isGoalkeeper) {
        return ['pace', 'strength', 'reflexes', 'handling', 'aerial', 'positioning', 'composure', 'freeKicks', 'penalties'];
    }
    return ['pace', 'strength', 'finishing', 'passing', 'dribbling', 'defending', 'positioning', 'composure', 'freeKicks', 'penalties'];
}

/**
 * Get current level of a skill from player skills object
 */
export function getSkillLevel(skills: PlayerSkills, key: string): number {
    for (const category of Object.values(skills)) {
        if (category && typeof category === 'object' && key in category) {
            return (category as Record<string, number>)[key];
        }
    }
    return 0;
}

/**
 * Set skill level on player skills object
 */
export function setSkillLevel(
    skills: PlayerSkills,
    key: string,
    level: number,
): void {
    for (const category of Object.keys(skills)) {
        if (skills[category] && key in skills[category]) {
            (skills[category] as Record<string, number>)[key] = level;
            return;
        }
    }
}

/**
 * Distribute training points to ONE skill
 * If trainingSkill is specified, train that specific skill; otherwise randomly select one
 * Returns gains and total points spent
 */
export function distributeTrainingPoints(
    currentSkills: PlayerSkills,
    potentialSkills: PlayerSkills,
    totalPoints: number,
    isGoalkeeper: boolean,
    trainingSkill?: string | null,
): { gains: SkillGain[]; totalSpent: number } {
    const gains: SkillGain[] = [];
    let totalSpent = 0;

    const skillKeys = getPlayerSkillKeys(isGoalkeeper);

    // Filter skills that haven't reached potential
    const eligibleKeys = skillKeys.filter(key => {
        const currentLevel = getSkillLevel(currentSkills, key);
        const potentialLevel = getSkillLevel(potentialSkills, key);
        return currentLevel < potentialLevel;
    });

    if (eligibleKeys.length === 0) {
        return { gains, totalSpent };
    }

    // If trainingSkill is specified and is eligible, use it; otherwise randomly select
    let selectedKey: string;
    if (trainingSkill && eligibleKeys.includes(trainingSkill)) {
        selectedKey = trainingSkill;
    } else {
        selectedKey = eligibleKeys[Math.floor(Math.random() * eligibleKeys.length)];
    }

    const currentLevel = getSkillLevel(currentSkills, selectedKey);
    const potentialLevel = getSkillLevel(potentialSkills, selectedKey);

    // Try to gain as many levels as points allow for that single skill
    let tempLevel = currentLevel;
    let tempCost = 0;

    while (tempLevel < potentialLevel && totalPoints >= tempCost + getSkillUpgradeCost(tempLevel)) {
        tempCost += getSkillUpgradeCost(tempLevel);
        tempLevel++;
    }

    if (tempLevel > currentLevel) {
        setSkillLevel(currentSkills, selectedKey, tempLevel);
        const levelsGained = tempLevel - currentLevel;
        gains.push({ skill: selectedKey, levels: levelsGained });
        totalSpent = tempCost;
    }

    return { gains, totalSpent };
}

/**
 * Apply training to a player for given weeks
 */
export function applyTrainingToPlayer(
    playerId: string,
    age: number,
    currentSkills: PlayerSkills,
    potentialSkills: PlayerSkills,
    trainingSlot: TrainingSlot,
    trainingCategory: TrainingCategory,
    isGoalkeeper: boolean,
    staffList: StaffEntity[],
    weeksElapsed: number,
    trainingSkill?: string | null,
): TrainingResult {
    const weeklyPoints = calculateWeeklyTrainingPoints(age, trainingSlot, trainingCategory, staffList);
    if (weeklyPoints === 0) {
        return {
            playerId,
            weeklyPoints: 0,
            skillsGained: [],
            totalPointsSpent: 0,
        };
    }

    const totalPoints = weeklyPoints * weeksElapsed;
    const result = distributeTrainingPoints(currentSkills, potentialSkills, totalPoints, isGoalkeeper, trainingSkill);

    return {
        playerId,
        weeklyPoints,
        skillsGained: result.gains,
        totalPointsSpent: result.totalSpent,
    };
}
