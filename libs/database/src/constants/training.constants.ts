/**
 * Training system constants
 *
 * Age factor: 17 years = 1.0, decreasing linearly to 0.65 at age 36
 * Training cost per level: sigmoid curve, BASE=10, k=0.3, MID=10, SCALE=20
 * Weekly training points = BASE_WEEKLY × slotMultiplier × ageFactor × coachBonus
 *   where coachBonus = 1 + headBonus + relevantCategoryBonus
 */

export const TRAINING_SETTINGS = {
    /** Base training points earned per week */
    BASE_WEEKLY_TRAINING: 20,

    /** Training slot multipliers */
    ENHANCED_MULTIPLIER: 1.5,
    REGULAR_MULTIPLIER: 1.0,
    NONE_MULTIPLIER: 0,

    /** Age training factor: 1.0 at age 17, decreasing linearly */
    AGE_TRAINING_FACTOR: {
        MIN_AGE: 17,
        MIN_FACTOR: 1.0,
        MAX_AGE: 36,
        MAX_FACTOR: 0.65,
    },

    /** Coach bonus per level (5% per level) */
    COACH_BONUS_PER_LEVEL: 0.05,
};

/**
 * Calculate age factor using linear interpolation
 * age 17 = 1.0, age 36 = 0.65
 */
export function getAgeTrainingFactor(age: number): number {
    const { MIN_AGE, MIN_FACTOR, MAX_AGE, MAX_FACTOR } = TRAINING_SETTINGS.AGE_TRAINING_FACTOR;
    if (age <= MIN_AGE) return MIN_FACTOR;
    if (age >= MAX_AGE) return MAX_FACTOR;
    const slope = (MAX_FACTOR - MIN_FACTOR) / (MAX_AGE - MIN_AGE);
    return MIN_FACTOR + slope * (age - MIN_AGE);
}

/**
 * Calculate training cost for upgrading from `level` to `level + 1`
 * Formula: cost = 0.8 * level^2 + 20
 * Higher levels cost more, curve is monotonically increasing
 */
export function getSkillUpgradeCost(level: number): number {
    return 0.8 * level * level + 20;
}

/**
 * Total training cost to reach target level from start level
 */
export function getTotalTrainingCost(startLevel: number, targetLevel: number): number {
    let total = 0;
    for (let lvl = startLevel; lvl < targetLevel; lvl++) {
        total += getSkillUpgradeCost(lvl);
    }
    return total;
}

/**
 * Skill category to coach mapping
 * Key: StaffRole (without _COACH suffix)
 * Value: array of skill keys that belong to this category
 */
export const SKILL_CATEGORY_MAP: Record<string, string[]> = {
    physical: ['pace', 'strength'],
    technical: ['finishing', 'passing', 'dribbling', 'defending'],
    goalkeeper: ['reflexes', 'handling', 'aerial'],
    mental: ['positioning', 'composure'],
    setPieces: ['freeKicks', 'penalties'],
};

/**
 * Get which coach role handles which skill category
 */
export function getSkillCategory(skillKey: string): string | null {
    for (const [category, skills] of Object.entries(SKILL_CATEGORY_MAP)) {
        if (skills.includes(skillKey)) {
            return category;
        }
    }
    return null;
}

/**
 * Get staff role constant name from category name
 */
export function getCategoryCoachRole(category: string): string {
    const map: Record<string, string> = {
        physical: 'FITNESS_COACH',
        technical: 'TECHNICAL_COACH',
        goalkeeper: 'GOALKEEPER_COACH',
        mental: 'PSYCHOLOGY_COACH',
        setPieces: 'SET_PIECE_COACH',
    };
    return map[category] || '';
}

/**
 * Skill training speed multipliers
 * Based on how difficult each skill is to improve
 * Range: 0.8 - 1.2 (1.0 is baseline)
 *
 * Mental skills train faster (1.15-1.20)
 * Physical skills train slower (0.80-0.85)
 * Technical skills are moderate (0.85-1.00)
 */
export const SKILL_TRAINING_SPEED: Record<string, number> = {
    // Outfield skills
    finishing: 0.85,
    defending: 0.90,
    dribbling: 1.00,
    passing: 1.10,
    positioning: 1.25,
    pace: 0.88,
    strength: 0.90,
    composure: 1.30,
    // GK skills
    gk_reflexes: 0.80,
    gk_handling: 0.85,
    gk_aerial: 0.82,
    gk_positioning: 1.00,
    // Set piece skills (5x speed -选修技能，快速训练）
    freeKicks: 5.0,
    penalties: 5.0,
};

/**
 * Get training speed for a skill
 */
export function getSkillTrainingSpeed(skillKey: string): number {
    return SKILL_TRAINING_SPEED[skillKey] ?? 1.0;
}

// =====================
// PLAYER WAGE CALCULATION
// =====================

// Re-export from finance.constants (wage calculation belongs to finance, not training)
export { calculatePlayerWage, testWageCalculation, SKILL_WAGE_WEIGHT, GK_SKILL_WAGE_WEIGHT } from './finance.constants';
