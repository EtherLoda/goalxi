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
  GAME_SETTINGS,
  computeSeasonWeekOneMonday,
} from '@goalxi/database';

/**
 * Matchday cadence — 2 fixtures per week, both at
 * `GAME_SETTINGS.MATCH_KICKOFF_HOUR_UTC` (currently
 * 6:00 UTC = 14:00 in China time, the game
 * audience's afternoon slot).  Originally 13:00 UTC
 * (= 21:00 China evening); changed 2026-08-18 to
 * 6:00 UTC so league AND cup share one kickoff hour
 * and the broadcast window lines up globally. Cup
 * scheduler MUST read the same constant.
 *
 * For a 16-team league that's 15 weeks × 2 = 30
 * rounds. The week anchor is the Monday computed
 * by `computeSeasonWeekOneMonday` (next Monday at
 * 00:00 UTC after `initDate`); the round clock
 * steps off that anchor in 7-day increments.
 *
 *   round 0 → Wed of week 1, MATCH_KICKOFF_HOUR_UTC
 *   round 1 → Sat of week 1, MATCH_KICKOFF_HOUR_UTC
 *   round 2 → Wed of week 2, MATCH_KICKOFF_HOUR_UTC
 *   round 3 → Sat of week 2, MATCH_KICKOFF_HOUR_UTC
 *   ...
 */

/**
 * Senior round-robin options.
 */
