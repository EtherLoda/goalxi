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
  circleMethodPairings,
  thielenEHV,
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
    // Step 1 — generate all pairings for all rounds upfront
    // using the standard circle method. We need the full
    // pairings list before assigning HA, because the HA
    // assignment (Thielen CSP below) considers the
    // interaction between consecutive rounds for every
    // team — a per-round, per-matchup HA decision in
    // isolation can't see the cross-round "no 3-streak"
    // constraint.
    //
    // The pairings + Thielen CSP both live in
    // `libs/database/src/services/thielen-ehv.ts` so
    // the season-1 init path (this method) and the
    // mid-season reschedule path
    // (`SeasonSchedulerService.generateDoubleRoundRobin`)
    // use the exact same algorithm and produce the
    // exact same HA guarantees.
    const pairings = circleMethodPairings(teamIds);

    // Step 2 — Thielen CSP: assign home/away to each
    // match such that no team has 3 or more consecutive
    // home games or 3 or more consecutive away games.
    //
    // The previous per-round parity rule (commit
    // `1715502`) gave the fixed team a perfect
    // alternation but left some non-fixed teams with 3-in-
    // a-row streaks in the middle of a leg (e.g. T1 and
    // T2 in the 8-team trace the user observed in the
    // dashboard). A per-round greedy fix-up wasn't
    // sufficient because flipping one pair to fix team
    // A's streak created a fresh streak on team B
    // (oscillation).
    //
    // The Thielen-style CSP works because it considers
    // the constraint globally: every match's HA choice
    // is checked against the previous two rounds for
    // BOTH teams in the match, and a choice that would
    // complete a 3-streak for either team is pruned. The
    // backtracking is bounded — for N=8 (28 matches) the
    // search converges in microseconds; for N=16 (120
    // matches) it converges in well under a second.
    //
    // Edge case (N < 6): the Thielen 2003 paper
    // guarantees a max-≤-2 assignment for the standard
    // 1-factorization only when N ≥ 6. For N=4 (4-team
    // trace the `handles an odd-team league (5 teams)`
    // spec sits next to) and N=5 (5-team odd), the
    // circle-method pairings leave the CSP with no valid
    // assignment. We catch the throw and fall back to
    // the pre-`8baa766` per-round parity rule — the
    // production pyramid never hits N < 6 (the
    // `generateSeniorFixtures` skip is `N < 4`, the
    // standard tiers are 16/8/6), so this is purely a
    // "doesn't throw" guard for defensive / odd-team
    // shapes. The fallback is the same rule the
    // pre-`8baa766` code used and is covered by the
    // `handles an odd-team league (5 teams)` spec that
    // just asserts the match count, not the streak.
    let haMatrix: Map<string, boolean[]>;
    try {
      haMatrix = thielenEHV({ teamIds, pairings });
    } catch (err) {
      this.logger.warn(
        `[ScheduleGenerator] thielenEHV failed for N=${teamIds.length} ` +
          `(${(err as Error).message}); falling back to per-round parity HA. ` +
          `This is a defensive path — the production pyramid has N ∈ {16, 8, 6}.`,
      );
      haMatrix = perRoundParityHA(pairings, teamIds);
    }

    // Step 3 — materialise matches. The two-pass layout
    // (all leg-1 rows first, then all leg-2 rows) is
    // pinned by `schedules the second leg at least 7
    // days after the first leg of the same pairing` —
    // the spec asserts `firstLegMax < secondLegMin`,
    // which requires leg 1 to be fully pushed before any
    // leg 2 row.
    const numRounds = teamIds.length - 1;
    const matches: Partial<MatchEntity>[] = [];
    // Leg 1
    for (let r = 0; r < numRounds; r++) {
      for (const [a, b] of pairings[r]) {
        const aHome = haMatrix.get(a)![r];
        const home = aHome ? a : b;
        const away = aHome ? b : a;
        const scheduledAt = this.matchStart(r, options.weekOneMonday);
        matches.push({
          leagueId: options.leagueId,
          youthLeagueId: null,
          season: options.season,
          week: this.weekFromScheduledAt(scheduledAt, options.weekOneMonday),
          round: (r % 2) + 1,
          homeTeamId: home,
          awayTeamId: away,
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
    // Leg 2 — mirror HA. The Thielen CSP assigned HA
    // for leg 1 (rounds 0..N-2); leg 2 is the same
    // pairings with home/away swapped, which is the
    // standard double round-robin contract ("each pair
    // plays once at each venue"). The Thielen
    // construction guarantees the COMBINED leg-1 + leg-2
    // sequence for every team has no 3-streak because
    // the leg-2 sequence is the inverse of leg-1 (if
    // leg 1 is H A H A H A H A, leg 2 is A H A H A H
    // A H, and the boundary at positions N-1 / N has
    // values M[N-2] and inverse(M[0]); these are always
    // different when M starts and ends with single
    // values, which the CSP guarantees by construction).
    for (let r = 0; r < numRounds; r++) {
      for (const [a, b] of pairings[r]) {
        const aHome = haMatrix.get(a)![r];
        // Mirror: the leg-1 home becomes the leg-2 away.
        const home = aHome ? b : a;
        const away = aHome ? a : b;
        const scheduledAt = this.matchStart(
          numRounds + r,
          options.weekOneMonday,
        );
        matches.push({
          leagueId: options.leagueId,
          youthLeagueId: null,
          season: options.season,
          week: this.weekFromScheduledAt(scheduledAt, options.weekOneMonday),
          round: ((numRounds + r) % 2) + 1,
          homeTeamId: home,
          awayTeamId: away,
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

/**
 * Fallback HA assignment used when `thielenEHV` throws
 * "no valid HA assignment" — which only happens for
 * N=4 and N=5 with the standard circle-method
 * 1-factorization. The Thielen paper guarantees the
 * CSP converges for N ≥ 6; below that the CSP
 * constraints are too tight and the search space is
 * empty.
 *
 * The fallback is the pre-`8baa766` per-round parity
 * rule: in even rounds the "first-listed" team in
 * each pair is home; in odd rounds the second-listed
 * team is. This is NOT optimal (can produce
 * 3-streaks for some teams in some N) but it's a
 * "doesn't throw" guard for the defensive / odd-team
 * shapes. The production pyramid only ever hits
 * N ∈ {16, 8, 6} (handled by Thielen), so this
 * fallback never fires in production.
 *
 * Returns a `Map<teamId, boolean[]>` in the same
 * shape `thielenEHV` returns so the caller can use it
 * as a drop-in replacement.
 */
function perRoundParityHA(
  pairings: Array<Array<[string, string]>>,
  teamIds: string[],
): Map<string, boolean[]> {
  const teamIdx = new Map<string, number>();
  teamIds.forEach((id, i) => teamIdx.set(id, i));
  const teamHA: boolean[][] = teamIds.map(() => []);
  for (let r = 0; r < pairings.length; r++) {
    const isEven = r % 2 === 0;
    for (const [a, b] of pairings[r]) {
      // "First-listed" home in even rounds; "second-listed"
      // home in odd rounds. For each pair we set one
      // team's HA to true and the other's to false.
      const aHome = isEven;
      const bHome = !aHome;
      teamHA[teamIdx.get(a)!].push(aHome);
      teamHA[teamIdx.get(b)!].push(bHome);
    }
  }
  const result = new Map<string, boolean[]>();
  teamIds.forEach((id, i) => result.set(id, teamHA[i]));
  return result;
}
