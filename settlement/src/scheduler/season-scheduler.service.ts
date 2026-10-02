import { Injectable, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  GAME_SETTINGS,
  LeagueEntity,
  LeagueStandingEntity,
  MatchEntity,
  MatchStatus,
  MatchType,
  circleMethodPairings,
  computeSeasonWeekOneMonday,
  resolveInitDate,
  thielenEHV,
} from '@goalxi/database';

@Injectable()
export class SeasonSchedulerService {
  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    @InjectRepository(MatchEntity)
    private readonly matchRepository: Repository<MatchEntity>,
    @InjectRepository(LeagueEntity)
    private readonly leagueRepository: Repository<LeagueEntity>,
    @InjectRepository(LeagueStandingEntity)
    private readonly standingRepository: Repository<LeagueStandingEntity>,
    // Only for `resolveInitDate` — see `calculateNextSeasonStartDate`.
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Generate the full double round-robin schedule for a
   * single league. The `week` field on each match is the
   * 1-indexed schedule week (1..15, the same range the
   * `SeasonTransitionService` cron keys on), not the
   * absolute round number. See `ScheduleGenerator` in
   * `bootstrap/generators/schedule.generator.ts` for the
   * matching senior-only implementation.
   */
  async generateSeasonSchedule(
    leagueId: string,
    teamIds: string[],
    season: number,
    startDate: Date,
  ): Promise<MatchEntity[]> {
    if (teamIds.length % 2 !== 0) {
      throw new Error('Number of teams must be even');
    }

    if (teamIds.length < 4) {
      throw new Error('League must have at least 4 teams');
    }

    this.logger.info(
      `Generating season ${season} schedule for league ${leagueId} with ${teamIds.length} teams`,
    );

    const matches = this.generateDoubleRoundRobin(
      teamIds,
      leagueId,
      season,
      startDate,
    );

    const savedMatches = await this.matchRepository.save(matches);

    this.logger.info(
      `Generated ${savedMatches.length} matches for league ${leagueId} season ${season}`,
    );

    return savedMatches;
  }

  /**
   * Generate the next season's schedule across every
   * league. Reads the `league_standing` rows from the
   * upcoming season (created by
   * `LeagueStandingService.initNewSeasonStandings` earlier
   * in the season-transition pipeline) and emits a fresh
   * schedule for each league based on whatever teams now
   * live in it (post promotion/relegation).
   *
   * The historical implementation required exactly 16
   * teams in a league before emitting a schedule — which
   * silently dropped every league that had drifted to a
   * different team count. The fix accepts any even team
   * count ≥ 4 so off-by-one promotion/relegation counts
   * still get a working schedule.
   *
   * ## Idempotency
   *
   * Per-league guard on "does this league already have fixtures for
   * `nextSeason`?". There was none here, which was the most damaging
   * consequence of `SeasonTransitionService.checkAndProcessSeasonStart`
   * having no latch: that method logs-and-rethrows, so if step 4 (this
   * method) fails on the FIRST drifting league after steps 1-3 already
   * committed, next week's cron re-runs it and inserts a complete
   * duplicate fixture list — ~20,400 extra `match` rows, teams playing
   * every opponent twice in the same week slots, with no unique
   * constraint on `match` to stop it.
   *
   * `ScheduleGenerator.generateSeasonSchedule` (the season-1 path) has
   * the equivalent `count > 0` check; this path did not.
   */
  async generateNextSeasonSchedule(
    currentSeason: number,
  ): Promise<MatchEntity[]> {
    const nextSeason = currentSeason + 1;

    const leagues = await this.leagueRepository.find();
    const initDate = await resolveInitDate(
      this.dataSource.manager,
      process.env.GAME_START_DATE,
    );
    const startDate = this.calculateNextSeasonStartDate(
      initDate,
      currentSeason,
    );

    const allMatches: MatchEntity[] = [];
    let skippedAlreadyScheduled = 0;

    for (const league of leagues) {
      // Idempotency: never re-emit a fixture list that already exists.
      const existingCount = await this.matchRepository.count({
        where: { leagueId: league.id, season: nextSeason },
      });
      if (existingCount > 0) {
        skippedAlreadyScheduled++;
        this.logger.warn(
          `[SeasonScheduler] League ${league.id} already has ${existingCount} match(es) for season ${nextSeason}, skipping (idempotency guard)`,
        );
        continue;
      }

      // Read team ids from the *upcoming* season's
      // standings (post promotion/relegation). Using
      // `standingRepository` directly instead of
      // `matchRepository.manager.createQueryBuilder(...).from('league_standing', ...)`
      // — the old shape went through the MatchEntity
      // entity just to read from a different table, which
      // made the call site misleading and brittle to
      // repository refactors.
      const standings = await this.standingRepository.find({
        where: { leagueId: league.id, season: nextSeason },
        select: ['teamId'],
      });
      const teamIds = standings.map((s) => s.teamId);

      if (teamIds.length < 4 || teamIds.length % 2 !== 0) {
        this.logger.warn(
          `[SeasonScheduler] League ${league.id} has ${teamIds.length} team(s) in season ${nextSeason}, skipping schedule`,
        );
        continue;
      }

      const matches = await this.generateSeasonSchedule(
        league.id,
        teamIds,
        nextSeason,
        startDate,
      );
      allMatches.push(...matches);
    }

    this.logger.info(
      `Generated ${allMatches.length} matches for Season ${nextSeason}` +
        (skippedAlreadyScheduled > 0
          ? ` (${skippedAlreadyScheduled} league(s) skipped — already scheduled)`
          : ''),
    );

    return allMatches;
  }

