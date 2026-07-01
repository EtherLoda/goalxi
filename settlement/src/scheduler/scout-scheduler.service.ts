import { Injectable, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, LessThanOrEqual } from 'typeorm';
import {
  ScoutCandidateEntity,
  ScoutCandidatePlayerData,
  SCOUT_ABILITY_CHANCE,
  SCOUT_ABILITY_POOL,
  SCOUT_AGE_RANGE,
  SCOUT_CANDIDATES_PER_TEAM,
  SCOUT_CANDIDATE_TTL_DAYS,
  SCOUT_GOALKEEPER_CHANCE,
  SCOUT_IMPACT_COEFFICIENTS,
  SCOUT_OUTFIELD_POSITIONS,
  SCOUT_POSITION_SKILL_IMPACT,
  SCOUT_REVEALED_SKILL_COUNT,
  TeamEntity,
  generateScoutCandidate,
  getRandomNameByNationality,
  getRandomNationality,
} from '@goalxi/database';

@Injectable()
export class ScoutSchedulerService {
  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,

    @InjectRepository(TeamEntity)
    private teamRepo: Repository<TeamEntity>,
    @InjectRepository(ScoutCandidateEntity)
    private scoutCandidateRepo: Repository<ScoutCandidateEntity>,
  ) {}

  /**
   * Weekly scout cron. Runs Saturday 06:00 UTC.
   *
   * - Purges expired candidates (defensive: also covered by the
   *   explicit `expiresAt <= now` check below, but a global sweep keeps
   *   the table tidy in case a team's candidates were orphaned).
   * - For each team that does NOT already have 3 active candidates,
   *   generates 3 fresh ones via the shared `generateScoutCandidate`
   *   utility (uniform PA-range algorithm, the cron-friendly path).
   */
  @Cron('0 0 6 * * 6') // 每周六 06:00 UTC
  async generateScoutCandidates() {
    this.logger.debug(
      '[ScoutScheduler] Generating scout candidates for all teams',
    );

    await this.scoutCandidateRepo.delete({ expiresAt: LessThan(new Date()) });

    const teams = await this.teamRepo.find();
    for (const team of teams) {
      try {
        const existing = await this.scoutCandidateRepo.find({
          where: {
            teamId: team.id,
            expiresAt: LessThanOrEqual(
              new Date(Date.now() + SCOUT_CANDIDATE_TTL_DAYS * 24 * 60 * 60 * 1000),
            ),
          },
        });
        if (existing.length > 0) {
          this.logger.debug(
            `[ScoutScheduler] Team ${team.id} already has ${existing.length} active candidate(s), skipping`,
          );
          continue;
        }

        for (let i = 0; i < SCOUT_CANDIDATES_PER_TEAM; i++) {
          const generated = generateScoutCandidate({
            tierDistribution: {
              LEGEND: 0.005,
              ELITE: 0.015,
              HIGH_PRO: 0.05,
              REGULAR: 0.43,
              LOW: 0.5,
            },
            // Uniform PA range — cheaper and more predictable for a
            // background cron (no per-skill gaussian sampling).
            algorithm: 'uniform',
            paRange: [40, 90],
            currentRatio: [0.35, 0.45],
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

          // The shared generator emits a `potentialTier` for every
          // candidate. The scout-candidate DTO only reveals it when
          // `potentialRevealed` is true; otherwise it must be omitted
          // so the UI cannot infer the tier from the row.
          const playerData: ScoutCandidatePlayerData = {
            ...generated,
            potentialTier: generated.potentialRevealed
              ? generated.potentialTier
              : undefined,
          };

          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + SCOUT_CANDIDATE_TTL_DAYS);

          const candidate = this.scoutCandidateRepo.create({
            teamId: team.id,
            playerData,
            expiresAt,
          });
          await this.scoutCandidateRepo.save(candidate);
        }
        this.logger.debug(
          `[ScoutScheduler] Generated ${SCOUT_CANDIDATES_PER_TEAM} candidates for team ${team.id}`,
        );
      } catch (error) {
        this.logger.error(
          `[ScoutScheduler] Failed for team ${team.id}: ${error.message}`,
          error.stack,
        );
      }
    }
  }
}
