/**
 * Player Rating System — PWI (Player Worth Index)
 *
 * PWI 是球员的场外身价指数：技能加权求和后做非线性放大，再乘潜力与状态系数。
 * 训练速度越慢的技能权重越高（稀有 = 值钱）。
 *
 * 这个文件历史上还带一套「比赛星级」(0.5-5 星) 的计算，用
 * `position-fit.util.ts` 的 `calculatePositionFit` 推 `calculatePlayerStars` /
 * `getPlayerRating`。那两条路径没有任何生产调用方（只有自己的 spec），
 * 2026-10-20 整体删除 —— 引擎自己会算 `contribution` / `stars` 并写进
 * `player.careerStats.club`，`position-fit.util.ts` 也仍被
 * `auto-lineup.util.ts` 和比赛引擎使用，两者都不受影响。
 */

import {
  PlayerEntity,
  OutfieldPhysical,
  OutfieldTechnical,
  OutfieldMental,
} from "../entities/player.entity";

// =====================
// SKILL WEIGHT MAP
// =====================
// 权重 = 基准 / 训练速度，归一化到 passing = 1.0
// 训练速度越慢，权重越高

const SKILL_WEIGHT_MAP: Record<string, number> = {
  // Outfield skills
  finishing: 1.47,
  defending: 1.39,
  dribbling: 1.25,
  passing: 1.14,
  positioning: 1.0,
  pace: 1.42,
  strength: 1.39,
  composure: 0.96,
  // GK skills
  gk_reflexes: 1.56,
  gk_handling: 1.47,
  gk_aerial: 1.52,
  gk_positioning: 1.0,
  // Set pieces - 选修技能，极快训练，权重极低
  freeKicks: 0.25,
  penalties: 0.25,
};

// GK base rating multiplier (GK skills are generally more impactful)
const GK_BASE_MULTIPLIER = 1.65;

// =====================
// FORM FACTOR
// =====================
// Form factor = 0.9 + form × 0.05. Concrete values:
//   form 1.0 → 0.95   (worst realistic form)
//   form 2.0 → 1.00
//   form 3.0 → 1.05   (the design midpoint)
//   form 4.0 → 1.10
//   form 5.0 → 1.15   (peak form)
//
// (An earlier version of this comment claimed `form 3.0 = 1.0`,
// but the actual constant produces 1.05 — the constants below are
// the source of truth.)

const FORM_FACTOR_BASE = 0.9; // form=0 时的系数
const FORM_FACTOR_PER_POINT = 0.05; // 每点form增加0.05

// =====================
// TYPES
// =====================

export interface PWICalculationResult {
  /** 基础加权技能和 */
  weightedSum: number;
  /** 非线性缩放后的基础值 */
  basePWI: number;
  /** 潜力系数 */
  potentialFactor: number;
  /** 状态系数 */
  formFactor: number;
  /** 最终PWI */
  pwi: number;
}

// =====================
// HELPER FUNCTIONS
// =====================

/**
 * Get skill weight based on training speed
 * 训练速度越慢，权重越高
 */
export function getSkillWeight(skillKey: string): number {
  return SKILL_WEIGHT_MAP[skillKey] ?? 1.0;
}

/**
 * Get all skill keys and values from player
 */