  /**
   * The Monday that starts season `nextSeason`'s first match-week.
   *
   * Derived from the game's own anchor, not from `now`:
   *
   *   computeSeasonWeekOneMonday(initDate)   → season 1's week-1 Monday
   *   + currentSeason * SEASON_LENGTH_WEEKS weeks → season currentSeason+1
   *
   * The previous implementation walked forward from `new Date()` to the
   * next Wednesday and added seven days. That happens to produce the
   * right answer when the caller runs on the Monday or Tuesday of clock
   * week 1 — which is all it ever did — but it is a function of *when
   * the cron happened to fire*, not of the calendar. Move the cron to a
   * Wednesday, Thursday, Friday, Saturday or Sunday and the anchor
   * silently lands a full week late, pushing the whole season's fixtures
   * out of the season-year.
   *
   * Both `SEASON_LENGTH_WEEKS` values the project has used (16 and 11)
   * are whole numbers of weeks, which is what keeps
   * `computeSeasonWeekOneMonday`-relative arithmetic exact.
   *
   * `initDate` is resolved via `resolveInitDate`, the same helper — and
   * the same `system_config.init_date`-first precedence — that
   * `BootstrapService` uses to anchor season 1. Resolving it from the
   * env var alone would be the bug this method exists to prevent: the
   * two anchors would silently disagree after the first init.
   */
  private calculateNextSeasonStartDate(
    initDate: Date,
    currentSeason: number,
  ): Date {
    const seasonOneMonday = computeSeasonWeekOneMonday(initDate);
    return new Date(
      seasonOneMonday.getTime() +
        currentSeason *
          GAME_SETTINGS.SEASON_LENGTH_WEEKS *
          GAME_SETTINGS.DAYS_PER_WEEK *
          24 *
          60 *
          60 *
          1000,
    );
  }