interface RoundRobinOptions {
  /** Senior `league_id` the fixtures belong to. */
  leagueId: string;
  /**
   * The Monday of week 1, at 00:00:00 UTC
   * (`computeSeasonWeekOneMonday` output). All
   * match kickoffs step off this anchor.
   */
  weekOneMonday: Date;
  /** Season number stamped onto every match. */
  season: number;
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
  ) {}

  /**
   * Generate the full Season 1 schedule for every senior
   * league. Idempotent — if any season-1 match row already
   * exists, the call no-ops and the existing schedule is
   * left in place.
   *
   * `initDate` is the calendar day the user ran
   * `pnpm init:run --init-date=...` on. The week-1 anchor
   * is computed via `computeSeasonWeekOneMonday`
   * (next-Monday 00:00 UTC); the first kickoff is the
   * Wednesday at `GAME_SETTINGS.MATCH_KICKOFF_HOUR_UTC`
   * UTC of that week.
   *
   * 30 rounds per league (16 teams × double round-robin) ×
   * 85 leagues = 20,400 matches for the full pyramid.
   */
  async generateSeason1Schedule(initDate: Date): Promise<void> {
    const count = await this.matchRepo.count({ where: { season: 1 } });
    if (count > 0) {
      this.logger.info(
        `[ScheduleGenerator] ${count} season-1 match(es) already exist, skipping`,
      );
      return;
    }

    const weekOneMonday = computeSeasonWeekOneMonday(initDate);
    this.logger.info(
      `[ScheduleGenerator] Generating Season 1 schedule ` +
        `(week-1 Monday=${weekOneMonday.toISOString().split('T')[0]}, ` +
        `first kickoff=${this.matchStart(0, weekOneMonday).toISOString()})...`,
    );

    const total = await this.generateSeniorFixtures({
      weekOneMonday,
      season: 1,
    });

    this.logger.info(
      `[ScheduleGenerator] Generated ${total} senior match(es) for Season 1`,
    );
  }

  // ---------- senior fixtures ----------

  private async generateSeniorFixtures(options: {
    weekOneMonday: Date;
    season: number;
  }): Promise<number> {
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
        weekOneMonday: options.weekOneMonday,
        season: options.season,
      });
      await this.matchRepo.save(matches);
      total += matches.length;
    }
    return total;
  }

  // ---------- shared round-robin ----------

  /**
   * Standard circle method. Round 0 puts `teamIds[0]` at
   * home against the rotated slot; the rest of the round
   * pairs the outer + inner positions. Spacing is one full
   * week per round, so the season stretches cleanly across
   * 30 weeks for a 16-team league. The first kickoff is
   * the `anchorAt` instant; subsequent rounds step off in
   * 7-day increments.
   */
  private generateRoundRobin(
    teamIds: string[],
    options: RoundRobinOptions,
  ): Partial<MatchEntity>[] {
    const matches: Partial<MatchEntity>[] = [];
    const numRounds = teamIds.length - 1;
    const fixedTeam = teamIds[0];
    const rotatingTeams = teamIds.slice(1);

    // First leg — every team hosts once in the first N-1 rounds.
    for (let round = 0; round < numRounds; round++) {
      const matchups = this.generateRoundMatchups(
        fixedTeam,
        this.rotateTeams(rotatingTeams, round),
      );

      for (const { home, away } of matchups) {
        matches.push({
          leagueId: options.leagueId,
          youthLeagueId: null,
          season: options.season,
          week: round + 1,
          round: round + 1,
          homeTeamId: home,
          awayTeamId: away,
          status: MatchStatus.SCHEDULED,
          type: MatchType.LEAGUE,
          tacticsLocked: false,
          homeForfeit: false,
          awayForfeit: false,
          scheduledAt: this.matchStart(round, options.weekOneMonday),
        });
      }
    }

    // Second leg — same pairings, venues reversed.
    for (let round = 0; round < numRounds; round++) {
      const matchups = this.generateRoundMatchups(
        fixedTeam,
        this.rotateTeams(rotatingTeams, round),
      );

      for (const { home, away } of matchups) {
        matches.push({
          leagueId: options.leagueId,
          youthLeagueId: null,
          season: options.season,
          week: numRounds + round + 1,
          round: numRounds + round + 1,
          homeTeamId: away,
          awayTeamId: home,
          status: MatchStatus.SCHEDULED,
          type: MatchType.LEAGUE,
          tacticsLocked: false,
          homeForfeit: false,
          awayForfeit: false,
          scheduledAt: this.matchStart(
            numRounds + round,
            options.weekOneMonday,
          ),
        });
      }
    }

    return matches;
  }

  /**
   * Convert a round index (0-indexed) to a kickoff
   * instant. Round 0 = Wed MATCH_KICKOFF_HOUR_UTC of
   * week 1 (anchor + 2 days). Round 1 = Sat
   * MATCH_KICKOFF_HOUR_UTC of week 1 (anchor + 5
   * days). Round 2 = Wed MATCH_KICKOFF_HOUR_UTC of
   * week 2 (anchor + 9 days). Etc.
   *
   * Even rounds → Wednesday.
   * Odd rounds  → Saturday.
   * Both at GAME_SETTINGS.MATCH_KICKOFF_HOUR_UTC
   * (= 6:00 UTC = 14:00 in China time as of 2026-08-18).
   *
   * The `week` field on the match row (`week = round
   * + 1`) stays 1-indexed and is the human-readable
   * "matchday of the week" — even/odd in the round
   * index corresponds to 1st-half / 2nd-half of the
   * week from a manager's perspective.
   */
  private matchStart(round: number, weekOneMonday: Date): Date {
    const week = Math.floor(round / 2);
    const isWed = round % 2 === 0;
    // Monday=0, Wednesday=+2 days, Saturday=+5 days.
    const dayOffset = isWed ? 2 : 5;
    const out = new Date(
      weekOneMonday.getTime() + (week * 7 + dayOffset) * 24 * 60 * 60 * 1000,
    );
    out.setUTCHours(GAME_SETTINGS.MATCH_KICKOFF_HOUR_UTC, 0, 0, 0);
    return out;
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
    // Rotate by `round` positions so each round of the
    // round-robin gets a fresh pairing set. The previous
    // implementation only rotated by 1 every call, which
    // collapsed the schedule: every round reused the same
    // 8 matchups, so the "round-robin" was really just a
    // fixed team pinned against the rotating slot.
    const rotated = [...teams];
    for (let i = 0; i < round; i++) {
      const last = rotated.pop()!;
      rotated.unshift(last);
    }
    return rotated;
  }
}
