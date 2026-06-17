/**
 * Injury Recovery Calculator — 伤病恢复纯函数
 *
 * 无数据库 / NestJS 依赖,在 API / Settlement / Simulator 之间共享,
 * 避免恢复公式在三处各自漂移。
 *
 * 公式 (确定性,无随机浮动):
 *   sigmoid = base + amplitude / (1 + exp(k × (age - midpoint)))
 *   dailyRecovery = round(sigmoid × 10 × doctorBonus) / 10
 *   doctorBonus = 1 + doctorLevel × 0.1
 *   estimatedDays = ceil(currentInjuryValue / dailyRecovery)
 *
 * 数值参考 (无队医):
 *   age 16: ~12 点 / 天
 *   age 28: ~7.5 点 / 天  (拐点)
 *   age 36: ~4 点 / 天
 */

/** sigmoid 曲线参数 */
const RECOVERY_MIDPOINT = 28;
const RECOVERY_STEEPNESS = 0.25;
const RECOVERY_BASE = 3;
const RECOVERY_AMPLITUDE = 9;

/** 每级队医 +10% 恢复速率 */
const DOCTOR_BONUS_PER_LEVEL = 0.1;

/**
 * 计算单日恢复值。
 *
 * @param playerAge 球员真实年龄 (可带小数, e.g. 23.4)
 * @param doctorLevel 队医等级 (0 = 无队医). 1-5
 * @returns 单日恢复的伤病值 (保留 1 位小数)
 */
export function calculateDailyRecovery(playerAge: number, doctorLevel: number = 0): number {
    const sigmoid =
        RECOVERY_BASE +
        RECOVERY_AMPLITUDE /
            (1 + Math.exp(RECOVERY_STEEPNESS * (playerAge - RECOVERY_MIDPOINT)));

    const doctorBonus = 1 + Math.max(0, doctorLevel) * DOCTOR_BONUS_PER_LEVEL;

    return Math.round(sigmoid * 10 * doctorBonus) / 10;
}

/**
 * 估算从当前伤病值完全康复所需天数。
 *
 * @param currentInjuryValue 当前伤病值
 * @param playerAge 球员年龄
 * @param doctorLevel 队医等级
 * @returns 估算剩余天数 (>= 1, 已恢复返回 0)
 */
export function estimateRecoveryDays(
    currentInjuryValue: number,
    playerAge: number,
    doctorLevel: number = 0,
): number {
    if (currentInjuryValue <= 0) return 0;

    const dailyRecovery = calculateDailyRecovery(playerAge, doctorLevel);
    if (dailyRecovery <= 0) return Number.POSITIVE_INFINITY;

    return Math.max(1, Math.ceil(currentInjuryValue / dailyRecovery));
}