  /**
   * Standard circle method for the pairings + Thielen
   * CSP for the home/away assignment. Both utilities
   * live in `libs/database/src/services/thielen-ehv.ts`
   * so this method produces the exact same schedule
   * (pairings + HA) as `ScheduleGenerator` in the init
   * path.
   *
   * Two earlier bugs in this method that the shared
   * utility silently fixes:
   *
   *   1. The local `rotateTeams` helper ignored its
   *      `round` argument and only ever rotated by 1,
   *      so every round had the same set of matchups.
   *      The "round-robin" was really a single round
   *      replayed `numRounds` times. `circleMethodPairings`
   *      rotates by `round` per round, the way the
   *      circle method is supposed to.
   *   2. The local `generateRoundMatchups` had no
   *      per-round HA parity rule and just hard-coded
   *      "first team listed is home" — which for the
   *      fixed-team matchup meant T0 was home in every
   //      round, giving T0 a 15-consecutive-home streak
   *      and every other team 3+ streaks from the
   *      cascading imbalance. `thielenEHV` solves the
   *      HA assignment globally and gives every team
   *      max ≤ 2 streak (the same guarantee the init
   *      path has shipped since commit `8baa766`).
   *
   * The `week` field is the 1-indexed schedule week
   * (1..15, day-aligned with
   * `GAME_SETTINGS.SEASON_LENGTH_WEEKS = 16` — the cron
   * layer uses `week === 15` to trigger the playoff).
   * The `round` field is 1 (Wed) or 2 (Sat) within the
   * week.
   *
   * ## The season/week offset is load-bearing — do not "fix" it
   *
   * `computeSeasonWeekOneMonday(initDate)` anchors season 1 one week
   * AFTER `initDate` (it always pushes to the *next* Monday), while
   * `currentSeasonWeek(now, gameStart)` treats `gameStart` = `initDate`
   * itself as season 1 week 1. So the schedule's "week N" lives in the
   * clock's "week N+1", and the two views are one week apart by
   * construction.
   *
   * That offset is what makes the transition crons line up: the last
   * regular match is stamped `week: 15` and falls on the Saturday of
   * calendar day 110, and the Monday that starts the clock's week 16 is
   * day 112 — two days later. The playoff trigger's "is week 15
   * complete?" check therefore passes exactly when it should.
   *
   * Aligning the two anchors would be a behaviour change, not a cleanup.
   */
  private generateDoubleRoundRobin(
    teamIds: string[],
    leagueId: string,
    season: number,
    startDate: Date,
  ): Partial<MatchEntity>[] {
    const numRounds = teamIds.length - 1;

    // Step 1 — pairings + Thielen HA, both from the
    // shared utility so this method can never drift
    // from the init-path schedule shape.
    const pairings = circleMethodPairings(teamIds);
    // Thielen throws for N < 6 (the standard
    // 1-factorization constraints are too tight to
    // admit a max-≤-2 assignment for N=4 and N=5).
    // The scheduler's `generateSeasonSchedule`
    // already throws on `teamIds.length < 4` so the
    // catch is a defensive guard for the N=4 / N=5
    // edge cases the user-facing path never reaches.
    let haMatrix: Map<string, boolean[]>;
    try {
      haMatrix = thielenEHV({ teamIds, pairings });
    } catch (err) {
      this.logger.warn(
        `[SeasonSchedulerService] thielenEHV failed for N=${teamIds.length} ` +
          `(${(err as Error).message}); falling back to per-round parity HA.`,
      );
      haMatrix = perRoundParityHA(pairings, teamIds);
    }

    // ONE date grid for both legs, indexed `0 .. 2·numRounds-1`. Leg 1
    // round r is grid[r]; leg 2 round r is grid[numRounds + r]. This
    // mirrors `ScheduleGenerator`, which generates leg 2 by passing
    // `numRounds + r` into the same `matchStart(round, weekOneMonday)`
    // grid rather than by offsetting a second date list.
    const legDates = this.calculateLegDates(startDate, numRounds);

    // `week` and `round` are both derived from the SAME grid index that
    // produced `scheduledAt`. Keeping them structurally tied like this is
    // the point: the bug this file used to have was a date list and a week
    // stamp computed by two different pieces of arithmetic, which drifted
    // apart silently. See `calculateLegDates`.
    const gridWeek = (i: number) =>
      Math.floor(i / GAME_SETTINGS.ROUNDS_PER_WEEK) + 1;
    const gridRound = (i: number) => (i % GAME_SETTINGS.ROUNDS_PER_WEEK) + 1;

    const matches: Partial<MatchEntity>[] = [];
    // Leg 1
    for (let round = 0; round < numRounds; round++) {
      for (let i = 0; i < pairings[round].length; i++) {
        const [a, b] = pairings[round][i];
        const aHome = haMatrix.get(a)![round];
        const home = aHome ? a : b;
        const away = aHome ? b : a;
        const scheduledAt = legDates[round];
        if (!scheduledAt) {
          // Never silently fall back to another round's date — that
          // masked the indexing bug for the whole first season.
          throw new Error(
            `No kickoff date for round ${round} (league=${leagueId}, numRounds=${numRounds}, ` +
              `legDates.length=${legDates.length}). Refusing to schedule a match with an undefined date.`,
          );
        }
        matches.push({
          leagueId,
          homeTeamId: home,
          awayTeamId: away,
          season,
          week: gridWeek(round),
          round: gridRound(round),
          scheduledAt,
          status: MatchStatus.SCHEDULED,
          type: MatchType.LEAGUE,
          tacticsLocked: false,
          homeForfeit: false,
          awayForfeit: false,
        });
      }
    }

    // Leg 2 — mirror HA. The Thielen CSP assigned HA
    // for leg 1 (rounds 0..N-2); leg 2 is the same
    // pairings with home/away swapped, which is the
    // standard double round-robin contract ("each
    // pair plays once at each venue").
    for (let round = 0; round < numRounds; round++) {
      const gridIndex = numRounds + round;
      for (let i = 0; i < pairings[round].length; i++) {
        const [a, b] = pairings[round][i];
        const aHome = haMatrix.get(a)![round];
        const home = aHome ? b : a;
        const away = aHome ? a : b;
        const scheduledAt = legDates[gridIndex];
        if (!scheduledAt) {
          throw new Error(
            `No kickoff date for second-leg round ${round} (league=${leagueId}, numRounds=${numRounds}, ` +
              `legDates.length=${legDates.length}). Refusing to schedule a match with an undefined date.`,
          );
        }
        matches.push({
          leagueId,
          homeTeamId: home,
          awayTeamId: away,
          season,
          week: gridWeek(gridIndex),
          round: gridRound(gridIndex),
          scheduledAt,
          status: MatchStatus.SCHEDULED,
          type: MatchType.LEAGUE,
          tacticsLocked: false,
          homeForfeit: false,
          awayForfeit: false,
        });
      }
    }

    return matches;
  }

