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
   * pairs the outer + inner positions.
   *
   * 30 rounds = 2 × (N-1) = double round-robin for a
   * 16-team league. Each round has 8 matches (N/2). Two
   * rounds share a single `week` (Wed + Sat), so the
   * season stretches across 15 `week`s — see
   * `GAME_SETTINGS.SEASON_LENGTH_WEEKS` which the cron
   * layer anchors against. Match weeks 1-15 = the regular
   * season; week 16 is reserved for the playoff + season
   * transition.
   *
   * Field semantics on the match row:
   *   - `week`  : 1..15, the human-readable "matchday of
   *               the season" (1-indexed, day-aligned).
   *               Both legs reuse the same `week` since
   *               both fit in the same 15-week calendar.
   *   - `round` : 1 or 2 within the week (1 = Wed, 2 = Sat).
   *   - `scheduledAt` : absolute kickoff instant derived
   *               from `matchStart(round, weekOneMonday)`.
   *               The second leg is offset by `numRounds`
   *               so it lands in weeks 8-15, not back on
   *               the first leg's dates.
   */
  private generateRoundRobin(
    teamIds: string[],
    options: RoundRobinOptions,
  ): Partial<MatchEntity>[] {
    const matches: Partial<MatchEntity>[] = [];
    const numRounds = teamIds.length - 1;
    const fixedTeam = teamIds[0];
    const rotatingTeams = teamIds.slice(1);

    // First leg — every team hosts once in weeks 1..⌈N/2⌉.
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
          // `week` is the 1-indexed schedule week, not the
          // round number. Each week holds 2 rounds (Wed +
          // Sat), so weeks 1..15 span 30 rounds. The
          // season-transition cron (SeasonTransitionService
          // .checkAndGeneratePlayoffs) keys on `week === 15`
          // to decide the playoff trigger, so this field
          // MUST stay aligned with that 1-15 range.
          week: Math.floor(round / 2) + 1,
          // `round` is the round within the week (1 = Wed,
          // 2 = Sat). Previously this column held the
          // absolute round number (1..30) which collapsed
          // the Wed/Sat distinction and made the FE
          // round-1 view show every Wed fixture as both
          // "round 1" and "round 2" depending on the
          // 0-indexed iteration of the loop.
          round: (round % 2) + 1,
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
    // The first leg's loop variable `round` runs 0..N-2,
    // so the second leg's kickoff is `numRounds + round`
    // to push it past the first leg (otherwise both legs
    // landed on the same Wed/Sat pair and the same pair of
    // teams would play twice on the same day with the
    // venue flipped — which the simulator cannot run).
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
          week: Math.floor((numRounds + round) / 2) + 1,
          round: ((numRounds + round) % 2) + 1,
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
   * The 30 round indices of a 16-team double round-robin
   * map to 15 schedule weeks (2 rounds per week):
   *   round 0  → week 1 Wed
   *   round 1  → week 1 Sat
   *   round 2  → week 2 Wed
   *   ...
   *   round 28 → week 15 Wed
   *   round 29 → week 15 Sat
   *
   * The caller's `round` argument is the loop variable
   * across both legs (0..N-2 first leg, then
   * numRounds..2*numRounds-1 second leg after the fix
   * to the second-leg `matchStart` offset), so passing
   * `numRounds + round` from the second leg pushes its
   * kickoff past the first leg's last round.
   *
   * Even rounds → Wednesday.
   * Odd rounds  → Saturday.
   * Both at GAME_SETTINGS.MATCH_KICKOFF_HOUR_UTC
   * (= 6:00 UTC = 14:00 in China time as of 2026-08-18).
   *
   * NOTE: the caller is responsible for stamping
   * `match.week` separately (see `generateRoundRobin`).
   * The historical `week = round + 1` here was moved
   * up to that loop and is now `Math.floor(round / 2)
   * + 1` so it tracks the schedule week rather than the
   * absolute round number.
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
