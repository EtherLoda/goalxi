/**
 * 对抗概率核心公式
 *
 * 设计目标（业务直觉）：
 *   1. 双方差距不大时，结果差距也不大（小差距 → 结果几乎 50/50）
 *   2. 差距大的时候，结果差距要比小差距大得多（凸性放大）
 *   3. 2 倍数值差应有压倒性优势（约 80% 胜率）
 *
 * 数学形式：
 *   log_r = ln(valA / valB)
 *   v     = sign(log_r) · |log_r|^a
 *   k     = (logit(anchorP) − logit(baseline)) / ln(anchorRatio)^a   ← 由锚点反推
 *   z     = k · v + logit(baseline)
 *   P     = sigmoid(z)
 *
 * 性质：
 *   - 对称：P(valA, valB) + P(valB, valA) = 1
 *   - 单调：valA 越大，P 越大
 *   - 凸性：a > 1 时小差距压缩、大差距放大
 *   - 锚点：P(anchorRatio) = anchorProbability
 */

export interface DuelOptions {
  /** 凸性强度。>1 时小差距压缩、大差距放大；1.0 = 标准 log-ratio sigmoid。默认 2.0 */
  amplification?: number;
  /** 对等时的基线概率。默认 0.5 */
  baseline?: number;
  /** 锚定 ratio，k 会反推使 P(anchorRatio) ≈ anchorProbability。默认 2.0 */
  anchorRatio?: number;
  /** 锚定概率。默认 0.80 */
  anchorProbability?: number;
}

/**
 * 计算 A 在对抗中胜出的概率。
 *
 * 默认参数下：
 *   - P(1.0) = 0.50
 *   - P(1.1) ≈ 0.51
 *   - P(1.3) ≈ 0.55
 *   - P(1.5) ≈ 0.62
 *   - P(2.0) = 0.80  ← 锚点
 *   - P(2.5) ≈ 0.92
 *   - P(3.0) ≈ 0.97
 */
export function duelProbability(
  valA: number,
  valB: number,
  options: DuelOptions = {},
): number {
  // k 反推：保证 P(anchorRatio) = anchorProbability 且 P(1) = baseline
  // 即 k · ln(anchorRatio)^a + logit(baseline) = logit(anchorProbability)
  //   k · ln(anchorRatio)^a = logit(anchorProbability) − logit(baseline)
  // k 仅依赖 options,不依赖 valA/valB。整个 match 内的所有
  // `duelProbability` 调用只会落在 ~6-8 个不同的 options 组合
  // (midfield / push / 5 种 shot / corner),用 string-key
  // cache 把 4 个 Math 常量 (anchorLogR / anchorV / baselineShift
  // / anchorZ → k) 算一次,后续命中后这 4 行都是 0 cost。
  // 60-80 calls/match × ~200ns/4-Math-op 节省 ≈ 10-15µs/match。
  // cache 容量上限受引擎 options 字面量集合约束(~8 个 entry),
  // 不会无界增长。
  const key =
    `${options.amplification ?? 2}|${options.baseline ?? 0.5}|` +
    `${options.anchorRatio ?? 2}|${options.anchorProbability ?? 0.8}`;
  let coeff = duelCoeffCache.get(key);
  if (coeff === undefined) {
    const amp = options.amplification ?? 2.0;
    const baseline = options.baseline ?? 0.5;
    const anchorRatio = options.anchorRatio ?? 2.0;
    const anchorProbability = options.anchorProbability ?? 0.8;
    const anchorLogR = Math.log(anchorRatio);
    const anchorV = Math.pow(anchorLogR, amp);
    const baselineShift = Math.log(baseline / (1 - baseline));
    const anchorZ = Math.log(anchorProbability / (1 - anchorProbability));
    const k = (anchorZ - baselineShift) / anchorV;
    coeff = { amp, baselineShift, k };
    duelCoeffCache.set(key, coeff);
  }

  const safeA = Math.max(valA, 1e-3);
  const safeB = Math.max(valB, 1e-3);

  const logR = Math.log(safeA / safeB);
  const v = Math.sign(logR) * Math.pow(Math.abs(logR), coeff.amp);
  const z = coeff.k * v + coeff.baselineShift;

  return 1 / (1 + Math.exp(-z));
}

/**
 * Per-options coefficient cache. Holds the four Math
 * constants that `duelProbability` derives from `options` but
 * not from `valA`/`valB`. Keys are the four option values
 * joined with `|` (cheap, distinct, and the only call sites
 * pass a small fixed set of literals so the cache is bounded
 * by the engine's option domain).
 */
const duelCoeffCache = new Map<
  string,
  { amp: number; baselineShift: number; k: number }
>();

/**
 * 根据 duelProbability 决定布尔结果。封装 RNG 便于测试时注入确定性随机源。
 *
 * @example
 *   const ok = resolveDuel(attacker.strength, defender.strength, { amplification: 2.0 });
 */
export function resolveDuel(
  valA: number,
  valB: number,
  options: DuelOptions = {},
  rng: () => number = Math.random,
): boolean {
  return rng() < duelProbability(valA, valB, options);
}