  /**
   * Kickoff dates for the whole season: `2 * numRounds` entries, ONE
   * date per grid slot, on the weekdays in `MATCH_DAY_OFFSETS`
   * (Tue / Thu / Sat at `ROUNDS_PER_WEEK = 3`).
   *
   * ## The invariant
   *
   * For every grid index `i` in `0 .. 2·numRounds-1`:
   *
   *   - `week === floor(i / ROUNDS_PER_WEEK) + 1`
   *   - `round === (i % ROUNDS_PER_WEEK) + 1`
   *   - `scheduledAt` falls inside that calendar week
   *
   * `ScheduleGenerator` (season 1) satisfies this by generating leg 2
   * as `matchStart(numRounds + r, weekOneMonday)` — the same grid,
   * indexed past the first leg. This method used to satisfy none of it.
   *
   * ## What was broken
   *
   * There were two date methods. `calculateSecondLegDates` added a
   * `numRounds * 7` day offset (105 days for a 16-team league) to
   * every first-leg date, while the `week` stamp at the call site was
   * still computed as if the second leg continued on the same grid.
   * The two disagreed for all 15 second-leg rounds, and 13 of them were
   * scheduled *outside the season-year entirely*:
   *
   *   round  dateDay  dateWeek  stampWeek
   *      0      107        16          8
   *      2      114        17          9   <- in season 2
   *     14      156        23         15   <- in season 2
   *
   * Knock-on effect: `areAllWeekMatchesCompleted(season, PLAYOFF_TRIGGER_WEEK)`
   * could never be true when the playoff cron evaluated it, so promotion
   * and relegation via the 9-12 playoff was unreliable from season 2 on.
   *
   * Season 1 looked fine because it goes through `ScheduleGenerator`,
   * which never offset the second leg. That divergence is what let this
   * survive a full season unnoticed — hence the cross-generator assertion
   * in `schedule.generator.spec.ts`.
   *
   * ## Do not "fix" this by re-adding a second-leg offset
   *
   * Offsetting (rather than indexing past the first leg) is what caused
   * the bug. Giving leg 2 round `r` the same date as leg 1 round `r` is
   * the other tempting mistake: that is the same pairing with mirrored
   * home/away on the same day, which double-books the fixture.
   *
   * ## Nothing about the match-week shape is a literal here
   *
   * `ROUNDS_PER_WEEK`, `MATCH_DAY_OFFSETS` and `DAYS_PER_WEEK` all come
   * from `GAME_SETTINGS`. The previous version carried `2` and
   * `[2, 5]` as locals and walked to a hardcoded Wednesday, so moving
   * round 0 to a different weekday would have left the anchor a day out
   * while still compiling.
   */
  private calculateLegDates(startDate: Date, numRounds: number): Date[] {
    const dates: Date[] = [];

    // Anchor on the Monday of the first match-week. Walk forward from
    // `startDate` to the first day of the week carrying round 0 —
    // `MATCH_DAY_OFFSETS[0]` — then step back to that week's Monday, the
    // anchor `ScheduleGenerator.matchStart(round, weekOneMonday)` expects.
    //
    // Written against the constant rather than a literal Wednesday: when
    // round 0 moved from Wednesday to Tuesday, a hardcoded walk would have
    // silently left the anchor a day late and thrown the whole grid off.
    const firstDayOffset = GAME_SETTINGS.MATCH_DAY_OFFSETS[0];
    const firstMatchDay = new Date(startDate);
    firstMatchDay.setUTCHours(GAME_SETTINGS.MATCH_KICKOFF_HOUR_UTC, 0, 0, 0);
    // getUTCDay() is Sun=0; MATCH_DAY_OFFSETS is Mon=0.
    const todayOffset = (firstMatchDay.getUTCDay() + 6) % 7;
    let delta = (firstDayOffset - todayOffset + 7) % 7;
    if (delta === 0 && todayOffset > firstDayOffset) {
      // This week's matchday has already passed — roll forward a week so
      // round 0 is never dated in the past.
      delta = GAME_SETTINGS.DAYS_PER_WEEK;
    }
    firstMatchDay.setTime(firstMatchDay.getTime() + delta * 86_400_000);
    const weekOneMonday = new Date(
      firstMatchDay.getTime() - firstDayOffset * 86_400_000,
    );

    for (let i = 0; i < numRounds * 2; i++) {
      const weekOffset =
        Math.floor(i / GAME_SETTINGS.ROUNDS_PER_WEEK) *
        GAME_SETTINGS.DAYS_PER_WEEK;
      const dayOffset =
        GAME_SETTINGS.MATCH_DAY_OFFSETS[i % GAME_SETTINGS.ROUNDS_PER_WEEK];
      dates.push(
        new Date(
          weekOneMonday.getTime() + (weekOffset + dayOffset) * 86_400_000,
        ),
      );
    }

    return dates;
  }

  async getCurrentSeasonWeek(leagueId: string): Promise<number> {
    const latestMatch = await this.matchRepository.findOne({
      where: { leagueId },
      order: { week: 'DESC' },
      select: ['week'],
    });
    return latestMatch?.week ?? 0;
  }

  async isSeasonScheduleComplete(
    leagueId: string,
    season: number,
    maxTeams: number = 16,
  ): Promise<boolean> {
    const matchCount = await this.matchRepository.count({
      where: { leagueId, season },
    });
    const expectedMatchCount = maxTeams * (maxTeams - 1);
    return matchCount >= expectedMatchCount;
  }

  async getTeamMatchesPlayed(teamId: string, season: number): Promise<number> {
    const homeMatches = await this.matchRepository.count({
      where: { homeTeamId: teamId, season, status: MatchStatus.COMPLETED },
    });
    const awayMatches = await this.matchRepository.count({
      where: { awayTeamId: teamId, season, status: MatchStatus.COMPLETED },
    });
    return homeMatches + awayMatches;
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
