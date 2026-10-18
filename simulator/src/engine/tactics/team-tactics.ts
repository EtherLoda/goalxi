import { TeamTacticCode } from '@goalxi/database';
import { resolveStyle, StyleModifiers } from '../style';

/**
 * 球队战术 → 风格修正。
 *
 * 五条硬约束（2026-10-18 与维护者确认）：
 *
 *  1. **只做全局 + 分路，不做位置族。** 按位置族加权会和换人 / 场上移位
 *     指令交互出「倍率跟人还是跟位置」的歧义。
 *  2. **不改球路偏好。** 引擎的 29/42/29 分路分配保持中性。如果战术能决定
 *     「这一球走哪条路」，最优解就是把球全塞进自己加成最高的那条，五战术
 *     退化成五种堆单路的固定套路，对手无法反制。
 *  3. **数值收敛。** 分路 × 分阶段那 9 个数一律 ≤8%，且**加权平均 = 1.00**
 *     （权重 0.29 / 0.42 / 0.29）—— 战术改变强弱分布，不改变整体强度，
 *     所以不会数值爆炸。其余维度每战术最多 3 个数，重要参数（控球）≤8%。
 *  4. **只落在已有风格面上。** 不引入新机制。
 *  5. **每个战术必须有可辨认的形状。** 差异体现在「哪条路更强 / 怎么推进 /
 *     怎么消耗」，而不是同一套数字的微调。
 *
 * 数值是**起点**，不是最终标定值。改动任何一个数字都要重跑
 * `debug-tactic-mix.spec.ts`（本地探针，见 .gitignore）。
 */

/** 三路同值：全局轻推。 */
const ALL_LANES = (attack: number, possession: number, defense: number) => ({
  left: { attack, possession, defense },
  center: { attack, possession, defense },
  right: { attack, possession, defense },
});

/** 中路重点 / 两翼让位（零和，加权平均 = 1.00）。 */
const CENTER_WEIGHTED = {
  left: { attack: 0.94, possession: 0.94, defense: 1.02 },
  center: { attack: 1.08, possession: 1.08, defense: 0.97 },
  right: { attack: 0.94, possession: 0.94, defense: 1.02 },
};

/** 两翼重点 / 中路让位（零和，加权平均 = 1.00）。 */
const WING_WEIGHTED = {
  left: { attack: 1.07, possession: 1.05, defense: 1.03 },
  center: { attack: 0.9, possession: 0.93, defense: 0.96 },
  right: { attack: 1.07, possession: 1.05, defense: 1.03 },
};

const TACTIC_STYLES: Record<TeamTacticCode, Partial<StyleModifiers>> = {
  /**
   * 传控压迫：用控球压住对手，代价是进攻和防守都不硬。
   * 形状：三路控球 +8%（加权均值 1.08），三路进攻/防守 −5%。
   * 买的是**球权**，不是射门质量；推进方式压向短传。
   */
  [TeamTacticCode.POSSESSION]: {
    lanePhaseMultipliers: ALL_LANES(0.95, 1.08, 0.95),
    attackTypeWeights: [0.7, 1.4, 1.0, 0.9, 0.5],
    foulRate: 0.95,
  },

  /**
   * 高位逼抢：把比赛压到对方半场，靠断球和转换拿机会。
   * 形状：三路进攻/控球 +5%，三路防守 −4%（身后空档）。
   * 代价：犯规 +5%、体能 +5%。
   *
   * 2026-10-18 首轮标定（4 种阵容 × 1200 场）：犯规 1.10 / 体能 1.10 /
   * 防守 0.94 时四种形状全负（平均 −1.43pp）。犯规在引擎里是纯亏损
   * （实测 ±50% 约 ∓4.7pp），所以把它和体能都压到 1.05，并放宽防守到 0.96。
   */
  [TeamTacticCode.HIGH_PRESS]: {
    lanePhaseMultipliers: ALL_LANES(1.05, 1.05, 0.96),
    attackTypeWeights: [1.0, 1.0, 1.1, 1.1, 0.8],
    interceptChance: 1.2,
    foulRate: 1.05,
    fitnessDecay: 1.05,
  },

  /**
   * 防守反击：让出球权，靠拦截和快速向前。
   * 形状：三路防守 +6%，三路控球 −5%（加权均值 1.06 / 0.95）。
   * 断球在均势就有 10% 基线（见 DUEL_PROFILES.intercept），这里再抬 20%。
   *
   * 2026-10-18 首轮标定：控球 0.92 时在「防守强」阵容上最差（−3.3pp）——
   * 防守型阵容本来球权就少，再让 8% 直接没球可踢。控球收到 0.95。
   */
  [TeamTacticCode.COUNTER]: {
    lanePhaseMultipliers: ALL_LANES(1.0, 0.95, 1.06),
    attackTypeWeights: [0.8, 0.8, 1.4, 1.3, 0.9],
    interceptChance: 1.2,
    counterBonus: 1.2,
    fitnessDecay: 0.95,
  },

  /**
   * 中路渗透：从中路密集区用直塞打穿。
   * 形状：中路攻/控 +8%，两翼 −6%，中路防守 −3% / 两翼 +2%（压上留空档）。
   * 零和：加权平均正好 1.00 —— 它不买净收益，只买「中路更好打」。
   * 收益主要来自 THROUGH_PASS（实测转化 56.8%，对照 CROSS 39.8%）。
   */
  [TeamTacticCode.CENTRAL]: {
    lanePhaseMultipliers: CENTER_WEIGHTED,
    attackTypeWeights: [0.6, 1.2, 1.5, 1.1, 0.5],
  },

  /**
   * 双翼齐飞：把进攻铺到两边，靠传中和边路人数。
   * 形状：两翼攻 +7% / 控 +5%，中路攻 0.90 / 控 0.93（加权平均 1.00），
   * 中路防守 −4%。
   * 偏 CROSS（单次转化最低），收益不在单次射门而在死球数量：
   * 一场约三成进球来自定位球。
   *
   * 2026-10-18 首轮标定：两翼进攻 1.05 时平均 −0.82pp。传中转化只有
   * 42.7%（对照直塞 56.8%），需要更多进攻权重补偿，所以两翼提到 1.07、
   * 中路压到 0.90（加权平均仍 = 1.00）。
   */
  [TeamTacticCode.WINGS]: {
    lanePhaseMultipliers: WING_WEIGHTED,
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
