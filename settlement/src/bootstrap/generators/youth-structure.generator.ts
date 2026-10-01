import { Injectable, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  LeagueEntity,
  TeamEntity,
  YouthLeagueEntity,
  YouthTeamEntity,
} from '@goalxi/database';

/**
 * WAVE A1 — youth-structure bootstrap.
 *
 * ⛔ **FROZEN SUBSYSTEM — hands off.** Youth development is paused
 * indefinitely; see the "Youth Pipeline" section of `CLAUDE.md`. This
 * generator must keep running (youth fixtures depend on the rows it
 * creates, and youth fixtures are still simulated every matchday).
 * Freezing means *don't develop it*, not *shut it down* — do not delete
 * it as cleanup, and do not add academy features, without an explicit
 * go-ahead from the maintainer.
 *
 * Note the skip for teams with no `leagueId` (line ~81). That is what
 * makes the "team-less youth can never pass the promotion gate" note in
 * `CLAUDE.md` true in practice — every youth row this subsystem creates
 * does have a team.
 *
 * For every senior `league`, ensure exactly one `youth_league` exists
 * (1:1 mapping by `senior_league_id`). For every senior `team`,
 * ensure exactly one `youth_team` exists (1:1 mapping by `team_id`).
 *
 * Both creations are idempotent: the generator no-ops if the link row
 * already exists, so re-running `BootstrapService.onModuleInit` after
 * a fresh migration is safe.
 *
 * Order of operations: this MUST run after `LeagueGenerator` and
 * `TeamGenerator` (so the senior rows exist) and BEFORE
 * `ScheduleGenerator` (so the schedule generator can resolve
 * `youth_team.teamId → senior team`).
 */
@Injectable()
export class YouthStructureGenerator {
  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    @InjectRepository(LeagueEntity)
    private readonly leagueRepo: Repository<LeagueEntity>,
    @InjectRepository(YouthLeagueEntity)
    private readonly youthLeagueRepo: Repository<YouthLeagueEntity>,
    @InjectRepository(TeamEntity)
    private readonly teamRepo: Repository<TeamEntity>,
    @InjectRepository(YouthTeamEntity)
    private readonly youthTeamRepo: Repository<YouthTeamEntity>,
  ) {}

  async generate(): Promise<void> {
    const seniorLeagues = await this.leagueRepo.find();
    if (seniorLeagues.length === 0) {
      this.logger.warn(
        '[YouthStructureGenerator] No senior leagues found, skipping youth structure creation',
      );
      return;
    }

    // ---- 1. youth_league ↔ senior_league (1:1) ----
    const seniorLeagueIdToYouthLeague = new Map<string, YouthLeagueEntity>();
    let leaguesCreated = 0;
    for (const senior of seniorLeagues) {
      let youthLeague = await this.youthLeagueRepo.findOne({
        where: { seniorLeagueId: senior.id },
      });
      if (!youthLeague) {
        youthLeague = this.youthLeagueRepo.create({
          name: `青训联赛 ${senior.name}`,
          parentTier: senior.tier,
          maxTeams: senior.maxTeams ?? 16,
          status: 'active',
          seniorLeagueId: senior.id,
        });
        youthLeague = await this.youthLeagueRepo.save(youthLeague);
        leaguesCreated++;
        this.logger.info(
          `[YouthStructureGenerator] Created youth_league "${youthLeague.name}" → senior "${senior.name}"`,
        );
      }
      seniorLeagueIdToYouthLeague.set(senior.id, youthLeague);
    }

    // ---- 2. youth_team ↔ senior_team (1:1) ----
    const seniorTeams = await this.teamRepo.find();
    let teamsCreated = 0;
    let teamsSkippedNoLeague = 0;
    for (const team of seniorTeams) {
      if (!team.leagueId) {
        // Free-agent or pre-league-assigned team — skip.
        teamsSkippedNoLeague++;
        continue;
      }
      const existing = await this.youthTeamRepo.findOne({
        where: { teamId: team.id },
      });
      if (existing) continue;
      const youthLeague = seniorLeagueIdToYouthLeague.get(team.leagueId);
      if (!youthLeague) {
        teamsSkippedNoLeague++;
        this.logger.warn(
          `[YouthStructureGenerator] No youth_league for team "${team.name}" (senior league ${team.leagueId}) — skipping`,
        );
        continue;
      }
      const youthTeam = this.youthTeamRepo.create({
        teamId: team.id,
        youthLeagueId: youthLeague.id,
        name: `${team.name} 青年队`,
      });
      await this.youthTeamRepo.save(youthTeam);
      teamsCreated++;
    }

    this.logger.info(
      `[YouthStructureGenerator] Done — ` +
        `${leaguesCreated} new youth_league, ${teamsCreated} new youth_team, ` +
        `${teamsSkippedNoLeague} team(s) skipped (no senior league)`,
    );
  }
}
