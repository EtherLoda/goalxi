import {
  PlayerAbility,
  PlayerEntity,
  ScoutCandidateEntity,
  ScoutCandidatePlayerData,
  TeamEntity,
  YouthLeagueEntity,
  YouthTeamEntity,
  currentGameDay,
  generateScoutCandidate,
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

const ABILITY_POOL: PlayerAbility[] = [
  'fast_start',
  'tackle_master',
  'long_passer',
  'cross_specialist',
  'dribble_master',
  'header_specialist',
  'long_shooter',
];

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

/**
 * Generate scout candidate player data via the shared `@goalxi/database`
 * utility. Kept here as a thin wrapper that wires the gaussian-distribution
 * config used by the API-facing candidate generator (different from the
 * uniform PA-range config used by the cron-driven scheduler).
 */
function generatePlayerData() {
  return generateScoutCandidate({
    tierDistribution: {
      LEGEND: 0.005,
      ELITE: 0.015,
      HIGH_PRO: 0.05,
      REGULAR: 0.43,
      LOW: 0.5,
    },
    algorithm: 'gaussian',
    gaussianMean: 15,
    gaussianStdDev: 2,
    impactCoefficients: {
      LEGEND: { medium: 0.8, low: 0.45 },
      ELITE: { medium: 0.85, low: 0.5 },
      HIGH_PRO: { medium: 0.9, low: 0.65 },
      REGULAR: { medium: 0.95, low: 0.8 },
      LOW: { medium: 0.98, low: 0.9 },
    },
    currentRatio: [0.5, 0.8],
    abilityPool: ABILITY_POOL,
    abilityChance: 0.3,
    revealedSkillCount: 4,
    outfieldPositions: OUTFIELD_POSITIONS,
    positionSkillImpact: POSITION_SKILL_IMPACT,
    goalkeeperChance: 0.1,
    ageRange: [15, 16],
    pickRandomNationality: getRandomNationality,
    getRandomNameByNationality,
  });
}

@Injectable()
export class ScoutsService {
  constructor(
    @InjectRepository(ScoutCandidateEntity)
    private candidateRepo: Repository<ScoutCandidateEntity>,
    @InjectRepository(PlayerEntity)
    private playerRepo: Repository<PlayerEntity>,
    @InjectRepository(TeamEntity)
    private teamRepo: Repository<TeamEntity>,
    @InjectRepository(YouthTeamEntity)
    private youthTeamRepo: Repository<YouthTeamEntity>,
    @InjectRepository(YouthLeagueEntity)
    private youthLeagueRepo: Repository<YouthLeagueEntity>,
  ) {}

  /** Generate 3 scout candidates for a team */
  async generateThreeCandidates(
    teamId: string,
  ): Promise<ScoutCandidateEntity[]> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

    const candidates: ScoutCandidateEntity[] = [];
    for (let i = 0; i < 3; i++) {
      // [D1] Generation now goes through the shared utility, so scheduler
      // and API produce a consistent shape (revealedSkills/joinedAt included).
      const playerData = generatePlayerData();
      const candidate = this.candidateRepo.create({
        teamId,
        playerData: {
          ...playerData,
          // The shared generator produces a potentialTier for every candidate;
          // only reveal it externally when potentialRevealed === true.
          potentialTier: playerData.potentialRevealed
            ? playerData.potentialTier
            : undefined,
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

  /** Select a candidate → convert to a  row with
   *   and the reveal state copied from the candidate.
   *  After RFC 0001 there is no separate YouthPlayerEntity — youth
   *  players are PlayerEntity rows that carry the  and
   *   fields.
   *
   *  [S2] Caller MUST pass ; the candidate is rejected if it
   *  does not belong to that team. */
  async selectCandidate(
    candidateId: string,
    expectedTeamId: string,
  ): Promise<PlayerEntity> {
    const candidate = await this.candidateRepo.findOneByOrFail({
      id: candidateId,
    });
    if (candidate.teamId !== expectedTeamId) {
      throw new Error(
        `Candidate ${candidateId} does not belong to team ${expectedTeamId}`,
      );
    }
    const { playerData } = candidate;

    const youthTeam = await this.youthTeamRepo.findOne({
      where: { teamId: candidate.teamId },
    });
    const youthLeagueId = youthTeam?.youthLeagueId ?? null;

    const crypto = require('crypto');
    const displayId =
      'x' + crypto.createHash('md5').update(candidate.id).digest('hex').slice(0, 16);

    const youth = this.playerRepo.create({
      id: candidate.id,
      displayId,
      teamId: candidate.teamId,
      isGoalkeeper: playerData.isGoalkeeper,
      isYouth: true,
      youthLeagueId,
      onTransfer: false,
      currentSkills: playerData.currentSkills,
      potentialSkills: playerData.potentialSkills,
      specialty: playerData.abilities?.[0] ?? null,
      experience: 0,
      form: 3,
      stamina: 3,
      matchMinutes: 0,
      currentWage: 2000,
      potentialAbility: 50,
      careerStats: {},
      currentInjuryValue: 0,
      revealLevel: 1,
      revealedSkills: playerData.revealedSkills,
      potentialRevealed: playerData.potentialRevealed,
      potentialTier: playerData.potentialTier,
      createdDay: playerData.createdDay ?? currentGameDay(),
    } as any);

    await this.playerRepo.save(youth as any);
    await this.candidateRepo.delete({ id: candidateId });
    return youth as unknown as PlayerEntity;
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
