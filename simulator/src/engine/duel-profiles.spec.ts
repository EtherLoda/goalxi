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

  it('参数表覆盖了全部 11 个对决调用点（6 个 DUEL_PROFILES + 5 种射门）', () => {
    // 故意写死数量：以后新增一个调用点必须同时更新这里，避免新参数
    // 悄悄绕过下面的方向性断言。
    expect(Object.keys(DUEL_PROFILES).sort()).toEqual([
      'corner',
      'directFreeKick',
      'indirectFreeKick',
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
    expect(profiles).toHaveLength(11);
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

  it('对等点命中率 = baseline，2 倍优势命中率 = anchorProbability', () => {
    const mismatches = profiles
      .map(({ name, options }) => {
        const parity = duelProbability(100, 100, options);
        const anchor = duelProbability(200, 100, options);
        const ok =
          Math.abs(parity - options.baseline) < 1e-9 &&
          Math.abs(anchor - options.anchorProbability) < 1e-9;
        return ok
          ? null
          : `${name}: parity=${parity} (expect ${options.baseline}), anchor=${anchor} (expect ${options.anchorProbability})`;
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
