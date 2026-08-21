/**
 * strength-tier.spec.ts — pin the 0-20 -> SKILL_TIERS label mapping
 * and the `+` modifier threshold. Locks the contract that
 * `LaneBreakdown.tsx` and `StatsResult.tsx` rely on so a future
 * engine-side `formatLanes` refactor (e.g. switching the `/100`
 * scale) cannot silently shift the label the user sees.
 */
import {
  laneStrengthTier,
  laneStrengthTierColor,
  LANE_STRENGTH_TIER_COLOR_HEX,
} from "./strength-tier";

describe("laneStrengthTier", () => {
  describe("integer values render without the `+` modifier", () => {
    // Pin the integer -> SKILL_TIERS label mapping. The /- on each
    // row is the explicit `label` (no `+`), which the lane UI
    // shows as the primary text.
    const cases: Array<[number, string, string]> = [
      // [value, zh, en]
      [0,  "无",       "None"],
      [1,  "糟糕",   "Terrible"],
      [4,  "一般",    "Average"],
      [7,  "良好",     "Good"],
      [8,  "优秀",   "Excellent"],
      [10, "杰出",   "Outstanding"],
      [12, "顶尖",   "Apex"],
      [16, "出类拔萃", "Exceptional"],
      [20, "化境",   "Beyond Compare"],
    ];
    for (const [value, zh, en] of cases) {
      it(`value ${value} -> "${zh}" (zh) / "${en}" (en)`, () => {
        expect(laneStrengthTier(value, "zh").label).toBe(zh);
        expect(laneStrengthTier(value, "en").label).toBe(en);
      });
    }
  });

  describe("half-step `+` modifier", () => {
    // The user-facing rule: any value whose fractional part is >= 0.5
    // gets a `+` suffix on the floor() tier. Exact integers never
    // get the suffix. This is the load-bearing case for the live
    // page's `lane strength 7.7 -> 良好+` display.
    it("value 7.7 -> L7 + `+` (good+)", () => {
      const zh = laneStrengthTier(7.7, "zh");
      expect(zh.label).toBe("良好");
      expect(zh.hasPlus).toBe(true);
      expect(zh.labelWithPlus).toBe("良好+");

      const en = laneStrengthTier(7.7, "en");
      expect(en.label).toBe("Good");
      expect(en.hasPlus).toBe(true);
      expect(en.labelWithPlus).toBe("Good+");
    });

    it("value 7.0 -> L7 only (no `+`)", () => {
      // Exact integer — the user prompt example for the "no modifier" case.
      const zh = laneStrengthTier(7.0, "zh");
      expect(zh.hasPlus).toBe(false);
      expect(zh.labelWithPlus).toBe("良好");
    });

    it("value 7.4 -> L7 only (fractional below 0.5 threshold)", () => {
      // 0.4 < 0.5 -> no modifier. This pins the threshold so a future
      // rounding-mode change can't drift it to e.g. 0.25 or 0.499.
      expect(laneStrengthTier(7.4, "zh").hasPlus).toBe(false);
    });

    it("value 7.5 -> L7 + (0.5 exact -> modifier on)", () => {
      // Boundary case. JS's `0.5 >= 0.5` is true, so the suffix
      // appears at the exact half-step.
      expect(laneStrengthTier(7.5, "zh").hasPlus).toBe(true);
    });

    it("value 8.0 -> L8 (no modifier on the next tier)", () => {
      // The `+` suffix stays attached to the *floor* tier, never
      // rounds up to the next tier. 8.0 is exactly L8 = "优秀"
      // with no `+`.
      expect(laneStrengthTier(8.0, "zh").labelWithPlus).toBe("优秀");
    });

    it("value 12.5 -> L12 + (顶尖+)", () => {
      expect(laneStrengthTier(12.5, "zh").labelWithPlus).toBe("顶尖+");
      expect(laneStrengthTier(12.5, "en").labelWithPlus).toBe("Apex+");
    });
  });

  describe("clamping", () => {
    it("value < 0 -> tier 0 (None)", () => {
      expect(laneStrengthTier(-3, "zh").label).toBe("无");
      expect(laneStrengthTier(-3, "en").label).toBe("None");
    });

    it("value > 20 -> tier 20 (Beyond Compare / 化境)", () => {
      expect(laneStrengthTier(25, "zh").label).toBe("化境");
      expect(laneStrengthTier(25, "en").label).toBe("Beyond Compare");
    });

    it("value NaN / Infinity -> tier 0 fallback", () => {
      // Defensive: the snapshot pipeline can hand us a missing
      // `ls[lane].atk` for a 0-0 abandoned sim; the previous
      // behaviour was to render the empty number; here we
      // collapse it to the L0 label so the tile is never blank.
      expect(laneStrengthTier(NaN, "zh").label).toBe("无");
      expect(laneStrengthTier(Infinity, "zh").label).toBe("化境");
    });
  });
});

describe("laneStrengthTierColor", () => {
  it("clamps to the 0-20 range and pins the 4-band ramp", () => {
    // [value, expected color]
    const cases: Array<[number, "amber" | "green" | "blue" | "gray"]> = [
      [-1,  "gray"],   // below 0 -> gray
      [0,   "gray"],
      [4,   "gray"],   // < 8
      [7.9, "gray"],
      [8,   "blue"],   // 优秀 tier
      [11,  "blue"],
      [11.9,"blue"],
      [12,  "green"],  // 顶尖+ tier
      [15.9,"green"],
      [16,  "amber"],  // 化境 tier
      [20,  "amber"],
      [25,  "amber"],  // clamp
      [NaN, "gray"],   // defensive fallback
    ];
    for (const [v, expected] of cases) {
      expect(laneStrengthTierColor(v)).toBe(expected);
    }
  });

  it("all 4 color bands have a non-empty hex", () => {
    for (const hex of Object.values(LANE_STRENGTH_TIER_COLOR_HEX)) {
      expect(hex).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});
