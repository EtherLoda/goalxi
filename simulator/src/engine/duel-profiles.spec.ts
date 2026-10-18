import { duelProbability } from './duel';
import { DUEL_PROFILES, SHOT_TYPE_CONFIG } from './match.engine';
import { ShotType } from './types/simulation.types';

/**
 * 回归防护：`duelProbability` 的曲线由 (baseline, anchorProbability) 两点解出
 * 斜率 k = (logit(anchor) - logit(baseline)) / ln(anchorRatio)^amplification。
 *
 * 若 anchorProbability <= baseline，则 k <= 0，整条概率曲线**反向** ——
 * 评分更高的一方反而更难赢。这个 bug 曾经真实存在两处：
 *   - ONE_ON_ONE：baseline 0.65 配全局 anchor 0.55（k ≈ -0.87）
 *   - 点球：      baseline 0.75 配 anchor 0.55（k ≈ -1.30）
 *
 * 所以这里把「参数表本身」当作被测对象：任何新增/修改的对决参数只要踩了
 * 这个坑，本文件立刻失败。新增 `duelProbability` 调用点时，请把参数加到
 * `DUEL_PROFILES`（射门类加到 `SHOT_TYPE_CONFIG`），不要写内联字面量。
 */
describe('duel profiles — 斜率方向不变量', () => {
  const SHOT_AMPLIFICATION = 2.0;
  const SHOT_ANCHOR_RATIO = 2.0;

  interface Profile {
    name: string;
    options: {
      amplification: number;
      baseline: number;
      anchorRatio: number;
      anchorProbability: number;
    };
  }

  const shotProfiles: Profile[] = Object.values(ShotType)
    .filter((value): value is ShotType => typeof value === 'number')
    .map((shotType) => ({
      name: `shot:${ShotType[shotType]}`,
      options: {
        amplification: SHOT_AMPLIFICATION,
        baseline: SHOT_TYPE_CONFIG[shotType].baseline,
        anchorRatio: SHOT_ANCHOR_RATIO,
        anchorProbability: SHOT_TYPE_CONFIG[shotType].anchorProbability,
      },
    }));

  const profiles: Profile[] = [
    ...Object.entries(DUEL_PROFILES).map(([name, options]) => ({
      name,
      options: { ...options },
    })),
    ...shotProfiles,
  ];

  it('参数表覆盖了全部 12 个对决调用点（7 个 DUEL_PROFILES + 5 种射门）', () => {
    // 故意写死数量：以后新增一个调用点必须同时更新这里，避免新参数
    // 悄悄绕过下面的方向性断言。
    expect(Object.keys(DUEL_PROFILES).sort()).toEqual([
      'corner',
      'directFreeKick',
      'indirectFreeKick',
      'intercept',
      'midfield',
      'penalty',
      'push',
    ]);
    expect(shotProfiles.map((p) => p.name).sort()).toEqual([
      'shot:HEADER',
      'shot:LONG_SHOT',
      'shot:NORMAL',
      'shot:ONE_ON_ONE',
      'shot:REBOUND',
    ]);
    expect(profiles).toHaveLength(12);
  });

  it('每个参数都满足 anchorProbability > baseline', () => {
    const inverted = profiles
      .filter(({ options }) => options.anchorProbability <= options.baseline)
      .map(
        ({ name, options }) =>
          `${name}: baseline=${options.baseline} anchor=${options.anchorProbability}`,
      );

    expect(inverted).toEqual([]);
  });

  it('概率随攻方评分单调递增（斜率反向会立刻失败）', () => {
    const ratios = [0.3, 0.5, 0.7, 0.9, 1.0, 1.1, 1.5, 2.0, 3.0];
    const violations: string[] = [];

    for (const { name, options } of profiles) {
      const probabilities = ratios.map((ratio) =>
        duelProbability(100 * ratio, 100, options),
      );
      for (let i = 1; i < probabilities.length; i += 1) {
        if (!(probabilities[i] > probabilities[i - 1])) {
          violations.push(`${name} @ ratio ${ratios[i]}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  /**
   * 「锚点必须落在真实比值域之内」的回归防护。
   *
   * 2026-10-16 的根因：push 的 anchorRatio 是 2.0，但**推进阶段的真实
   * 比值域只有 0.92-2.70**，而且绝大多数比赛落在 1.0-1.5 这一段 ——
   * 也就是曲线最平的左侧。结果全属性翻倍也只换来 +6.4pp 推进率，
   * 强弱差根本兑现不出来。把锚点收到 1.5 之后，同样一段比值域才
   * 被真正用上。
   *
   * 断言：每个对决在「真实比值域的中点」处的概率，必须已经明显离开
   * 均势点 —— 否则说明锚点跑到了比值域之外，曲线在这个域内是平的。
   */
  it('锚点必须落在各自比值域附近，否则强弱差在域内兑现不出来', () => {
    // 每个调用点的真实比值域（from debug-strength-gap 的静态核算）
    const domains: Record<string, [number, number]> = {
      push: [0.92, 2.7],
      midfield: [0.86, 1.93],
      // 拦截的比值域和 push 是同一个（它用的就是攻击/防守通道强度），
      // 但域中点落在 1.53 附近而不是 1.57：拦截只需要在 1.4-1.6 就有
      // 明显反应，所以锚点 1.5 正好压在域中间。
      intercept: [0.9, 2.6],
    };

    const flat: string[] = [];
    for (const [name, [lo, hi]] of Object.entries(domains)) {
      const options = DUEL_PROFILES[name as keyof typeof DUEL_PROFILES];
      const mid = Math.sqrt(lo * hi); // 对数域中点
      const pMid = duelProbability(100 * mid, 100, options);
      const edge = pMid - options.baseline;
      // 中点处至少要区别于均势点 3pp，否则这一段域等于没用。
      if (edge < 0.03) {
        flat.push(
          `${name}: 域中点 r=${mid.toFixed(3)} 处仅 ${(edge * 100).toFixed(1)}pp，` +
            `anchorRatio=${options.anchorRatio} 落在比值域之外`,
        );
      }
    }

    expect(flat).toEqual([]);
  });

  it('对等点命中率 = baseline，锚点比值命中率 = anchorProbability', () => {
    const mismatches = profiles
      .map(({ name, options }) => {
        // 锚点比值从参数表里读，不要写死 2.0：各调用点的 anchorRatio
        // 未必相同（2026-10-16 把 push 收到 1.5，因为真实推进比值域
        // 根本到不了 2.0，锚点落在曲线平坦区时强弱差几乎兑现不出来）。
        const parity = duelProbability(100, 100, options);
        const anchor = duelProbability(100 * options.anchorRatio, 100, options);
        const ok =
          Math.abs(parity - options.baseline) < 1e-9 &&
          Math.abs(anchor - options.anchorProbability) < 1e-9;
        return ok
          ? null
          : `${name}: parity=${parity} (expect ${options.baseline}), anchor@${options.anchorRatio}x=${anchor} (expect ${options.anchorProbability})`;
      })
      .filter((entry): entry is string => entry !== null);

    expect(mismatches).toEqual([]);
  });

  it('回归：点球手评分越高命中率越高（历史上是反向的）', () => {
    const weak = duelProbability(15, 18, DUEL_PROFILES.penalty);
    const equal = duelProbability(18, 18, DUEL_PROFILES.penalty);
    const strong = duelProbability(22, 18, DUEL_PROFILES.penalty);

    expect(equal).toBeCloseTo(0.75, 10);
    expect(equal).toBeGreaterThan(weak);
    expect(strong).toBeGreaterThan(equal);
  });

  it('回归：1v1 射手评分越高进球率越高（历史上是反向的）', () => {
    const config = SHOT_TYPE_CONFIG[ShotType.ONE_ON_ONE];
    const options = {
      amplification: SHOT_AMPLIFICATION,
      baseline: config.baseline,
      anchorRatio: SHOT_ANCHOR_RATIO,
      anchorProbability: config.anchorProbability,
    };

    // 从 SHOT_TYPE_CONFIG 读 baseline 而不是写死字面量：这张表是
    // 「每场关键时刻密度」的倒数刻度，2026-10-16 关键时刻翻倍时
    // 全部 baseline 减半过一次，写死会把标定改动变成假失败。
    const equal = duelProbability(100, 100, options);
    const strong = duelProbability(150, 100, options);
    const huge = duelProbability(200, 100, options);

    expect(equal).toBeCloseTo(config.baseline, 10);
    expect(strong).toBeGreaterThan(equal);
    expect(huge).toBeGreaterThan(strong);
    expect(huge).toBeCloseTo(config.anchorProbability, 10);
  });
});
