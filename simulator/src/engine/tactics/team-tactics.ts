import { TeamTacticCode } from '@goalxi/database';
import { resolveStyle, StyleModifiers } from '../style';

/**
 * 球队战术 → 风格修正。
 *
 * 三条硬约束（2026-10-18 与维护者确认）：
 *
 *  1. **只做全局。** 每个字段都乘在整队量上，不按位置族加权。按族加权会和
 *     换人 / 场上移位指令交互出「倍率跟人还是跟位置」的歧义，而且会让
 *     「这个战术要哪些位置」既由要求表又由加成表表达，重复。
 *  2. **只落在已有风格面上。** 这里出现过的字段全部在 `StyleModifiers` 里
 *     已经接进引擎读取点；不引入新机制。`positionFamilyMultipliers` 因此
 *     不使用。
 *  3. **每个战术必须有可辨认的赢法。** 五个战术的差异必须体现在
 *     「怎么制造机会 / 怎么消耗 / 怎么拿球」上，而不是同一套数字的微调。
 *
 * 数值是**起点**，不是最终标定值：斜率都按目标胜率差反解，不照抄别的
 * 游戏。改动这里的任何一个数字都要重新跑 `debug-style-calibration`。
 */
const TACTIC_STYLES: Record<TeamTacticCode, Partial<StyleModifiers>> = {
  /**
   * 传控压迫：用控球和人数优势压住对手。
   * 买的是**球权**（possessionControl）和**低风险推进**（偏向短传），
   * 代价是进攻方式单一、远射和长传几乎不用。
   */
  [TeamTacticCode.POSSESSION]: {
    possessionControl: 1.12,
    attackTypeWeights: [0.7, 1.4, 1.0, 0.9, 0.5],
    foulRate: 0.9,
    fitnessDecay: 0.95,
  },

  /**
   * 高位逼抢：把比赛压到对方半场，靠断球和转换拿机会。
   * 买的是**断球概率**（interceptChance）；代价是体能（fitnessDecay）
   * 和犯规（foulRate）—— 实测犯规率每 +50% 约亏 4.7pp 胜率，
   * 所以这里只给到 1.10，其余收益必须由断球和转换来兑现。
   */
  [TeamTacticCode.HIGH_PRESS]: {
    attackTypeWeights: [1.0, 1.0, 1.1, 1.1, 0.8],
    interceptChance: 1.4,
    pushPower: 1.05,
    foulRate: 1.1,
    fitnessDecay: 1.15,
  },

  /**
   * 防守反击：让出球权，靠拦截和快速向前。
   * 买的是**断球 + 反击强度**，代价是控球率（possessionControl 0.88）
   * 和进攻方式的单一。断球本身在均势就有 10% 基线（见
   * DUEL_PROFILES.intercept），这里是把整条曲线再抬 50%。
   */
  [TeamTacticCode.COUNTER]: {
    possessionControl: 0.88,
    attackTypeWeights: [0.8, 0.8, 1.4, 1.3, 0.9],
    interceptChance: 1.5,
    counterBonus: 1.5,
    fitnessDecay: 0.95,
  },

  /**
   * 中路渗透：从中路密集区用直塞打穿。
   * 靠**进攻方式组合**拿收益：THROUGH_PASS 是引擎里转化率最高的推进方式
   * （实测 56.8%，对照 CROSS 39.8% / LONG_SHOT 22.9%），所以它不靠倍率，
   * 靠把球更多地送进那条分支。代价是边路几乎不用、被压缩时没有备选。
   */
  [TeamTacticCode.CENTRAL]: {
    possessionControl: 1.05,
    attackTypeWeights: [0.6, 1.2, 1.5, 1.1, 0.5],
  },

  /**
   * 双翼齐飞：把进攻铺到两边，靠传中和边路人数。
   * 同样是进攻方式组合，偏 CROSS。CROSS 单次转化率最低，但它制造的
   * 角球是定位球进球的入口（一场定位球约占三成进球），所以它的收益
   * 不在单次射门上，而在死球数量上。
   */
  [TeamTacticCode.WINGS]: {
    attackTypeWeights: [1.7, 0.8, 0.8, 1.1, 0.6],
  },
};

/**
 * 把战术代码解析成风格修正。`null` / `undefined` = 不选战术 = 全中性，
 * 与引入战术系统之前的行为逐位一致。
 */
export function resolveTeamTacticStyle(
  tactic?: TeamTacticCode | null,
): StyleModifiers {
  if (!tactic) return resolveStyle();
  return resolveStyle(TACTIC_STYLES[tactic]);
}

/** 供测试与校准脚本读取原始表（不要在生产路径上绕过 resolve）。 */
export const TEAM_TACTIC_STYLES = TACTIC_STYLES;
