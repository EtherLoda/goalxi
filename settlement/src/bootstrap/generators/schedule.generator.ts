import { Injectable, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MatchEntity,
  MatchStatus,
  MatchType,
  LeagueEntity,
  TeamEntity,
  YouthLeagueEntity,
  YouthTeamEntity,
} from '@goalxi/database';

/**
 * Anchor date for Season 1 match scheduling. We use a real date so
 * the preprocessor's `scheduledAt <= now + deadline` window can pick
 * matches up week by week. The actual season start is at least
 * `SCHEDULE_LEAD_MINUTES` from now, so matches don't all fire on the
 * first tick after bootstrap.
 */
const SEASON_1_START = new Date('2026-04-06T20:00:00Z');
const SCHEDULE_LEAD_MINUTES = 60;
const ROUND_INTERVAL_DAYS = 7;

interface RoundRobinOptions {
  /** Senior `league_id` (null for youth matches). */
  leagueId: string | null;
  /** Youth `youth_league_id` (null for senior matches). */
  youthLeagueId: string | null;
  /**
   * Offset in minutes added to the senior fixture's start time. Use
   * this to stagger youth matches so they don't overlap senior ones
   * on the same round (the sim queue processes them in parallel, so
   * this is cosmetic for the UI rather than functional).
   */
  minuteOffset?: number;
}

