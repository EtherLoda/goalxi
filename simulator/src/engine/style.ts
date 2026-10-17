/**
 * 打法风格（style）修正系数。
 *
 * 一个 `StyleModifiers` 描述「这支球队的打法如何改变引擎里的对抗」。
 * 所有字段默认中性（`NEUTRAL_STYLE`），所以不挂风格时引擎行为与历史完全一致。
 *
 * 设计约束：
 *
 * 1. **全部是乘在球队自身量上的倍率，不是对决基准值。** 对决基础
 *    （baseline / anchorProbability）是全局调参面，归 `DUEL_PROFILES` 管。
 *    风格如果去改基准值，「快 vs 快」和「慢 vs 慢」就会用不同基准，
 *    模型无法解释也无法对外展示预期概率。
 *
 * 2. **不新增持久状态。** 风格在模拟时从战术行解析出来，比赛结束即丢弃；
 *    引擎不做任何跨场记忆。
 *
 * 3. **不暴露给玩家。** 这里的系数属于引擎内部（参见 CLAUDE.md 的
 *    「player-facing help: no engine internals」），面板只能展示
 *    定性的优先级与描述。
 *
 * 之所以把这些字段集中成一张表而不是散落在调用点：所有风格杠杆都可以
 * 被同一个标定流程（`debug-style-calibration.spec.ts`）扫描，从而把
 * 「小克 / 大克」定义成目标胜率差而不是拍脑袋的倍率。
 */
export interface StyleModifiers {
  /**
   * 进攻推进力倍率。乘在 `effectiveAttPower` 上（推进入口那一步）。
   * 支点 / 冲吊类打法 > 1。
   */
  pushPower: number;

  /**
   * 控球阶段通道强度倍率。乘在中场拼抢用的 possession 通道强度上。
   * 控球流 > 1（它买的是球权，不是射门质量）。
   */
  possessionControl: number;

  /**
   * 拦截阈值下调量。引擎的拦截条件是 `defRatio > interceptThreshold`
   * （默认 1.3）。负值 = 更容易拦截。
   *
   * ⚠️ 这是风格面里增益最高的一个杠杆：均势对局里 `defRatio` 典型值
   * 只有 1.0–1.1，也就是说默认阈值下拦截**几乎不触发**（1.4 → 1%、
   * 2.0 → 7%、4.0 才封顶 25%）。把阈值降到 1.15 就能让「断球反击」
   * 从罕见事件变成常规事件 —— 阈值跨越是阶跃的，收益远大于任何
   * 5% 的乘法。防守反击风格应该主要动这里。
   */
  interceptThresholdDelta: number;

  /** 断球概率倍率，乘在 `(defRatio - 阈值) × interceptSlope` 上。 */
  interceptChance: number;

  /** 反击加成倍率，乘在 `(defRatio - 阈值) × counterBonusSlope` 上。 */
  counterBonus: number;

  /**
   * 每位置族的贡献倍率，键是**规范化后**的 positionKey
   * （GK / CB / LB / RB / DM / CM / AM / LW / RW / CF ...，见
   * `normalizePositionKey`）。`null` = 不改。
   *
   * 这是「梦幻西游式」按角色给增益的载体：风格 × 位置族，而不是
   * 阵型 × 槽位 —— 阵型决定哪几个位置在场，风格给这些位置加成，
   * 两者的交互是涌现出来的，不需要一张 风格×槽位 的矩阵。
   */
  positionFamilyMultipliers?: Record<string, number>;

  /**
   * 进攻方式倾向，5 元素倍率，下标即 `AttackType`
   * `[CROSS, SHORT_PASS, THROUGH_PASS, DRIBBLE, LONG_SHOT]`。
   * `null` = 不改。
   *
   * 注意这改的是**打法组合**而不是强度：它决定球怎么被推进前场，
   * 进而决定选到哪种 `ShotType`。这正是「长传冲吊 vs 控球」应该
   * 落地的位置。
   */
  attackTypeWeights?: readonly number[];

  /** 犯规倾向倍率。> 1 更容易犯规（更多定位球机会，也更多牌）。 */
  foulRate: number;

  /** 体能衰减倍率。> 1 更耗体能（高压打法的代价）。 */
  fitnessDecay: number;
}

/** 全中性风格：不挂风格时的引擎行为。 */
export const NEUTRAL_STYLE: StyleModifiers = {
  pushPower: 1,
  possessionControl: 1,
  interceptThresholdDelta: 0,
  interceptChance: 1,
  counterBonus: 1,
  foulRate: 1,
  fitnessDecay: 1,
};

/** 用一组覆盖值构造风格，未提供的字段取中性值。 */
export function resolveStyle(
  partial?: Partial<StyleModifiers>,
): StyleModifiers {
  return { ...NEUTRAL_STYLE, ...partial };
}
