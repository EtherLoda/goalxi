import { Injectable, Logger, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, LessThanOrEqual } from 'typeorm';
import {
  PlayerAbility,
  ScoutCandidateEntity,
  TeamEntity,

  generateScoutCandidate,

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

  @Cron('0 0 6 * * 6') // 每周�?06:00
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
              new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            ),
          },
        });
        if (existing.length > 0) {
          this.logger.debug(
            `[ScoutScheduler] Team ${team.id} already has candidates, skipping`,
          );
          continue;
        }

        for (let i = 0; i < 3; i++) {
          // [RFC 0001 P4 stub] Use the shared generator via ApiService.
          // For now, create a minimal candidate with a placeholder
          // player_data so the api can boot. The real generator will
          // be re-wired in P4.
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 7);
          const candidate = this.scoutCandidateRepo.create({
            teamId: team.id,
            playerData: {
              name: 'Pending Migration',
              createdDay: 0,
              nationality: 'GB',
              isGoalkeeper: false,
              currentSkills: {},
              potentialSkills: {},
              potentialRevealed: false,
              revealedSkills: [],
              joinedAt: new Date().toISOString(),
            } as any,
            expiresAt,
          });
          await this.scoutCandidateRepo.save(candidate);
        }
        this.logger.debug(
          `[ScoutScheduler] Generated 3 candidates for team ${team.id}`,
        );
      } catch (error) {
        this.logger.error(
          `[ScoutScheduler] Failed for team ${team.id}: ${error.message}`,
        );
      }
    }
  }

    // [RFC 0001] Youth growth/reveal cron disabled during unification.
  // Will be re-implemented as a generic Player.is_youth=true query
  // in P4 (simulator/scheduler merge).
}
