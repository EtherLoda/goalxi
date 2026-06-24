import { duelProbability, resolveDuel } from './duel';

/**
 * duel 模块测试
 *
 * 覆盖设计意图（来自 docs/plans/convex-duel-formula.md §4.2）：
 *   A. 单调性
 *   B. 对称性
 *   C. 对等点
 *   D. 锚点硬约束（P(2.0) = 0.80）
 *   E. 凸性（大差距区间 P 增量 ≫ 小差距区间）
 *   F. 各测试点的具体概率值
 *   G. 边界
 *   H. amplification 旋钮
 *   I. baseline 平移
 */

const RATIOS = [1.1, 1.3, 1.5, 2.0, 2.5, 3.0] as const;
const VAL_B = 100;
const valA = (ratio: number) => ratio * VAL_B;

describe('duelProbability', () => {
  describe('A. 单调性', () => {
    it('六个 ratio 点的 P 严格递增', () => {
      const ps = RATIOS.map((r) => duelProbability(valA(r), VAL_B));
      const sorted = [...ps].sort((a, b) => a - b);
      expect(ps).toEqual(sorted);

      // 相邻点之间严格递增（不出现平台）
      for (let i = 1; i < ps.length; i++) {
        expect(ps[i]).toBeGreaterThan(ps[i - 1]);
      }
    });
  });

  describe('B. 对称性', () => {
    it('P(valA, valB) + P(valB, valA) = 1（六个点）', () => {
      for (const r of RATIOS) {
        const a = duelProbability(valA(r), VAL_B);
        const b = duelProbability(VAL_B, valA(r));
        expect(a + b).toBeCloseTo(1.0, 10);
      }
    });
  });

  describe('C. 对等点', () => {
    it('对等双方 P = 0.5', () => {
      expect(duelProbability(100, 100)).toBeCloseTo(0.5, 10);
      expect(duelProbability(50, 50)).toBeCloseTo(0.5, 10);
      expect(duelProbability(200, 200)).toBeCloseTo(0.5, 10);
    });
  });

  describe('D. 锚点硬约束', () => {
    it('ratio = 2.0 时 P = 0.80', () => {
      expect(duelProbability(200, 100)).toBeCloseTo(0.8, 3);
      expect(duelProbability(100, 50)).toBeCloseTo(0.8, 3); // 对称
    });
  });

  describe('E. 凸性（大差距区间 P 增量 ≫ 小差距区间）', () => {
    it('P(3)-P(2) ≥ 3 × P(1.3)-P(1.1)', () => {
      const p11 = duelProbability(valA(1.1), VAL_B);
      const p13 = duelProbability(valA(1.3), VAL_B);
      const p20 = duelProbability(valA(2.0), VAL_B);
      const p30 = duelProbability(valA(3.0), VAL_B);

      const smallGap = p13 - p11;
      const largeGap = p30 - p20;

      expect(smallGap).toBeGreaterThan(0);
      expect(largeGap).toBeGreaterThan(0);
      expect(largeGap).toBeGreaterThanOrEqual(3 * smallGap);
    });
  });

  describe('F. 各测试点的具体概率值（容差 ±0.005）', () => {
    const expected = new Map<number, number>([
      [1.1, 0.5066],
      [1.3, 0.5495],
      [1.5, 0.6164],
      [2.0, 0.8],
      [2.5, 0.9185],
      [3.0, 0.9702],
    ]);

    for (const [r, exp] of expected) {
      it(`ratio = ${r} → P ≈ ${exp}`, () => {
        expect(duelProbability(valA(r), VAL_B)).toBeCloseTo(exp, 3);
      });
    }
  });

  describe('G. 边界', () => {
    it('A 极小 → P ≈ 0', () => {
      expect(duelProbability(1e-3, 100)).toBeCloseTo(0, 5);
    });

    it('B 极小 → P ≈ 1', () => {
      expect(duelProbability(100, 1e-3)).toBeCloseTo(1, 5);
    });

    it('对等 → P = 0.5', () => {
      expect(duelProbability(100, 100)).toBeCloseTo(0.5, 5);
    });
  });

  describe('H. amplification 旋钮', () => {
    it('a 越大，大差距 P 越接近 1', () => {
      const p_low = duelProbability(300, 100, { amplification: 1.3 });
      const p_mid = duelProbability(300, 100, { amplification: 2.0 });
      const p_high = duelProbability(300, 100, { amplification: 2.3 });

      expect(p_low).toBeLessThan(p_mid);
      expect(p_mid).toBeLessThan(p_high);
    });

    it('a 越大，小差距 P 越接近 baseline（越平）', () => {
      const p_low = duelProbability(110, 100, { amplification: 1.3 });
      const p_mid = duelProbability(110, 100, { amplification: 2.0 });
      const p_high = duelProbability(110, 100, { amplification: 2.3 });

      // 全部应非常接近 0.5（差异 < 5%）
      expect(Math.abs(p_low - 0.5)).toBeLessThan(0.05);
      expect(Math.abs(p_mid - 0.5)).toBeLessThan(0.05);
      expect(Math.abs(p_high - 0.5)).toBeLessThan(0.05);
    });

    it('a = 1.0 退化为线性 log-ratio sigmoid（baseline 0.5 时 P(2) ≈ 0.667）', () => {
      // 验证：当 amplification=1 时,公式退化为标准 logit
      // k = logit(0.8) / ln(2) ≈ 2.0
      // P(2) = sigmoid(2.0 * ln(2) - 0) = sigmoid(1.386) = 0.8 ← 锚点不变
      expect(duelProbability(200, 100, { amplification: 1.0 })).toBeCloseTo(
        0.8,
        5,
      );
      // P(3) = sigmoid(2.0 * ln(3) - 0) = sigmoid(2.197) = 0.90
      expect(duelProbability(300, 100, { amplification: 1.0 })).toBeCloseTo(
        0.9,
        2,
      );
    });
  });

  describe('I. baseline 平移', () => {
    it('baseline=0.3 时，对等点 P = 0.3', () => {
      expect(duelProbability(100, 100, { baseline: 0.3 })).toBeCloseTo(0.3, 5);
    });

    it('baseline 不影响 ratio=2 的锚点（仍为 0.80）', () => {
      expect(duelProbability(200, 100, { baseline: 0.3 })).toBeCloseTo(0.8, 3);
    });

    it('baseline=0.1 时，对等双方 P = 0.1（定位球场景）', () => {
      expect(duelProbability(100, 100, { baseline: 0.1 })).toBeCloseTo(0.1, 5);
    });
  });
});

