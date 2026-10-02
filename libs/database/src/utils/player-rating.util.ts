/**
 * Player Rating System
 *
 * PWI (Player Worth Index) - 球员身价指数，参考TSI风格
 * 训练速度越慢的技能权重越高（稀有=值钱）
 *
 * Star Rating - 比赛星级 (0.5-5星，0.5增量)
 * 用于比赛画面直观展示球员水平
 * 基于引擎公式：positionFit × multiplier
 */

import {
  PlayerEntity,
  OutfieldPhysical,
  OutfieldTechnical,
  OutfieldMental,
} from "../entities/player.entity";
import { SKILL_TRAINING_SPEED } from "../constants/training.constants";
import {
  toSimulationPlayer,
  SimulationPlayerAttributes,
} from "../types/simulation-player";
import { calculatePositionFit } from "./position-fit.util";

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
// STAR THRESHOLDS
// =====================
// Based on contribution value range from match simulation
// 贡献值 0-100+ 映射到 0.5-5 星

const STAR_THRESHOLDS = {
  FIVE: 90, // ⭐⭐⭐⭐⭐ 世界级
  FOUR: 75, // ⭐⭐⭐⭐ 豪门主力
  THREE: 55, // ⭐⭐⭐ 联赛水准
  TWO: 35, // ⭐⭐ 替补/年轻
  ONE: 15, // ⭐ 勉强能用
  // Below 15 = 0.5 星
};

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

export interface PlayerRatingResult {
  playerId: number;
  playerName: string;
  /** 比赛星级 (0.5-5) */
  stars: number;
  /** 星级描述 */
  starLabel: string;
  /** 比赛贡献值 (0-100) */
  contribution: number;
  /** 场外数值 PWI */
  pwi: number;
  /** PWI 格式化显示 (如 125.3k, 2.5M) */
  pwiDisplay: string;
  /** 计算详情 */
  breakdown: PWICalculationResult;
}

export interface PositionRating {
  position: string;
  positionLabel: string;
  contribution: number;
  stars: number;
}

export type StarLabel =
  | "World Class"
  | "Great"
  | "Average"
  | "Poor"
  | "Weak"
  | "Very Weak";

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
 * Get star rating based on contribution value
 */
export function getStarRatingFromContribution(contribution: number): number {
  if (contribution >= STAR_THRESHOLDS.FIVE) return 5;
  if (contribution >= STAR_THRESHOLDS.FOUR) return 4;
  if (contribution >= STAR_THRESHOLDS.THREE) return 3;
  if (contribution >= STAR_THRESHOLDS.TWO) return 2;
  if (contribution >= STAR_THRESHOLDS.ONE) return 1;
  return 0.5;
}

/**
 * Get star label text
 */
export function getStarLabel(stars: number): StarLabel {
  if (stars >= 5) return "World Class";
  if (stars >= 4) return "Great";
  if (stars >= 3) return "Average";
  if (stars >= 2) return "Poor";
  if (stars >= 1) return "Weak";
  return "Very Weak";
}

/**
 * Format PWI for display
 * 如 125000 → "125.0k", 2500000 → "2.5M"
 */
export function formatPWI(pwi: number): string {
  return Math.round(pwi).toString();
}

/**
 * Calculate form factor
 * Form 3.0 = 1.0, form 5.0 = 1.1, form 1.0 = 0.9
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

/**
 * Calculate star rating for a player based on match contribution
 *
 * Stars = positionFit(positionKey, attrs) × multiplier(form, experience)
 *
 * Uses engine formulas:
 * - position-fit.util.ts calculatePositionFit for position contribution (0-100)
 * - attribute-calculator.ts for GK save rating
 * - condition.system.ts for multiplier
 *
 * @param player - Player entity
 * @param positionKey - The position the player is playing (e.g., 'CF', 'CM', 'LB', 'GK')
 */
