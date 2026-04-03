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
  'distribution',
  'positioning',
  'composure',
  'freeKicks',
  'penalties',
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
 * Generate youth player data
 * - Potential based on tier distribution: 5% LEGEND, 20% ELITE, 50% HIGH_PRO, 25% LOW
 * - Current ability independent of potential: OVR 15-35
 * - Skills random, no position templates
 */
function generatePlayerData(): Omit<
  ScoutCandidatePlayerData,
  'revealedSkills' | 'joinedAt' | 'potentialRevealed' | 'potentialTier'
> & { potentialTier: PotentialTier } {
  const isGoalkeeper = Math.random() < 0.1; // 10% 概率是门将
  const nationality = getRandomNationality();
  const { firstName, lastName } = getRandomNameByNationality(nationality);
  const age = 15 + Math.floor(Math.random() * 2); // 15 or 16
  const birthday = randomBirthdayForAge(age);

  // Generate potential based on tier distribution (一周可抽3次)
  // 1.2% 天才 (86-92), 3.8% 明日之星 (76-85), 50% 未来职业 (56-75), 45% 业余 (40-55)
  const rand = Math.random();
  let potentialAbility: number;
  let potentialTier: PotentialTier;

  if (rand < 0.012) {
    potentialAbility = 86 + Math.floor(Math.random() * 7); // 86-92
    potentialTier = PotentialTier.ELITE;
  } else if (rand < 0.05) {
    potentialAbility = 76 + Math.floor(Math.random() * 10); // 76-85
    potentialTier = PotentialTier.HIGH_PRO;
  } else if (rand < 0.55) {
    potentialAbility = 56 + Math.floor(Math.random() * 20); // 56-75
    potentialTier = PotentialTier.REGULAR;
  } else {
    potentialAbility = 40 + Math.floor(Math.random() * 16); // 40-55
    potentialTier = PotentialTier.LOW;
  }

  // Generate current ability independent of potential: OVR 15-35
  const currentOvr = 15 + Math.floor(Math.random() * 21); // 15-35
  const currentAvg = currentOvr / 5;
  const potentialAvg = potentialAbility / 5;

  const keys = isGoalkeeper ? GK_KEYS : OUTFIELD_KEYS;
  const potential: Record<string, number> = {};
  const current: Record<string, number> = {};

  keys.forEach((k) => {
    // 潜力技能：围绕潜力平均值波动
    const potVal = Math.max(
      1,
      Math.min(20, potentialAvg + (Math.random() * 6 - 3)),
    );
    potential[k] = parseFloat(potVal.toFixed(2));

    // 当前技能：围绕当前平均值波动，跟潜力脱钩
    const curVal = Math.max(
      1,
      Math.min(20, currentAvg + (Math.random() * 6 - 3)),
    );
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
