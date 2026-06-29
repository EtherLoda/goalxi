// ============== 球员技能键常量 ==============

import { currentGameDay } from '@goalxi/database';

/** 外场球员技能键 (10个) */
export const OUTFIELD_SKILL_KEYS = [
  'pace',
  'strength',
  'finishing',
  'passing',
  'dribbling',
  'defending',
  'positioning',
  'composure',
  'freeKicks',
  'penalties',
] as const;

/** 守门员技能键 (9个) */
export const GK_SKILL_KEYS = [
  'pace',
  'strength',
  'reflexes',
  'handling',
  'aerial',
  'positioning',
  'composure',
  'freeKicks',
  'penalties',
] as const;

// ============== 类型定义 ==============

export interface PlayerSkills {
  physical: { pace: number; strength: number };
  technical: Record<string, number>;
  mental: { positioning: number; composure: number };
  setPieces: { freeKicks: number; penalties: number };
}

export interface GeneratedPlayerData {
  name: string;
  createdDay: number;
  nationality: string;
  isGoalkeeper: boolean;
  position: string;
  currentSkills: PlayerSkills;
  potentialSkills: PlayerSkills;
  potentialAbility: number;
  potentialTier: PlayerTier;
  abilities?: string[];
}

// ============== 工具函数 ==============

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Box-Muller变换生成正态分布随机数
 */
function gaussianRandom(mean: number, stdDev: number): number {
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return mean + z * stdDev;
}

/**
 * 随机选择数组中的一个元素
 */
function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ============== 位置影响力配置 ==============

type SkillImpact = 'high' | 'medium' | 'low';

/** 位置影响力技能分类 */
const POSITION_SKILL_IMPACT: Record<string, Record<SkillImpact, string[]>> = {
  ST: {
    high: ['finishing', 'positioning', 'pace'],
    medium: ['strength', 'composure', 'dribbling'],
    low: ['passing', 'defending'],
  },
  CF: {
    high: ['finishing', 'positioning', 'strength'],
    medium: ['pace', 'composure', 'dribbling'],
    low: ['passing', 'defending'],
  },
  LW: {
    high: ['pace', 'dribbling', 'finishing'],
    medium: ['passing', 'strength'],
    low: ['defending', 'composure'],
  },
  RW: {
    high: ['pace', 'dribbling', 'finishing'],
    medium: ['passing', 'strength'],
    low: ['defending', 'composure'],
  },
  AM: {
    high: ['dribbling', 'passing', 'finishing'],
    medium: ['positioning', 'pace'],
    low: ['defending', 'strength', 'composure'],
  },
  CM: {
    high: ['passing', 'dribbling', 'positioning'],
    medium: ['composure', 'defending', 'strength'],
    low: ['finishing', 'pace'],
  },
  DM: {
    high: ['defending', 'positioning', 'passing'],
    medium: ['dribbling', 'composure', 'strength'],
    low: ['finishing', 'pace'],
  },
  LB: {
    high: ['defending', 'positioning', 'pace'],
    medium: ['strength', 'composure', 'passing'],
    low: ['finishing', 'dribbling'],
  },
  RB: {
    high: ['defending', 'positioning', 'pace'],
    medium: ['strength', 'composure', 'passing'],
    low: ['finishing', 'dribbling'],
  },
  CB: {
    high: ['defending', 'positioning', 'strength'],
    medium: ['pace', 'composure'],
    low: ['dribbling', 'passing', 'finishing'],
  },
  GK: {
    high: ['reflexes', 'handling'],
    medium: ['aerial', 'positioning', 'composure'],
    low: ['pace', 'strength'],
  },
};

// ============== Tier 定义 ==============

/**
 * 球员 Tier (10级)
 * PA 范围: 0-100, 每级 8 点
 *   Tier 1 (Legend): 93-100
 *   Tier 2 (World Class): 85-92
 *   Tier 3 (Superstar): 77-84
 *   Tier 4 (Star): 69-76
 *   Tier 5 (Regular): 61-68
 *   Tier 6 (Rotation): 53-60
 *   Tier 7 (Backup): 45-52
 *   Tier 8 (Prospect): 37-44
 *   Tier 9 (Fringe): 29-36
 *   Tier 10 (Amateur): 0-28
 */
export enum PlayerTier {
  LEGEND = 1,
  WORLD_CLASS = 2,
  SUPERSTAR = 3,
  STAR = 4,
  REGULAR = 5,
  ROTATION = 6,
  BACKUP = 7,
  PROSPECT = 8,
  FRINGE = 9,
  AMATEUR = 10,
}

/**
 * Tier 对应的技能均值 (用于生成球员时)
 */
