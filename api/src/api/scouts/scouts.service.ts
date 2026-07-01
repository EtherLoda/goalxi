import {
  PlayerEntity,
  SCOUT_ABILITY_CHANCE,
  SCOUT_ABILITY_POOL,
  SCOUT_AGE_RANGE,
  SCOUT_GOALKEEPER_CHANCE,
  SCOUT_IMPACT_COEFFICIENTS,
  SCOUT_OUTFIELD_POSITIONS,
  SCOUT_POSITION_SKILL_IMPACT,
  SCOUT_REVEALED_SKILL_COUNT,
  ScoutCandidateEntity,
  ScoutCandidatePlayerData,
  TeamEntity,
  YouthLeagueEntity,
  YouthTeamEntity,
  currentGameDay,
  generateScoutCandidate,
  getYouthSkillKeys,
} from '@goalxi/database';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, MoreThanOrEqual, Repository } from 'typeorm';
import {
  getRandomNameByNationality,
  getRandomNationality,
} from '../../constants/name-database';
import { calculatePotentialAbility } from '../../utils/player-generator';

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
    impactCoefficients: SCOUT_IMPACT_COEFFICIENTS,
    currentRatio: [0.5, 0.8],
    abilityPool: SCOUT_ABILITY_POOL,
    abilityChance: SCOUT_ABILITY_CHANCE,
    revealedSkillCount: SCOUT_REVEALED_SKILL_COUNT,
    outfieldPositions: SCOUT_OUTFIELD_POSITIONS as unknown as string[],
    positionSkillImpact: SCOUT_POSITION_SKILL_IMPACT,
    goalkeeperChance: SCOUT_GOALKEEPER_CHANCE,
    ageRange: SCOUT_AGE_RANGE,
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

    // Recompute PA from the persisted potential-skills vector so the UI
    // badge reflects the candidate's *true* potential instead of a
    // placeholder 50. (See the unified PlayerEntity: potentialAbility
    // is a denormalized display field.)
    //
    // The api-local `calculatePotentialAbility` accepts the looser
    // `Record<string, number>` `technical` shape, so cast through
    // `unknown` (the runtime values match the closed union in
    // `@goalxi/database`; this is purely a TS shape bridge).
    const potentialAbility = calculatePotentialAbility(
      playerData.potentialSkills as unknown as Parameters<
        typeof calculatePotentialAbility
      >[0],
      playerData.isGoalkeeper,
    );

    // revealLevel is a coarse counter; the precise gate lives in
    // PROMOTION_REVEAL_THRESHOLD. The two must agree: revealLevel
    // = revealedSkills.length, so the promotion check is
    //   revealedSkills.length / keys.length >= 0.5
    // and revealLevel / keys.length >= 0.5. Keeping them aligned here
    // prevents the UI from showing a "ready to promote" badge that the
    // server would later reject.
    const totalKeys = getYouthSkillKeys(playerData.isGoalkeeper).length;
    const revealed = playerData.revealedSkills ?? [];
    const revealLevel = Math.min(revealed.length, totalKeys);

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
      position: playerData.position ?? null,
      specialty: playerData.abilities?.[0] ?? null,
      experience: 0,
      form: 3,
      stamina: 3,
      matchMinutes: 0,
      currentWage: 2000,
      potentialAbility,
      careerStats: {},
      currentInjuryValue: 0,
      revealLevel,
      revealedSkills: revealed,
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
