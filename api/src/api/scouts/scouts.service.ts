import {
  PlayerAbility,
  PlayerEntity,
  ScoutCandidateEntity,
  ScoutCandidatePlayerData,
  TeamEntity,
  YouthPlayerEntity,
  YouthTeamEntity,
} from '@goalxi/database';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, MoreThanOrEqual, Repository } from 'typeorm';
import {
  getRandomNameByNationality,
  getRandomNationality,
} from '../../constants/name-database';

/** Scout候选人的潜力等级 (5-tier system for scouting) */
type ScoutTier = 'LOW' | 'REGULAR' | 'HIGH_PRO' | 'ELITE' | 'LEGEND';

// 青训球员可能获得的特技
const YOUTH_ABILITIES: PlayerAbility[] = [
  'fast_start',
  'tackle_master',
  'long_passer',
  'cross_specialist',
  'dribble_master',
  'header_specialist',
  'long_shooter',
];

const OUTFIELD_KEYS = [
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
];
const GK_KEYS = [
  'pace',
  'strength',
  'reflexes',
  'handling',
  'aerial',
  'positioning',
  'composure',
  'freeKicks',
  'penalties',
];

// 位置影响力技能分类（每个位置3个高影响力技能）
// 高影响力: 围绕 potentialAvg 正态分布(stdDev=1.5)
// 中/低影响力: 围绕 potentialAvg * 系数 正态分布(stdDev=1.5)
// 系数根据潜力等级决定: ELITE(0.5/0.85), HIGH_PRO(0.65/0.9), REGULAR(0.8/0.95), LOW(0.9/0.98)
type SkillImpact = 'high' | 'medium' | 'low';
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

// 潜力等级对应的中低影响系数
const IMPACT_COEFFICIENTS: Record<ScoutTier, { medium: number; low: number }> =
  {
    LEGEND: { medium: 0.8, low: 0.45 },
    ELITE: { medium: 0.85, low: 0.5 },
    HIGH_PRO: { medium: 0.9, low: 0.65 },
    REGULAR: { medium: 0.95, low: 0.8 },
    LOW: { medium: 0.98, low: 0.9 },
  };

// 外场位置列表
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

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Box-Muller变换生成正态分布随机数
 * 大多数值聚集在均值附近，极端值罕见
 */
