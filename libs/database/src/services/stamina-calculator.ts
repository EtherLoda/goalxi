/**
 * Stamina Calculator - Pure calculation logic for stamina system
 * No database or NestJS dependencies - shareable between API and Settlement
 *
 * Formula (based on FitnessSystem):
 * - decay = BASE_DECAY_RATE * ageFactor * staminaFactor
 * - ageFactor = 1 + (age - 23)^2 * 0.005
 * - staminaFactor = (stamina + 1)^1.2 / 5
 * - trainingGain = physicalIntensity * 0.5 * coachBonus
 * - netChange = trainingGain - decay
 */

export const STAMINA_MAX = 5.99;
export const STAMINA_MIN = 0;
export const PEAK_AGE = 23;
export const BASE_DECAY_RATE = 0.05;

export interface StaminaResult {
    playerId: string;
    staminaBefore: number;
    staminaAfter: number;
    netChange: number;
    decay: number;
    trainingEffect: number;
}

/**
 * Calculate age factor based on parabolic function
 * 23岁时 ageFactor = 1.0 (最小衰减)
 * 17岁时 ageFactor ≈ 1.18, 34岁时 ageFactor ≈ 1.72
 */
export function calculateAgeFactor(age: number): number {
    const ageGap = age - PEAK_AGE;
    return 1 + ageGap * ageGap * 0.005;
}

/**
 * Calculate stamina factor - higher stamina = faster natural decay
 */
export function calculateStaminaFactor(currentStamina: number): number {
    return Math.pow(currentStamina + 1, 1.2) / 5;
}

/**
 * Calculate weekly stamina decay
 * 受年龄和当前体能两个维度影响
 */
export function calculateDecay(age: number, currentStamina: number): number {
    const ageFactor = calculateAgeFactor(age);
    const staminaFactor = calculateStaminaFactor(currentStamina);
    return BASE_DECAY_RATE * ageFactor * staminaFactor;
}

/**
 * Calculate training effect (gain) from training percentage
 * physicalIntensity 是 0-1 的比例，0.5 是效率常数
 */
export function calculateTrainingEffect(
    physicalIntensity: number,
    coachBonus: number,
): number {
    return physicalIntensity * 0.5 * coachBonus;
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
 * 当 trainingEffect = decay 时，刚好维持体能 (netChange = 0)
 */
export function calculateWeeklyStaminaChange(
    playerId: string,
    currentStamina: number,
    age: number,
    physicalIntensity: number,
    coachBonus: number,
): StaminaResult {
    const decay = calculateDecay(age, currentStamina);
    const trainingEffect = calculateTrainingEffect(physicalIntensity, coachBonus);

    const netChange = trainingEffect - decay;
    const maxStamina = calculateMaxStamina(age);
    const staminaAfter = Math.max(
        STAMINA_MIN,
        Math.min(maxStamina, currentStamina + netChange),
    );

    return {
        playerId,
        staminaBefore: currentStamina,
        staminaAfter,
        netChange,
        decay,
        trainingEffect,
    };
}
