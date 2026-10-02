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

// Persistent-stamina ceiling. The DB column and the weekly tick
// both clamp at this value so a player can never store 6.0 — the
// small gap (5.99 vs 6.0) gives the in-match simulator room to
// recover above the static ceiling during half-time. See
// simulator/src/engine/classes/Team.ts:updateCondition for the
// in-match 6.0 cap.
export const STAMINA_MAX = 5.99;
export const STAMINA_MIN = 0;
export const PEAK_AGE = 23;

/**
 * Per-week stamina decay.
 *
 * ## Deliberately NOT rescaled when the season was compressed 16 → 11 weeks
 *
 * Every other per-week constant in this file's neighbourhood was converted
 * to a per-game-year constant so the arc a player traverses stays identical
 * (see `DECLINE_BASE_RATE` and `BASE_WEEKLY_TRAINING_PER_YEAR`). Stamina is
 * the exception, and the reason is that it is a BOUNDED, CONVERGING state
 * rather than a cumulative one — so "preserve the per-year total" is the
 * wrong invariant for it.
 *
 * Measured, not assumed:
 *
 *   - The equilibrium is set by the gain:decay ratio, and scaling both by
 *     16/11 leaves it BIT-IDENTICAL (5.7000 for intensity 0.5 / coach ×1,
 *     0 for intensity 0) because it scales numerator and denominator
 *     together. So the stamina a player settles at — the thing that decides
 *     whether the system matters at all — is unaffected either way.
 *   - Scaling both makes the trajectory converge faster, and lands the
 *     year-end value FURTHER from the old behaviour, not closer: starting
 *     from 3.0 at age 23, the 16-week baseline ends at 5.700, unscaled
 *     11-week at 5.001, scaled 11-week at 4.696. There is no single factor
 *     that reproduces a 16-step trajectory in 11 steps, because
 *     `calculateStaminaFactor` is state-dependent and the clamp binds.
 *
 * So the accepted consequence of leaving it alone is a player ending a
 * season ~0.7 (on a 0-6 scale) fresher than before, at the same
 * equilibrium. Revisit if that reads wrong in play.
 *
 * Also note: `calculateFitnessDecay` in the simulator's `ConditionSystem`
 * is a pure in-match computation with NO write-back — `player.stamina` is
 * written in exactly one production place, the weekly tick in
 * `training.processor.ts`. So the number of fixtures per week does not
 * compound into this value at all.
 */
export const BASE_DECAY_RATE = 0.05;

export interface StaminaResult {
    playerId: number;
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
    playerId: number,
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
