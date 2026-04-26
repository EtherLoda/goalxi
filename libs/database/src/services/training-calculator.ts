/**
 * Training Calculator - Pure calculation logic for training system
 * No database or NestJS dependencies - shareable between API and Settlement
 *
 * NEW Training Model:
 * - All players receive stamina recovery: staminaIntensity × 0.5 × fitnessCoachBonus
 * - Only assigned players receive specialized training:
 *   (1 - staminaIntensity) × 0.5 × assignedCoachBonus × BASE × ageFactor
 *
 * Coach limits:
 * - Max 2 specialized coaches per team (excludes HEAD_COACH, TEAM_DOCTOR)
 * - Each specialized coach can train max 3 players
 * - Fitness coach provides stamina recovery bonus
 */

import { PlayerSkills, TrainingCategory } from '../entities/player.entity';
import { StaffEntity, StaffRole } from '../entities/staff.entity';
import {
    TRAINING_SETTINGS,
    getAgeTrainingFactor,
    getSkillUpgradeCost,
    getSkillTrainingSpeed,
} from '../constants/training.constants';

export { TrainingCategory } from '../entities/player.entity';

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
 * Calculate fitness coach bonus for stamina recovery
 * Includes head coach + fitness coach bonuses
 */
export function calculateFitnessCoachBonus(staffList: StaffEntity[]): number {
    const activeStaff = staffList.filter(s => s.isActive);

    // Head coach bonus
    const headCoach = activeStaff.find(s => s.role === StaffRole.HEAD_COACH);
    const headBonus = headCoach
        ? headCoach.level * TRAINING_SETTINGS.COACH_BONUS_PER_LEVEL
        : 0;

    // Fitness coach bonus
    const fitnessCoach = activeStaff.find(s => s.role === StaffRole.FITNESS_COACH);
    const fitnessBonus = fitnessCoach
        ? fitnessCoach.level * TRAINING_SETTINGS.COACH_BONUS_PER_LEVEL
        : 0;

    return 1 + headBonus + fitnessBonus;
}

/**
 * Calculate assigned coach bonus for specialized training
 * Includes head coach + assigned coach bonuses
 */
export function calculateAssignedCoachBonus(
    staffList: StaffEntity[],
    assignedCoachLevel: number,
): number {
    const activeStaff = staffList.filter(s => s.isActive);

    // Head coach bonus
    const headCoach = activeStaff.find(s => s.role === StaffRole.HEAD_COACH);
    const headBonus = headCoach
        ? headCoach.level * TRAINING_SETTINGS.COACH_BONUS_PER_LEVEL
        : 0;

    // Assigned specialized coach bonus
    const assignedBonus = assignedCoachLevel * TRAINING_SETTINGS.COACH_BONUS_PER_LEVEL;

    return 1 + headBonus + assignedBonus;
}

/**
 * Calculate specialized training points for an assigned player
 * Formula: (1 - staminaIntensity) × 0.5 × assignedCoachBonus × BASE × ageFactor
 */
export function calculateSpecializedTrainingPoints(
    age: number,
    staminaIntensity: number,
    assignedCoachBonus: number,
): number {
    const ageFactor = getAgeTrainingFactor(age);
    const basePoints = TRAINING_SETTINGS.BASE_WEEKLY_TRAINING;

    const points = (1 - staminaIntensity)
        * 0.5
        * assignedCoachBonus
        * basePoints
        * ageFactor;

    return Math.round(points * 100) / 100;
}

/**
 * Calculate weekly stamina change for a player
 * Returns stamina gain (not net change - caller calculates net)
 */
export function calculateStaminaGain(
    staminaIntensity: number,
    fitnessCoachBonus: number,
): number {
    return staminaIntensity * 0.5 * fitnessCoachBonus;
}

/**
 * Get player skill keys for a player type
 */
export function getPlayerSkillKeys(isGoalkeeper: boolean): string[] {
    if (isGoalkeeper) {
        return ['pace', 'strength', 'reflexes', 'handling', 'aerial', 'positioning', 'composure', 'freeKicks', 'penalties'];
    }
    return ['pace', 'strength', 'finishing', 'passing', 'dribbling', 'defending', 'positioning', 'composure', 'freeKicks', 'penalties'];
}

/**
 * Get skill level from player skills object
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
 * Points are converted to skill fractional levels without waste
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

    let currentLevel = getSkillLevel(currentSkills, selectedKey);
    const potentialLevel = getSkillLevel(potentialSkills, selectedKey);
    const skillSpeed = getSkillTrainingSpeed(selectedKey);
    const DECIMAL_PLACES = 4;

    let remainingPoints = totalPoints;

    while (remainingPoints > 0) {
        const currentIntegerLevel = Math.floor(currentLevel);
        const nextIntegerLevel = currentIntegerLevel + 1;

        if (currentIntegerLevel >= potentialLevel) {
            break;
        }

        const upgradeCost = getSkillUpgradeCost(currentIntegerLevel) / skillSpeed;
        const levelsToNextInteger = Math.round((nextIntegerLevel - currentLevel) * 1000) / 1000;
        const pointsNeededForOneLevel = upgradeCost * levelsToNextInteger;

        if (remainingPoints < pointsNeededForOneLevel) {
            const fractionalProgress = remainingPoints / upgradeCost;
            const newLevel = currentLevel + fractionalProgress;
            currentLevel = Math.min(
                potentialLevel,
                Math.round(newLevel * Math.pow(10, DECIMAL_PLACES)) / Math.pow(10, DECIMAL_PLACES)
            );
            totalSpent += remainingPoints;
            remainingPoints = 0;
        } else {
            remainingPoints -= pointsNeededForOneLevel;
            totalSpent += pointsNeededForOneLevel;
            currentLevel = nextIntegerLevel;
        }
    }

    const oldLevel = getSkillLevel(currentSkills, selectedKey);
    const levelsGained = Math.max(0, Math.floor(currentLevel) - Math.floor(oldLevel));

    if (levelsGained > 0 || totalPoints > 0) {
        setSkillLevel(currentSkills, selectedKey, currentLevel);
        gains.push({ skill: selectedKey, levels: levelsGained });
    }

    return { gains, totalSpent };
}

/**
 * Apply specialized training to a player for given weeks
 */
export function applySpecializedTraining(
    playerId: string,
    age: number,
    currentSkills: PlayerSkills,
    potentialSkills: PlayerSkills,
    isGoalkeeper: boolean,
    staminaIntensity: number,
    assignedCoachBonus: number,
    weeksElapsed: number = 1,
    trainingSkill?: string | null,
): TrainingResult {
    const weeklyPoints = calculateSpecializedTrainingPoints(
        age,
        staminaIntensity,
        assignedCoachBonus,
    );

    if (weeklyPoints === 0) {
        return {
            playerId,
            weeklyPoints: 0,
            skillsGained: [],
            totalPointsSpent: 0,
        };
    }

    const totalPoints = weeklyPoints * weeksElapsed;
    const result = distributeTrainingPoints(
        currentSkills,
        potentialSkills,
        totalPoints,
        isGoalkeeper,
        trainingSkill,
    );

    return {
        playerId,
        weeklyPoints,
        skillsGained: result.gains,
        totalPointsSpent: result.totalSpent,
    };
}