describe('resolveDuel', () => {
  it('P = 0 → 必败（rng 始终返回 0.99）', () => {
    const alwaysWin = () => 0.99;
    // 极弱场景：P 接近 0，应该输
    expect(resolveDuel(0.001, 100, {}, alwaysWin)).toBe(false);
  });

  it('P = 1 → 必胜（rng 始终返回 0.01）', () => {
    const alwaysLose = () => 0.01;
    expect(resolveDuel(100, 0.001, {}, alwaysLose)).toBe(true);
  });

  it('注入确定性 rng：已知 P 时结果可预测', () => {
    // ratio=2 → P=0.80
    // rng=0.5 → true（0.5 < 0.8）
    expect(resolveDuel(200, 100, {}, () => 0.5)).toBe(true);
    // rng=0.9 → false（0.9 > 0.8）
    expect(resolveDuel(200, 100, {}, () => 0.9)).toBe(false);
  });

  it('使用默认 rng 时，跑 1000 次的频率逼近 P（统计）', () => {
    // ratio=2 → P=0.80
    const N = 1000;
    let wins = 0;
    const realRng = () => Math.random();
    for (let i = 0; i < N; i++) {
      if (resolveDuel(200, 100, {}, realRng)) wins++;
    }
    const freq = wins / N;
    // 期望 0.80，容许 ±0.05
    expect(freq).toBeGreaterThan(0.75);
    expect(freq).toBeLessThan(0.85);
  });

  it('对等双方跑 1000 次的胜率应接近 50%', () => {
    const N = 1000;
    let wins = 0;
    for (let i = 0; i < N; i++) {
      if (resolveDuel(100, 100)) wins++;
    }
    const freq = wins / N;
    expect(freq).toBeGreaterThan(0.45);
    expect(freq).toBeLessThan(0.55);
  });
});
