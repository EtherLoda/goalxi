/**
 * Condition Calculator - Pure calculation logic for player form/condition system
 * No database or NestJS dependencies - shareable between API and Settlement
 *
 * Formula:
 * hidden = playTime基准 + fanEmotion影响 + headCoach影响 + injury影响
 * convergenceRate = 0.3 + random × 0.2
 * visible += (hidden - visible) × convergenceRate + (random - 0.5)
 * visible = clamp(visible, 0, 5.99)
 */

export interface ConditionInputs {
    /** 当前 visible form 值 */
    currentForm: number;
    /** 本场比赛出场分钟数 */
    minutesPlayed: number;
    /** 球迷情绪 (0-100) */
    fanEmotion: number;
    /** 主教练 level (1-5) */
    headCoachLevel: number;
    /** 当前伤病值 > 0 表示受伤中 */
    currentInjuryValue: number;
}

/**
 * 计算球员出场基准值
 */
function getPlayTimeBaseline(minutesPlayed: number): number {
    if (minutesPlayed > 60) return 3.5;
    if (minutesPlayed > 0) return 3.0;
    return 2.5;
}

/**
 * 计算球迷情绪影响 (-0.3 到 +0.3)
 * fanEmotion: 0-100
 */
function getFanEmotionInfluence(fanEmotion: number): number {
    // fanEmotion 50 = 中间, 影响为 0
    // 高于 50 每点 +0.006, 低于 50 每点 -0.006
    return (fanEmotion - 50) * 0.006;
}

/**
 * 计算主教练影响 (-0.2 到 +0.2)
 * level: 1-5
 */
function getHeadCoachInfluence(headCoachLevel: number): number {
    // level 3 = 中间, 影响为 0
    // 高于 3 每级 +0.1, 低于 3 每级 -0.1
    return (headCoachLevel - 3) * 0.1;
}

/**
 * 计算伤病影响 (受伤中 -0.5)
 */
function getInjuryInfluence(currentInjuryValue: number): number {
    return currentInjuryValue > 0 ? -0.5 : 0;
}

/**
 * 计算隐藏状态 (hidden condition)
 */
export function calculateHiddenCondition(inputs: ConditionInputs): number {
    const { minutesPlayed, fanEmotion, headCoachLevel, currentInjuryValue } = inputs;

    const hidden =
        getPlayTimeBaseline(minutesPlayed) +
        getFanEmotionInfluence(fanEmotion) +
        getHeadCoachInfluence(headCoachLevel) +
        getInjuryInfluence(currentInjuryValue);

    return hidden;
}

/**
 * 计算更新后的 visible form
 * 使用随机收敛率和随机噪音
 */
export function calculateNewForm(currentForm: number, hiddenCondition: number): number {
    // 收敛率: 0.3 - 0.5
    const convergenceRate = 0.3 + Math.random() * 0.2;

    // 随机噪音: -0.5 到 +0.5
    const noise = Math.random() - 0.5;

    // 计算新值
    let newForm = currentForm + (hiddenCondition - currentForm) * convergenceRate + noise;

    // 限制范围 0 - 5.99
    newForm = Math.max(0, Math.min(5.99, newForm));

    return Math.round(newForm * 100) / 100;
}

/**
 * 完整的 form 更新计算
 */
export function updatePlayerForm(inputs: ConditionInputs): number {
    const hiddenCondition = calculateHiddenCondition(inputs);
    return calculateNewForm(inputs.currentForm, hiddenCondition);
}