const TIER_MEANS: Record<PlayerTier, number> = {
  [PlayerTier.LEGEND]: 18,
  [PlayerTier.WORLD_CLASS]: 16,
  [PlayerTier.SUPERSTAR]: 15,
  [PlayerTier.STAR]: 14,
  [PlayerTier.REGULAR]: 12,
  [PlayerTier.ROTATION]: 11,
  [PlayerTier.BACKUP]: 10,
  [PlayerTier.PROSPECT]: 8,
  [PlayerTier.FRINGE]: 6,
  [PlayerTier.AMATEUR]: 4,
};

/**
 * Tier 对应的技能中低影响系数
 */
const TIER_IMPACT: Record<PlayerTier, { medium: number; low: number }> = {
  [PlayerTier.LEGEND]: { medium: 0.85, low: 0.5 },
  [PlayerTier.WORLD_CLASS]: { medium: 0.88, low: 0.55 },
  [PlayerTier.SUPERSTAR]: { medium: 0.9, low: 0.6 },
  [PlayerTier.STAR]: { medium: 0.92, low: 0.7 },
  [PlayerTier.REGULAR]: { medium: 0.95, low: 0.8 },
  [PlayerTier.ROTATION]: { medium: 0.97, low: 0.85 },
  [PlayerTier.BACKUP]: { medium: 0.98, low: 0.9 },
  [PlayerTier.PROSPECT]: { medium: 0.99, low: 0.95 },
  [PlayerTier.FRINGE]: { medium: 0.99, low: 0.98 },
  [PlayerTier.AMATEUR]: { medium: 1.0, low: 1.0 },
};

/**
 * 随机选择 Tier (用于生成球员时)
 */
function randomTier(): PlayerTier {
  const rand = Math.random() * 100;
  if (rand < 1) return PlayerTier.LEGEND;
  if (rand < 6) return PlayerTier.WORLD_CLASS;
  if (rand < 14) return PlayerTier.SUPERSTAR;
  if (rand < 24) return PlayerTier.STAR;
  if (rand < 44) return PlayerTier.REGULAR;
  if (rand < 64) return PlayerTier.ROTATION;
  if (rand < 79) return PlayerTier.BACKUP;
  if (rand < 92) return PlayerTier.PROSPECT;
  if (rand < 98) return PlayerTier.FRINGE;
  return PlayerTier.AMATEUR;
}

/** 外场位置列表 */
const OUTFIELD_POSITIONS = [
  'ST',
  'CF',
  'LW',
  'RW',
  'AM',
  'CM',
  'DM',
  'LB',
  'RB',
  'CB',
];

// ============== PA 计算函数 ==============

/**
 * 根据潜力技能计算潜力能力值 (PA)
 * 公式: PA = (Σ physical + Σ technical) × 1 + Σ mental × 0.4 + Σ setPieces × 0.1
 *
 * 外场球员 (10技能): max = 6×20 + 2×20×0.4 + 2×20×0.1 = 140, 归一化系数 = 100/140 ≈ 0.714
 * 守门员 (9技能): max = 5×20 + 2×20×0.4 + 2×20×0.1 = 120, 归一化系数 = 100/120 ≈ 0.833
 */
export function calculatePotentialAbility(
  potentialSkills: PlayerSkills,
  isGoalkeeper: boolean,
): number {
  const physical =
    (potentialSkills.physical.pace + potentialSkills.physical.strength) * 1;

  const technical =
    Object.values(potentialSkills.technical).reduce(
      (sum, val) => sum + val,
      0,
    ) * 1;

  const mental =
    (potentialSkills.mental.positioning + potentialSkills.mental.composure) *
    0.4;

  const setPieces =
    (potentialSkills.setPieces.freeKicks +
      potentialSkills.setPieces.penalties) *
    0.1;

  const rawPA = physical + technical + mental + setPieces;

  // 归一化到 5-100
  const maxRaw = isGoalkeeper ? 120 : 140;
  const pa = Math.round((rawPA / maxRaw) * 100);

  return clamp(pa, 5, 100);
}

/**
 * 根据 PA 确定 Tier
 */
export function determineTier(pa: number): PlayerTier {
  if (pa >= 93) return PlayerTier.LEGEND;
  if (pa >= 85) return PlayerTier.WORLD_CLASS;
  if (pa >= 77) return PlayerTier.SUPERSTAR;
  if (pa >= 69) return PlayerTier.STAR;
  if (pa >= 61) return PlayerTier.REGULAR;
  if (pa >= 53) return PlayerTier.ROTATION;
  if (pa >= 45) return PlayerTier.BACKUP;
  if (pa >= 37) return PlayerTier.PROSPECT;
  if (pa >= 29) return PlayerTier.FRINGE;
  return PlayerTier.AMATEUR;
}

// ============== 球员生成函数 ==============

/**
 * 生成随机生日（基于年龄）
 */