@Injectable()
export class ScheduleGenerator {
  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    @InjectRepository(MatchEntity)
    private readonly matchRepo: Repository<MatchEntity>,
    @InjectRepository(LeagueEntity)
    private readonly leagueRepo: Repository<LeagueEntity>,
    @InjectRepository(TeamEntity)
    private readonly teamRepo: Repository<TeamEntity>,
    @InjectRepository(YouthLeagueEntity)
    private readonly youthLeagueRepo: Repository<YouthLeagueEntity>,
    @InjectRepository(YouthTeamEntity)
    private readonly youthTeamRepo: Repository<YouthTeamEntity>,
  ) {}

  async generateSeason1Schedule(): Promise<void> {
    const count = await this.matchRepo.count();
    if (count > 0) {
      this.logger.info(
        `[ScheduleGenerator] ${count} matches already exist, skipping`,
      );
      return;
    }

    this.logger.info('[ScheduleGenerator] Generating Season 1 schedule...');

    const totalSenior = await this.generateSeniorFixtures();
    const totalYouth = await this.generateYouthFixtures();

    this.logger.info(
      `[ScheduleGenerator] Generated ${totalSenior} senior + ${totalYouth} youth match(es) for Season 1`,
    );
  }

  // ---------- senior fixtures ----------

  private async generateSeniorFixtures(): Promise<number> {
    const leagues = await this.leagueRepo.find();
    let total = 0;
    for (const league of leagues) {
      const teams = await this.teamRepo.find({
        where: { leagueId: league.id },
      });
      const teamIds = teams.map((t) => t.id);

      if (teamIds.length < 4) {
        this.logger.warn(
          `[ScheduleGenerator] League "${league.name}" has only ${teamIds.length} teams, skipping`,
        );
        continue;
      }

      const matches = this.generateRoundRobin(teamIds, {
        leagueId: league.id,
        youthLeagueId: null,
      });
      await this.matchRepo.save(matches);
      total += matches.length;
    }
    return total;
  }

  // ---------- youth fixtures (WAVE A2) ----------

  private async generateYouthFixtures(): Promise<number> {
    const youthLeagues = await this.youthLeagueRepo.find();
    if (youthLeagues.length === 0) {
      this.logger.warn(
        '[ScheduleGenerator] No youth_league rows found — did WAVE A1 run? Skipping youth fixtures.',
      );
      return 0;
    }
    let total = 0;
    for (const yl of youthLeagues) {
      // youth_team.teamId IS the senior team id (1:1 mapping back to team).
      const youthTeams = await this.youthTeamRepo.find({
        where: { youthLeagueId: yl.id },
      });
      const seniorTeamIds = youthTeams.map((yt) => yt.teamId);

      if (seniorTeamIds.length < 4) {
        this.logger.warn(
          `[ScheduleGenerator] Youth league "${yl.name}" has only ${seniorTeamIds.length} team(s), skipping (round-robin needs 4+)`,
        );
        continue;
      }

      // 2-day offset on top of the senior start so a youth match and
      // the corresponding senior match don't open for tactics at the
      // same instant (cosmetic; the sim queue can process them in
      // parallel regardless).
      const matches = this.generateRoundRobin(seniorTeamIds, {
        leagueId: null,
        youthLeagueId: yl.id,
        minuteOffset: 60 * 24 * 2,
      });
      await this.matchRepo.save(matches);
      total += matches.length;
    }
    return total;
  }

  // ---------- shared round-robin ----------

  private generateRoundRobin(
    teamIds: string[],
    options: RoundRobinOptions,
  ): Partial<MatchEntity>[] {
    const matches: Partial<MatchEntity>[] = [];
    const numRounds = teamIds.length - 1;

    const fixedTeam = teamIds[0];
    const rotatingTeams = teamIds.slice(1);
    const minuteOffset = options.minuteOffset ?? 0;

    // First half (home-and-away: every team hosts once in the first N-1
    // rounds, then the return legs in rounds N..2N-1).
    for (let round = 0; round < numRounds; round++) {
      const matchups = this.generateRoundMatchups(
        fixedTeam,
        this.rotateTeams(rotatingTeams, round),
      );

      for (const { home, away } of matchups) {
        matches.push({
          leagueId: options.leagueId,
          youthLeagueId: options.youthLeagueId,
          homeTeamId: home,
          awayTeamId: away,
          season: 1,
          week: round + 1,
          status: MatchStatus.SCHEDULED,
          type: MatchType.LEAGUE,
          tacticsLocked: false,
          homeForfeit: false,
          awayForfeit: false,
          scheduledAt: this.matchStart(round, minuteOffset),
        });
      }
    }

    // Second half (home/away swapped → same pairings, reversed venue).
    for (let round = 0; round < numRounds; round++) {
      const matchups = this.generateRoundMatchups(
        fixedTeam,
        this.rotateTeams(rotatingTeams, round),
      );

      for (const { home, away } of matchups) {
        matches.push({
          leagueId: options.leagueId,
          youthLeagueId: options.youthLeagueId,
          homeTeamId: away,
          awayTeamId: home,
          season: 1,
          week: numRounds + round + 1,
          status: MatchStatus.SCHEDULED,
          type: MatchType.LEAGUE,
          tacticsLocked: false,
          homeForfeit: false,
          awayForfeit: false,
          scheduledAt: this.matchStart(numRounds + round, minuteOffset),
        });
      }
    }

    return matches;
  }

  /**
   * Compute the scheduled kickoff time for `round` (0-indexed).
   * Anchored to `SEASON_1_START` plus a lead buffer so the first
   * match doesn't fire the moment the service starts. Subsequent
   * rounds are spaced by `ROUND_INTERVAL_DAYS` days.
   */
  private matchStart(round: number, minuteOffset = 0): Date {
    const start = new Date(SEASON_1_START);
    const now = new Date();
    // If SEASON_1_START is in the past, push the first match out by
    // SCHEDULE_LEAD_MINUTES so the preprocessor doesn't fire it
    // immediately on bootstrap.
    const lead = Math.max(0, start.getTime() - now.getTime()) >
      SCHEDULE_LEAD_MINUTES * 60_000
      ? 0
      : SCHEDULE_LEAD_MINUTES * 60_000;
    const kickoff = new Date(
      Math.max(start.getTime(), now.getTime() + lead) +
        round * ROUND_INTERVAL_DAYS * 24 * 60 * 60 * 1000 +
        minuteOffset * 60_000,
    );
    return kickoff;
  }

  private generateRoundMatchups(
    fixedTeam: string,
    rotatingTeams: string[],
  ): Array<{ home: string; away: string }> {
    const matchups: Array<{ home: string; away: string }> = [];
    matchups.push({ home: fixedTeam, away: rotatingTeams[0] });

    for (let i = 1; i < rotatingTeams.length / 2; i++) {
      matchups.push({
        home: rotatingTeams[rotatingTeams.length - i],
        away: rotatingTeams[i],
      });
    }

    return matchups;
  }

  private rotateTeams(teams: string[], round: number): string[] {
    const rotated = [...teams];
    const last = rotated.pop()!;
    rotated.unshift(last);
    return rotated;
  }
}