function getPlayerSkillPairs(
  player: PlayerEntity,
): { key: string; value: number }[] {
  const pairs: { key: string; value: number }[] = [];

  if (player.isGoalkeeper) {
    // GK skills + 定位球
    const tech = player.currentSkills.technical as any;
    if (tech) {
      pairs.push({ key: "gk_reflexes", value: tech.reflexes ?? 0 });
      pairs.push({ key: "gk_handling", value: tech.handling ?? 0 });
      pairs.push({ key: "gk_aerial", value: tech.aerial ?? 0 });
      pairs.push({ key: "gk_positioning", value: tech.positioning ?? 0 });
    }
    // GK mental - composure is important for GK
    const mental = player.currentSkills.mental as any;
    if (mental) {
      pairs.push({ key: "composure", value: mental.composure ?? 0 });
    }
    // GK 定位球权重较低
    const setPieces = player.currentSkills.setPieces;
    pairs.push({ key: "freeKicks", value: (setPieces?.freeKicks ?? 0) * 0.5 });
    pairs.push({ key: "penalties", value: (setPieces?.penalties ?? 0) * 0.5 });
  } else {
    const physical = player.currentSkills.physical as OutfieldPhysical;
    const technical = player.currentSkills.technical as OutfieldTechnical;
    const mental = player.currentSkills.mental as OutfieldMental;
    // 外场球员不含定位球（定位球是选修技能，不影响身价）

    // `current_skills` is a NOT NULL jsonb column, but Postgres does not
    // validate what is INSIDE it. A row missing `technical` (partial
    // import, hand-edited row, a future writer that only fills `physical`)
    // used to throw here and 500 the whole player page. The goalkeeper
    // branch above already guards its own group; this one now matches.
    if (physical) {
      pairs.push({ key: "pace", value: physical.pace ?? 0 });
      pairs.push({ key: "strength", value: physical.strength ?? 0 });
    }
    if (technical) {
      pairs.push({ key: "finishing", value: technical.finishing ?? 0 });
      pairs.push({ key: "passing", value: technical.passing ?? 0 });
      pairs.push({ key: "dribbling", value: technical.dribbling ?? 0 });
      pairs.push({ key: "defending", value: technical.defending ?? 0 });
    }
    if (mental) {
      pairs.push({ key: "positioning", value: mental.positioning ?? 0 });
      pairs.push({ key: "composure", value: mental.composure ?? 0 });
    }
  }

  return pairs;
}

/**
 * Calculate weighted skill sum
 */
function calculateWeightedSum(player: PlayerEntity): number {
  const pairs = getPlayerSkillPairs(player);
  let sum = 0;

  for (const { key, value } of pairs) {
    const weight = getSkillWeight(key);
    sum += value * weight;
  }

  // GK gets base multiplier (GK技能更值钱)
  if (player.isGoalkeeper) {
    sum *= GK_BASE_MULTIPLIER;
  }

  return sum;
}

/**
 * Format PWI for display
 * 如 125000 → "125000"
 */
export function formatPWI(pwi: number): string {
  return Math.round(pwi).toString();
}

/**
 * Calculate form factor
 * Form 3.0 = 1.05, form 5.0 = 1.15, form 1.0 = 0.95
 */
function getFormFactor(form: number): number {
  return FORM_FACTOR_BASE + form * FORM_FACTOR_PER_POINT;
}

// =====================
// MAIN CALCULATION
// =====================

/**
 * Calculate PWI for a player
 *
 * Formula:
 *   weightedSum = Σ(skill × weight)
 *   basePWI = (weightedSum / 30) ^ 2.2 × 100
 *   finalPWI = basePWI × potentialFactor × formFactor
 */
export function calculatePlayerPWI(player: PlayerEntity): PWICalculationResult {
  // Step 1: Calculate weighted skill sum
  const weightedSum = calculateWeightedSum(player);

  // Step 2: Non-linear scaling
  // (weightedSum / 30) ^ 2.2 × 100: 30→100, 60→~452, 90→~1520
  const normalizedSum = weightedSum / 30;
  const basePWI = Math.pow(normalizedSum, 2.2) * 100;

  // Step 3: Potential factor (derived from potentialAbility 0-100)
  // Maps to range [1.0, 2.5] — matches old tier-based factors
  const potentialFactor = 1.0 + (player.potentialAbility / 100) * 1.5;

  // Step 4: Form factor
  const formFactor = getFormFactor(player.form);

  // Step 5: Final PWI rounded to nearest 10 (e.g. 4772 → 4770, 4775 → 4780)
  const pwi = Math.round(basePWI * potentialFactor * formFactor / 10) * 10;

  return {
    weightedSum: Math.round(weightedSum * 100) / 100,
    basePWI: Math.round(basePWI),
    potentialFactor,
    formFactor: Math.round(formFactor * 100) / 100,
    pwi,
  };
}
