/**
 * Stamina Calculator - Pure calculation logic for stamina system
 * No database or NestJS dependencies - shareable between API and Settlement
 *
 * Formula:
 * - decay = 0.36 × (1 + (age - 17) × 0.044)
 * - ageFactor = max(0.3, 1 - (age - 17) × 0.035)
 * - efficiency = 1 / (1 + stamina × 0.9)
 * - trainingEffect = 20 × intensity × coachBonus × ageFactor × efficiency
 * - netChange = trainingEffect - decay
 */

export interface StaminaResult {
    playerId: string;
    staminaBefore: number;
    staminaAfter: number;
    netChange: number;
    decay: number;
    trainingEffect: number;
}

/**
 * Calculate stamina age factor
 * Younger players recover faster
 */
export function calculateAgeFactor(age: number): number {
    return Math.max(0.3, 1 - (age - 17) * 0.035);
}

/**
 * Calculate weekly stamina decay (regardless of current stamina)
 */
export function calculateStaminaDecay(age: number): number {
    return 0.36 * (1 + (age - 17) * 0.044);
}

/**
 * Calculate training efficiency
 * Higher current stamina = lower efficiency (harder to improve further)
 */
export function calculateStaminaEfficiency(currentStamina: number): number {
    return 1 / (1 + currentStamina * 0.9);
}

/**
 * Calculate training effect on stamina
 */
export function calculateTrainingEffect(
    physicalIntensity: number,
    coachBonus: number,
    age: number,
    currentStamina: number,
): number {
    const ageFactor = calculateAgeFactor(age);
    const efficiency = calculateStaminaEfficiency(currentStamina);
    return 20 * physicalIntensity * coachBonus * ageFactor * efficiency;
}

/**
 * Calculate maximum stamina based on age
 * Older players have lower stamina ceiling
 */
export function calculateMaxStamina(age: number): number {
    return 6.0 - (age - 17) * 0.05;
}

/**
 * Calculate weekly stamina change and return result
 */
export function calculateWeeklyStaminaChange(
    playerId: string,
    currentStamina: number,
    age: number,
    physicalIntensity: number,
    coachBonus: number,
): StaminaResult {
    const decay = calculateStaminaDecay(age);
    const trainingEffect = calculateTrainingEffect(
        physicalIntensity,
        coachBonus,
        age,
        currentStamina,
    );
    const netChange = trainingEffect - decay;
    const maxStamina = calculateMaxStamina(age);
    const staminaAfter = Math.max(0, Math.min(maxStamina, currentStamina + netChange));

    return {
        playerId,
        staminaBefore: currentStamina,
        staminaAfter,
        netChange,
        decay,
        trainingEffect,
    };
}
