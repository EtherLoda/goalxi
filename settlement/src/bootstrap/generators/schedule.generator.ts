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
  StadiumEntity,
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
  /**
   * `teamId → stadiumId` lookup, pre-loaded once at the
   * top of `generateSeason1Schedule` so every match row
   * gets `stadiumId = map.get(homeTeamId) ?? null` without
   * a per-row DB hit. The map is built from a single
   * `stadiumRepo.find()` over the whole `stadium` table;
   * passing it through (rather than re-querying per
   * league) keeps the round-robin pure and lets the spec
   * stub it without faking a real repo.
   */
  stadiumIdByTeam: Map<string, string>;
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
    @InjectRepository(StadiumEntity)
    private readonly stadiumRepo: Repository<StadiumEntity>,
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

    // Pre-fetch every stadium ONCE. The round-robin generates
    // 20,400 matches for the full 85-league pyramid; looking
    // up the venue per-match would be 20,400 PK lookups.
    // One `SELECT id, team_id` over the stadium table is
    // a single round-trip and the result is small
    // (≤ team count rows). The map is then used by both
    // legs of every round-robin to stamp `match.stadium_id`
    // so the FE's `/matches/:id` venue column is non-null
    // on a freshly-initialised DB (previously it was
    // silently null because this generator never set the
    // column, and only the historical backfill in
    // migration 1721000000001-AddMatchStadiumId patched
    // existing rows — fresh init rows were left null).
    const stadiumRows = await this.stadiumRepo.find({
      select: ['id', 'teamId'],
    });
    const stadiumIdByTeam = new Map<string, string>(
      stadiumRows.map((s) => [s.teamId, s.id]),
    );
    this.logger.info(
      `[ScheduleGenerator] Pre-loaded ${stadiumIdByTeam.size} stadium id(s) for venue stamping`,
    );

    const total = await this.generateSeniorFixtures({
      weekOneMonday,
      season: 1,
      stadiumIdByTeam,
    });

    this.logger.info(
      `[ScheduleGenerator] Generated ${total} senior match(es) for Season 1`,
    );
  }

  // ---------- senior fixtures ----------

  private async generateSeniorFixtures(options: {
    weekOneMonday: Date;
    season: number;
    stadiumIdByTeam: Map<string, string>;
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
        stadiumIdByTeam: options.stadiumIdByTeam,
      });
      await this.matchRepo.save(matches);
      total += matches.length;
    }
    return total;
  }

  /**
   * Derive the 1-indexed schedule week from a match's
   * actual kickoff instant. The week is calendar-aligned
   * (Mon 00:00 UTC to next Mon 00:00 UTC) and anchored on
   * `weekOneMonday`. Computing the week from `scheduledAt`
   * rather than from the round index means a rescheduled
   * match (weather delay, admin push, makeup game) keeps
   * the same physical week as its new kickoff time — so
   * the FE's "Week X" label and the playoff cron gate
   * (`SeasonTransitionService.checkAndGeneratePlayoffs`
   * firing on `week === 15`) both stay correct without
   * needing a separate `recomputeWeekForMatch` step.
   *
   * Returns a 1-indexed integer; never 0. (Cup matches
   * explicitly stamp `week=0` to bypass this — see
   * `CupSchedulerService.materializeRound`'s comment on
   * the `week=0` sentinel.)
   *
   * Public (not `private`) because any code that needs
   * to recompute a league-week from a (rescheduled)
   * timestamp — match reschedule handlers, replay tools,
   * analytics jobs that join match events to schedule
   * weeks — is a legitimate caller. The function is
   * pure (no side effects) and the contract is
   * stable (1-indexed, never 0 for a league match).
   */
  weekFromScheduledAt(scheduledAt: Date, weekOneMonday: Date): number {
    const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
    const delta = scheduledAt.getTime() - weekOneMonday.getTime();
    return Math.floor(delta / MS_PER_WEEK) + 1;
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
        const scheduledAt = this.matchStart(round, options.weekOneMonday);
        matches.push({
          leagueId: options.leagueId,
          youthLeagueId: null,
          season: options.season,
          // `week` is derived from `scheduledAt`, NOT from
          // the round index. Computing it via
          // `weekFromScheduledAt` keeps the field aligned
          // with the actual calendar week even when a
          // match is rescheduled. The previous
          // `Math.floor(round / 2) + 1` happened to match
          // the calendar week under the original schedule
          // but broke the moment any match was moved
          // (weather delay, makeup game, admin push).
          // Season-transition cron keys on `week === 15`
          // to fire the playoff trigger, so the alignment
          // is load-bearing.
          week: this.weekFromScheduledAt(scheduledAt, options.weekOneMonday),
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
          // Stamp the home team's stadium id at schedule
          // time. The pre-loaded `stadiumIdByTeam` map
          // makes this an O(1) lookup; a missing entry
          // falls back to null (matches the historical
          // `match.stadium_id` column being nullable for
          // pre-migration rows). The `match.service.ts`
          // venue field is `match.stadium?.name ?? null`,
          // so a non-null id is what the FE needs to
          // render the venue line on the match detail
          // page.
          stadiumId: options.stadiumIdByTeam.get(home) ?? null,
          status: MatchStatus.SCHEDULED,
          type: MatchType.LEAGUE,
          tacticsLocked: false,
          homeForfeit: false,
          awayForfeit: false,
          scheduledAt,
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
        const scheduledAt = this.matchStart(
          numRounds + round,
          options.weekOneMonday,
        );
        matches.push({
          leagueId: options.leagueId,
          youthLeagueId: null,
          season: options.season,
          // Same `weekFromScheduledAt` derivation as the
          // first leg — see comment there for rationale.
          week: this.weekFromScheduledAt(scheduledAt, options.weekOneMonday),
          round: ((numRounds + round) % 2) + 1,
          homeTeamId: away,
          awayTeamId: home,
          // Venue reverses with the legs. The original
          // `home` from the first leg becomes the away
          // here, so we look up the stadium for `away`
          // (the new home team).
          stadiumId: options.stadiumIdByTeam.get(away) ?? null,
          status: MatchStatus.SCHEDULED,
          type: MatchType.LEAGUE,
          tacticsLocked: false,
          homeForfeit: false,
          awayForfeit: false,
          scheduledAt,
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

  /**
   * Build the per-round matchup list for the circle
   * method. `fixedTeam` (always `teamIds[0]`) plays
   * `rotatingTeams[0]`; the rest of the round pairs
   * the outer + inner positions of the rotated list.
   *
   * Yields `floor(N/2)` matchups per round where
   * `N = 1 + rotatingTeams.length` is the total team
   * count:
   *
   *   - `N` even (the standard case, e.g. 16 / 8 / 6
   *     team leagues): every team plays once per
   *     round, no byes. `floor(N/2) = N/2` matchups.
   *   - `N` odd (e.g. 7 / 5 / 3 team leagues):
   *     `floor(N/2)` matchups, so the rightmost team
   *     in the rotated list sits out the round
   *     (gets a "bye"). The `generateAllTeams` /
   *     `teamGenerator` upstream should not produce
   *     odd-`maxTeams` leagues for a 16-team
   *     pyramid, but the algorithm degrades safely
   *     if it ever does.
   *
   * League size < 4 is caught by the caller
   * (`generateSeniorFixtures` skips leagues with
   * `teamIds.length < 4`), so the degenerate 1- or
   * 2-team case (where the bye logic would be
   * ambiguous) never reaches here.
   */
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
