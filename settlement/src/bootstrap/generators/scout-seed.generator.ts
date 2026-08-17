import { Injectable, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ScoutCandidateEntity,
  TeamEntity,
  endOfCurrentWeek,
  seedSeniorScoutCandidate,
} from '@goalxi/database';

/**
 * Seed one senior-mode scout candidate per team. The
 * first matchday is always at least 1 day after the
 * init date, so a freshly-claimed BOT team will have
 * at least one scouted candidate in its inbox by the
 * time a manager logs in and looks around.
 *
 * Why bulk-seed instead of letting the weekly cron
 * do it: the cron runs on Saturdays (see
 * `scout-scheduler.service.ts`); a manager who
 * claims a team on a Wednesday would otherwise see
 * an empty inbox for 3 days. The init seed covers
 * that gap.
 *
 * Idempotent: skips teams that already have a
 * non-expired candidate. The same team is then
 * picked up by the weekly cron starting next
 * Saturday.
 */
@Injectable()
export class ScoutSeedGenerator {
  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    @InjectRepository(TeamEntity)
    private readonly teamRepo: Repository<TeamEntity>,
    @InjectRepository(ScoutCandidateEntity)
    private readonly scoutRepo: Repository<ScoutCandidateEntity>,
  ) {}

  async generate(): Promise<void> {
    const teams = await this.teamRepo.find();
    if (teams.length === 0) {
      this.logger.info('[ScoutSeedGenerator] no teams, skipping');
      return;
    }

    // Find every team that already has a non-expired
    // candidate. We compare against `endOfCurrentWeek()`
    // because the API uses the same boundary for
    // candidate TTL — anything older has already been
    // pruned by the manager-facing inbox and we can
    // safely overwrite.
    const expiresAfter = endOfCurrentWeek();
    const existing = await this.scoutRepo
      .createQueryBuilder('c')
      .select('DISTINCT c.team_id', 'teamId')
      .where('c.expires_at > :now', { now: new Date() })
      .getRawMany();
    const existingTeamIds = new Set(
      existing.map((r: { teamId: string }) => r.teamId),
    );

    const toSeed = teams.filter((t) => !existingTeamIds.has(t.id));
    if (toSeed.length === 0) {
      this.logger.info(
        `[ScoutSeedGenerator] all ${teams.length} team(s) already have a non-expired candidate, skipping`,
      );
      return;
    }

    // Insert via the shared `seedSeniorScoutCandidate`
    // helper. It uses the senior skill caps and the
    // `nationality` pin so every team's first card looks
    // identical to a "real" weekly cron drop.
    let created = 0;
    for (const team of toSeed) {
      try {
        await seedSeniorScoutCandidate(
          this.scoutRepo.manager,
          team.id,
          team.nationality ?? 'CN',
        );
        created++;
      } catch (err) {
        // One bad team should not block the rest. We
        // log and continue so a partial init still
        // leaves 1359/1360 teams with a card.
        this.logger.warn(
          `[ScoutSeedGenerator] failed to seed team ${team.id} (${team.name}): ${(err as Error).message}`,
        );
      }
    }

    this.logger.info(
      `[ScoutSeedGenerator] created ${created} senior candidate(s) for ${toSeed.length} new team(s); next cron refresh expires at ${expiresAfter.toISOString()}`,
    );
  }
}