function gaussianRandom(mean: number, stdDev: number): number {
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return mean + z * stdDev;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * 根据潜力技能计算潜力能力值 (PA)
 * 公式: PA = (Σ physical + Σ technical) × 1 + Σ mental × 0.4 + Σ setPieces × 0.1
 *
 * 外场球员 (10技能): max = 6×20 + 2×20×0.4 + 2×20×0.1 = 140, 归一化系数 = 100/140 ≈ 0.714
 * 守门员 (9技能): max = 5×20 + 2×20×0.4 + 2×20×0.1 = 120, 归一化系数 = 100/120 ≈ 0.833
 */
function calculatePotentialAbility(
  potentialSkills: {
    physical: { pace: number; strength: number };
    technical: Record<string, number>;
    mental: { positioning: number; composure: number };
    setPieces: { freeKicks: number; penalties: number };
  },
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

  // 归一化到 0-100
  const maxRaw = isGoalkeeper ? 120 : 140;
  const pa = Math.round((rawPA / maxRaw) * 100);

  return clamp(pa, 5, 100);
}

/**
 * 根据 PA 确定潜力等级
 */
function determinePotentialTier(pa: number): ScoutTier {
  if (pa >= 93) return 'LEGEND';
  if (pa >= 86) return 'ELITE';
  if (pa >= 76) return 'HIGH_PRO';
  if (pa >= 56) return 'REGULAR';
  return 'LOW';
}

/**
 * Generate youth player data
 * - Position determines high/medium/low impact skills (3 high impact per position)
 * - High impact: gaussian around potentialAvg (stdDev=1.5)
 * - Medium/Low impact: gaussian around potentialAvg * coefficient (stdDev=1.5)
 * - Coefficient based on potential tier: ELITE(0.5/0.85), HIGH_PRO(0.65/0.9), REGULAR(0.8/0.95), LOW(0.9/0.98)
 * - Current ability <= potential ability
 * - PA is calculated from potentialSkills, then tier is determined from PA
 */
function generatePlayerData(): Omit<
  ScoutCandidatePlayerData,
  'revealedSkills' | 'joinedAt' | 'potentialRevealed' | 'potentialTier'
> & { potentialTier: ScoutTier; position: string } {
  const isGoalkeeper = Math.random() < 0.1; // 10% 概率是门将
  const nationality = getRandomNationality();
  const { firstName, lastName } = getRandomNameByNationality(nationality);
  const age = 15 + Math.floor(Math.random() * 2); // 15 or 16
  const birthday = randomBirthdayForAge(age);

  // 确定球员位置
  const position = isGoalkeeper ? 'GK' : pickRandom(OUTFIELD_POSITIONS);
  const impact = POSITION_SKILL_IMPACT[position];
  const keys = isGoalkeeper ? GK_KEYS : OUTFIELD_KEYS;

  // 根据位置随机确定一个目标 tier，用于生成技能时的分布参数
  const rand = Math.random();
  let targetTier: ScoutTier;

  if (rand < 0.005) {
    targetTier = 'LEGEND';
  } else if (rand < 0.02) {
    targetTier = 'ELITE';
  } else if (rand < 0.07) {
    targetTier = 'HIGH_PRO';
  } else if (rand < 0.5) {
    targetTier = 'REGULAR';
  } else {
    targetTier = 'LOW';
  }

  const coeffs = IMPACT_COEFFICIENTS[targetTier];
  const potentialAvg = 15; // 使用 15 作为生成均值（中间值），技能分布由 tier 系数决定

  const potential: Record<string, number> = {};
  const current: Record<string, number> = {};

  // 生成潜力技能
  keys.forEach((k) => {
    let mean: number;
    if (impact.low.includes(k)) {
      // 低影响力技能
      mean = potentialAvg * coeffs.low;
    } else if (impact.high.includes(k)) {
      // 高影响力技能
      mean = potentialAvg;
    } else {
      // 中影响力技能
      mean = potentialAvg * coeffs.medium;
    }
    potential[k] = clamp(gaussianRandom(mean, 2), 1, 20);
  });

  // 根据潜力技能计算 PA
  const potentialSkills = {
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

  const potentialAbility = calculatePotentialAbility(
    potentialSkills,
    isGoalkeeper,
  );
  const potentialTier = determinePotentialTier(potentialAbility);

  // 当前技能：基于 PA 的 50-80% 范围内
  const currentRatio = 0.5 + Math.random() * 0.3; // 50%-80% of potential
  const currentAvg = (potentialAbility / 100) * 20 * currentRatio;

  keys.forEach((k) => {
    const curVal = clamp(gaussianRandom(currentAvg, 1.5), 1, potential[k]);
    current[k] = parseFloat(curVal.toFixed(2));
  });

  // 30% chance of having an ability
  const abilities =
    Math.random() < 0.3 ? [pickRandom(YOUTH_ABILITIES)] : undefined;

  return {
    name: `${firstName} ${lastName}`,
    birthday,
    nationality,
    isGoalkeeper,
    position,
    currentSkills: {
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
    } as any,
    potentialSkills: {
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
    } as any,
    abilities,
    potentialTier,
  };
}

function pickRevealedSkills(keys: string[]): string[] {
  const shuffled = [...keys].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 2);
}

function buildRevealedSkills(
  playerData: ReturnType<typeof generatePlayerData>,
): string[] {
  const keys = playerData.isGoalkeeper ? GK_KEYS : OUTFIELD_KEYS;
  const revealed: string[] = [];
  // 2 current skills
  const currentKeys = pickRevealedSkills(keys);
  revealed.push(...currentKeys);
  // 2 potential skills (different from current if possible)
  const remaining = keys.filter((k) => !revealed.includes(k));
  revealed.push(...pickRevealedSkills(remaining.length > 0 ? remaining : keys));
  return revealed;
}

@Injectable()
export class ScoutsService {
  constructor(
    @InjectRepository(ScoutCandidateEntity)
    private candidateRepo: Repository<ScoutCandidateEntity>,
    @InjectRepository(YouthPlayerEntity)
    private youthPlayerRepo: Repository<YouthPlayerEntity>,
    @InjectRepository(YouthTeamEntity)
    private youthTeamRepo: Repository<YouthTeamEntity>,
    @InjectRepository(PlayerEntity)
    private playerRepo: Repository<PlayerEntity>,
    @InjectRepository(TeamEntity)
    private teamRepo: Repository<TeamEntity>,
  ) {}

  /** Generate 3 scout candidates for a team */
  async generateThreeCandidates(
    teamId: string,
  ): Promise<ScoutCandidateEntity[]> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

    const candidates: ScoutCandidateEntity[] = [];
    for (let i = 0; i < 3; i++) {
      const playerData = generatePlayerData();
      const revealed = buildRevealedSkills(playerData);
      const potentialRevealed = Math.random() < 0.3; // 30% chance

      const candidate = this.candidateRepo.create({
        teamId,
        playerData: {
          ...playerData,
          revealedSkills: revealed,
          potentialRevealed,
          potentialTier: potentialRevealed
            ? playerData.potentialTier
            : undefined,
          joinedAt: new Date(),
        } as ScoutCandidatePlayerData,
        expiresAt,
      });
      candidates.push(await this.candidateRepo.save(candidate));
    }
    return candidates;
  }

  /** Get all active candidates for a team */
  async getCandidates(teamId: string): Promise<ScoutCandidateEntity[]> {
    return this.candidateRepo.find({
      where: { teamId, expiresAt: MoreThanOrEqual(new Date()) },
      order: { createdAt: 'DESC' },
    });
  }

  /** Select a candidate → convert to YouthPlayerEntity */
  async selectCandidate(candidateId: string): Promise<YouthPlayerEntity> {
    const candidate = await this.candidateRepo.findOneByOrFail({
      id: candidateId,
    });
    const { playerData } = candidate;

    // Find the youth team for this senior team
    const youthTeam = await this.youthTeamRepo.findOne({
      where: { teamId: candidate.teamId },
    });

    const youth = this.youthPlayerRepo.create({
      teamId: candidate.teamId,
      youthTeamId: youthTeam?.id,
      name: playerData.name,
      birthday: playerData.birthday,
      isGoalkeeper: playerData.isGoalkeeper,
      currentSkills: playerData.currentSkills,
      potentialSkills: playerData.potentialSkills,
      abilities: playerData.abilities,
      revealLevel: 1,
      revealedSkills: playerData.revealedSkills,
      potentialRevealed: playerData.potentialRevealed,
      potentialTier: playerData.potentialTier,
      isPromoted: false,
      joinedAt: new Date(),
    });

    await this.youthPlayerRepo.save(youth);
    await this.candidateRepo.delete({ id: candidateId });
    return youth;
  }

  /** Skip a candidate → delete it */
  async skipCandidate(candidateId: string): Promise<void> {
    await this.candidateRepo.delete({ id: candidateId });
  }

  /** Clean up expired candidates */
  async cleanupExpired(): Promise<number> {
    const result = await this.candidateRepo.delete({
      expiresAt: LessThan(new Date()),
    });
    return result.affected ?? 0;
  }
}