export function calculatePlayerStars(
  player: PlayerEntity,
  positionKey: string = "CM",
): {
  stars: number;
  label: StarLabel;
  contribution: number;
  multiplier: number;
} {
  const simPlayer = toSimulationPlayer(player);
  let contribution: number;
  let multiplier: number;

  if (player.isGoalkeeper || positionKey === "GK") {
    // GK: use save rating from attribute-calculator.ts
    // saveRating = reflexes*4 + handling*2.5 + positioning*1.5 + aerial*1 + composure*1
    const attrs = simPlayer.attributes;
    const baseRating =
      (attrs.gk_reflexes ?? 10) * 4 +
      (attrs.gk_handling ?? 10) * 2.5 +
      (attrs.positioning ?? 10) * 1.5 +
      (attrs.gk_aerial ?? 10) * 1 +
      (attrs.composure ?? 10) * 1;

    // GK multiplier (simplified from ConditionSystem)
    multiplier = calculateSimpleMultiplier(
      simPlayer.form,
      simPlayer.experience,
    );

    // GK contribution with multiplier applied
    contribution = baseRating * multiplier;

    const stars = gkContributionToStars(contribution);
    const label = getStarLabel(stars);
    return {
      stars,
      label,
      contribution: Math.round(contribution * 10) / 10,
      multiplier: Math.round(multiplier * 1000) / 1000,
    };
  } else {
    // Outfield: use position-fit contribution
    // calculatePositionFit returns 0-100 based on position weights
    contribution = calculatePositionFit(simPlayer.attributes, positionKey);

    // Outfield multiplier
    multiplier = calculateSimpleMultiplier(
      simPlayer.form,
      simPlayer.experience,
    );

    // Apply multiplier to contribution (multiplier is ~0.9-1.3)
    const effectiveContribution = contribution * multiplier;

    const stars = outfieldContributionToStars(effectiveContribution);
    const label = getStarLabel(stars);
    return {
      stars,
      label,
      contribution: Math.round(effectiveContribution * 10) / 10,
      multiplier: Math.round(multiplier * 1000) / 1000,
    };
  }
}

/**
 * Simple multiplier based on form and experience
 * Simplified from ConditionSystem.calculateMultiplier
 */
function calculateSimpleMultiplier(form: number, experience: number): number {
  // Form factor: 3.0 = 1.0 baseline, range ~0.85-1.15
  const formFactor = 0.85 + (form - 1) * 0.075;

  // Experience factor: hyperbolic saturation, max ~1.21
  const expFactor = 1 + (0.21 * experience) / (experience + 6);

  return formFactor * expFactor;
}

/**
 * GK contribution to stars (raw contribution ~85-200)
 */
function gkContributionToStars(contribution: number): number {
  if (contribution >= 160) return 5.0;
  if (contribution >= 140) return 4.5;
  if (contribution >= 120) return 4.0;
  if (contribution >= 100) return 3.5;
  if (contribution >= 85) return 3.0;
  if (contribution >= 70) return 2.5;
  if (contribution >= 55) return 2.0;
  if (contribution >= 40) return 1.5;
  if (contribution >= 25) return 1.0;
  return 0.5;
}

/**
 * Outfield contribution to stars (0-100 scale)
 */
function outfieldContributionToStars(contribution: number): number {
  if (contribution >= 95) return 5.0;
  if (contribution >= 85) return 4.5;
  if (contribution >= 75) return 4.0;
  if (contribution >= 65) return 3.5;
  if (contribution >= 50) return 3.0;
  if (contribution >= 40) return 2.5;
  if (contribution >= 30) return 2.0;
  if (contribution >= 22) return 1.5;
  if (contribution >= 14) return 1.0;
  return 0.5;
}

/**
 * Calculate outfield player contribution (0-100)
 * Based on CF center-attack weights from position-fit.util.ts
 *
 * Skill 10 → contribution ~45-55
 * Skill 15 → contribution ~70-80
 * Skill 20 → contribution ~95-100
 */
function calculateOutfieldContribution(player: PlayerEntity): number {
  const physical = player.currentSkills.physical as OutfieldPhysical;
  const technical = player.currentSkills.technical as OutfieldTechnical;
  const mental = player.currentSkills.mental as OutfieldMental;

  // CF center-attack weights: finishing*16 + positioning*6 + strength*6 + composure*4 + pace*4 + dribbling*4 = 40 total weight
  const finishing = technical?.finishing ?? 10;
  const dribbling = technical?.dribbling ?? 10;
  const passing = technical?.passing ?? 10;
  const defending = technical?.defending ?? 10;
  const positioning = mental?.positioning ?? 10;
  const composure = mental?.composure ?? 10;
  const pace = physical?.pace ?? 10;
  const strength = physical?.strength ?? 10;

  // Attack-focused calculation (similar to CF center-attack)
  const attackScore =
    finishing * 16 +
    positioning * 6 +
    strength * 6 +
    composure * 4 +
    pace * 4 +
    dribbling * 4;

  // Defense-focused calculation (similar to CB center-defense)
  const defenseScore =
    defending * 16 + positioning * 8 + strength * 8 + pace * 4;

  // Use the higher one (best position fit)
  const bestScore = Math.max(attackScore, defenseScore);

  // Convert to 0-100 scale (max score = 800)
  const contribution = (bestScore / 800) * 100;

  return Math.min(100, contribution);
}

/**
 * Get complete player rating including PWI and stars
 */
export function getPlayerRating(player: PlayerEntity): PlayerRatingResult {
  const pwiResult = calculatePlayerPWI(player);
  const { stars, label, contribution } = calculatePlayerStars(player);

  return {
    playerId: player.id,
    playerName: player.name,
    stars,
    starLabel: label,
    contribution,
    pwi: pwiResult.pwi,
    pwiDisplay: formatPWI(pwiResult.pwi),
    breakdown: pwiResult,
  };
}

