import {
  PlayerAbility,
  PlayerEntity,
  PotentialTier,
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
const IMPACT_COEFFICIENTS: Record<
  PotentialTier,
  { medium: number; low: number }
> = {
  [PotentialTier.LEGEND]: { medium: 0.8, low: 0.45 },
  [PotentialTier.ELITE]: { medium: 0.85, low: 0.5 },
  [PotentialTier.HIGH_PRO]: { medium: 0.9, low: 0.65 },
  [PotentialTier.REGULAR]: { medium: 0.95, low: 0.8 },
  [PotentialTier.LOW]: { medium: 0.98, low: 0.9 },
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
 * Generate youth player data
 * - Position determines high/medium/low impact skills (3 high impact per position)
 * - High impact: gaussian around potentialAvg (stdDev=1.5)
 * - Medium/Low impact: gaussian around potentialAvg * coefficient (stdDev=1.5)
 * - Coefficient based on potential tier: ELITE(0.5/0.85), HIGH_PRO(0.65/0.9), REGULAR(0.8/0.95), LOW(0.9/0.98)
 * - Current ability <= potential ability
 */
function generatePlayerData(): Omit<
  ScoutCandidatePlayerData,
  'revealedSkills' | 'joinedAt' | 'potentialRevealed' | 'potentialTier'
> & { potentialTier: PotentialTier; position: string } {
  const isGoalkeeper = Math.random() < 0.1; // 10% 概率是门将
  const nationality = getRandomNationality();
  const { firstName, lastName } = getRandomNameByNationality(nationality);
  const age = 15 + Math.floor(Math.random() * 2); // 15 or 16
  const birthday = randomBirthdayForAge(age);

  // Generate potential based on tier distribution
  // 0.5% LEGEND (93-99), 1.5% ELITE (86-92), 5% HIGH_PRO (76-85), 43% REGULAR (56-75), 50% LOW (40-55)
  const rand = Math.random();
  let potentialAbility: number;
  let potentialTier: PotentialTier;

  if (rand < 0.005) {
    potentialAbility = 93 + Math.floor(Math.random() * 7); // 93-99
    potentialTier = PotentialTier.LEGEND;
  } else if (rand < 0.02) {
    potentialAbility = 86 + Math.floor(Math.random() * 7); // 86-92
    potentialTier = PotentialTier.ELITE;
  } else if (rand < 0.07) {
    potentialAbility = 76 + Math.floor(Math.random() * 10); // 76-85
    potentialTier = PotentialTier.HIGH_PRO;
  } else if (rand < 0.5) {
    potentialAbility = 56 + Math.floor(Math.random() * 20); // 56-75
    potentialTier = PotentialTier.REGULAR;
  } else {
    potentialAbility = 40 + Math.floor(Math.random() * 16); // 40-55
    potentialTier = PotentialTier.LOW;
  }

  // Generate current ability: OVR 15-35, but must be <= potentialAbility
  const maxCurrentOvr = Math.min(35, potentialAbility - 5);
  const currentOvr = 15 + Math.floor(Math.random() * (maxCurrentOvr - 15 + 1));
  const currentAvg = currentOvr / 5;
  const potentialAvg = potentialAbility / 5;
  const coeffs = IMPACT_COEFFICIENTS[potentialTier];

  // 确定球员位置
  const position = isGoalkeeper ? 'GK' : pickRandom(OUTFIELD_POSITIONS);
  const impact = POSITION_SKILL_IMPACT[position];
  const keys = isGoalkeeper ? GK_KEYS : OUTFIELD_KEYS;

  const potential: Record<string, number> = {};
  const current: Record<string, number> = {};

  keys.forEach((k) => {
    if (impact.low.includes(k)) {
      // 低影响力技能：围绕 potentialAvg * low系数 正态分布
      potential[k] = clamp(
        gaussianRandom(potentialAvg * coeffs.low, 1.5),
        1,
        20,
      );
    } else if (impact.high.includes(k)) {
      // 高影响力技能：围绕 potentialAvg 正态分布
      potential[k] = clamp(gaussianRandom(potentialAvg, 1.5), 1, 20);
    } else {
      // 中影响力技能：围绕 potentialAvg * medium系数 正态分布
      potential[k] = clamp(
        gaussianRandom(potentialAvg * coeffs.medium, 1.5),
        1,
        20,
      );
    }
    // 当前技能围绕当前能力均值波动，但不能超过潜力
    const curVal = clamp(gaussianRandom(currentAvg, 2), 1, potentialAvg);
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
            distribution: current['distribution'],
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
            distribution: potential['distribution'],
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