function randomBirthdayForAge(age: number): Date {
  const now = new Date();
  const yearAgo = new Date(
    now.getFullYear() - age,
    now.getMonth(),
    now.getDate(),
  );
  const offset = Math.floor(Math.random() * 365) * 24 * 60 * 60 * 1000;
  return new Date(yearAgo.getTime() - offset);
}

/**
 * 青训球员可能获得的特技
 */
const YOUTH_ABILITIES = [
  'fast_start',
  'tackle_master',
  'long_passer',
  'cross_specialist',
  'dribble_master',
  'header_specialist',
  'long_shooter',
] as const;

/**
 * 生成球员数据（公共函数）
 * - PA 由技能计算得出，不再随机生成
 * - 位置决定技能分布的高/中/低影响力
 */
export function generatePlayerData(options?: {
  isGoalkeeper?: boolean;
  nationality?: string;
  firstName?: string;
  lastName?: string;
  age?: number;
  position?: string;
}): GeneratedPlayerData {
  // 确定是否守门员
  const isGoalkeeper = options?.isGoalkeeper ?? Math.random() < 0.1;

  // 获取或生成位置
  let position: string;
  if (options?.position) {
    position = options.position;
  } else {
    position = isGoalkeeper ? 'GK' : pickRandom(OUTFIELD_POSITIONS);
  }

  // 位置影响力
  const impact = POSITION_SKILL_IMPACT[position];
  const keys = isGoalkeeper ? GK_SKILL_KEYS : OUTFIELD_SKILL_KEYS;

  // 随机选择 Tier
  const targetTier = randomTier();
  const coeffs = TIER_IMPACT[targetTier];
  const tierMean = TIER_MEANS[targetTier];

  // 生成潜力技能
  const potential: Record<string, number> = {};
  keys.forEach((k) => {
    let mean: number;
    if (impact.low.includes(k)) {
      mean = tierMean * coeffs.low;
    } else if (impact.high.includes(k)) {
      mean = tierMean;
    } else {
      mean = tierMean * coeffs.medium;
    }
    potential[k] = clamp(gaussianRandom(mean, 2), 1, 20);
  });

  // 构建潜力技能对象
  const potentialSkills: PlayerSkills = {
    physical: { pace: potential['pace'], strength: potential['strength'] },
    technical: isGoalkeeper
      ? {
          reflexes: potential['reflexes'],
          handling: potential['handling'],
          aerial: potential['aerial'],
        }
      : {
          finishing: potential['finishing'],
          passing: potential['passing'],
          dribbling: potential['dribbling'],
          defending: potential['defending'],
        },
    mental: {
      positioning: potential['positioning'],
      composure: potential['composure'],
    },
    setPieces: {
      freeKicks: potential['freeKicks'],
      penalties: potential['penalties'],
    },
  };

  // 计算 PA
  const potentialAbility = calculatePotentialAbility(
    potentialSkills,
    isGoalkeeper,
  );
  const potentialTier = determineTier(potentialAbility);

  // 当前技能：基于 PA 的 50-80% 范围内
  const currentRatio = 0.5 + Math.random() * 0.3; // 50%-80% of potential
  const currentAvg = (potentialAbility / 100) * 20 * currentRatio;

  const current: Record<string, number> = {};
  keys.forEach((k) => {
    const curVal = clamp(gaussianRandom(currentAvg, 1.5), 1, potential[k]);
    current[k] = parseFloat(curVal.toFixed(2));
  });

  // 构建当前技能对象
  const currentSkills: PlayerSkills = {
    physical: { pace: current['pace'], strength: current['strength'] },
    technical: isGoalkeeper
      ? {
          reflexes: current['reflexes'],
          handling: current['handling'],
          aerial: current['aerial'],
        }
      : {
          finishing: current['finishing'],
          passing: current['passing'],
          dribbling: current['dribbling'],
          defending: current['defending'],
        },
    mental: {
      positioning: current['positioning'],
      composure: current['composure'],
    },
    setPieces: {
      freeKicks: current['freeKicks'],
      penalties: current['penalties'],
    },
  };

  // 30% chance of having an ability
  const abilities =
    Math.random() < 0.3
      ? [pickRandom(YOUTH_ABILITIES as unknown as string[])]
      : undefined;

  // 名字
  const nationality = options?.nationality ?? 'England';
  const firstName = options?.firstName ?? 'John';
  const lastName = options?.lastName ?? 'Doe';

  // 年龄
  const age = options?.age ?? 15 + Math.floor(Math.random() * 2); // 15 or 16
  const birthday = age * 112 + Math.floor(Math.random() * 112);
  const createdDay = currentGameDay(new Date()) - birthday;

  return {
    name: `${firstName} ${lastName}`,
    createdDay,
    nationality,
    isGoalkeeper,
    position,
    currentSkills,
    potentialSkills,
    potentialAbility,
    potentialTier,
    abilities,
  };
}
