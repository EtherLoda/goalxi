import { Injectable, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  GAME_SETTINGS,
  LeagueEntity,
  LeagueStandingEntity,
  MatchEntity,
  MatchStatus,
  MatchType,
  circleMethodPairings,
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
    const startDate = this.calculateNextSeasonStartDate();

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
   * The new season starts on the next Wednesday at
   * `GAME_SETTINGS.MATCH_KICKOFF_HOUR_UTC` (currently
   * 6:00 UTC), at least 7 days after the playoff completes.
   * The historical implementation used a local-time
   * `setHours(13, ...)` which mismatched both the
   * regular-season kickoff hour and the rest of the
   * codebase that anchors on the `MATCH_KICKOFF_HOUR_UTC`
   * constant.
   */
  private calculateNextSeasonStartDate(): Date {
    const now = new Date();
    const dayOfWeek = now.getUTCDay();

    // Days until the *next* Wednesday (UTC).
    // Mon (1) → 2, Tue (2) → 1, Wed (3) → 7 (push a full
    // week, never "today"), Thu (4) → 6, ... Sun (0) → 3.
    const rawDaysToWed = (3 - dayOfWeek + 7) % 7;
    const daysToWednesday = rawDaysToWed === 0 ? 7 : rawDaysToWed;

    const nextSeasonStart = new Date(now);
    nextSeasonStart.setUTCDate(now.getUTCDate() + daysToWednesday + 7);
    nextSeasonStart.setUTCHours(GAME_SETTINGS.MATCH_KICKOFF_HOUR_UTC, 0, 0, 0);

    return nextSeasonStart;
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
   * week. The second leg's kickoff is offset by
   * `numRounds` weeks so the same pair doesn't play
   * twice on the same day.
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

    const firstLegDates = this.calculateFirstLegDates(startDate, numRounds);
    const secondLegDates = this.calculateSecondLegDates(startDate, numRounds);

    const matches: Partial<MatchEntity>[] = [];
    // Leg 1
    for (let round = 0; round < numRounds; round++) {
      for (let i = 0; i < pairings[round].length; i++) {
        const [a, b] = pairings[round][i];
        const aHome = haMatrix.get(a)![round];
        const home = aHome ? a : b;
        const away = aHome ? b : a;
        const scheduledAt = firstLegDates[round];
        if (!scheduledAt) {
          // Never silently fall back to another round's date — that
          // masked the indexing bug for the whole first season.
          throw new Error(
            `No kickoff date for round ${round} (league=${leagueId}, numRounds=${numRounds}, ` +
              `firstLegDates.length=${firstLegDates.length}). Refusing to schedule a match with an undefined date.`,
          );
        }
        matches.push({
          leagueId,
          homeTeamId: home,
          awayTeamId: away,
          season,
          week: Math.floor(round / 2) + 1,
          round: (round % 2) + 1,
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
      for (let i = 0; i < pairings[round].length; i++) {
        const [a, b] = pairings[round][i];
        const aHome = haMatrix.get(a)![round];
        const home = aHome ? b : a;
        const away = aHome ? a : b;
        const scheduledAt = secondLegDates[round];
        if (!scheduledAt) {
          throw new Error(
            `No kickoff date for second-leg round ${round} (league=${leagueId}, numRounds=${numRounds}, ` +
              `secondLegDates.length=${secondLegDates.length}). Refusing to schedule a match with an undefined date.`,
          );
        }
        matches.push({
          leagueId,
          homeTeamId: home,
          awayTeamId: away,
          season,
          week: Math.floor((numRounds + round) / 2) + 1,
          round: ((numRounds + round) % 2) + 1,
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
 * Kickoff date for each round: `numRounds` entries, ONE date per
 * round, alternating Wednesday / Saturday.
 *
 * Mirrors `ScheduleGenerator.matchStart` (season 1), which puts even
 * rounds on the Wednesday and odd rounds on the Saturday of
 * `floor(round/2)`-th week. Two rounds per week × 15 rounds = 8
 * match-weeks, which lines up with `week: Math.floor(round/2) + 1`.
 *
 * The previous version pushed BOTH `wed` and `sat` per iteration,
 * producing `2 * numRounds` entries — and the caller then indexed
 * `dates[round * 2 + i]` where `i` was the index of the match WITHIN
 * the round (0..7 for a 16-team league). So:
 *
 *   - round 0's 8 matches were spread across `dates[0..7]`, i.e.
 *     Wed r0, Sat r0, Wed r1, Sat r1, Wed r2, Sat r2, Wed r3, Sat r3
 *     — one matchday scattered across four calendar weeks;
 *   - by round 7 the index reached 21, and by round 14 it reached 35
 *     against an array of length 30, so six of the eight matches fell
 *     to a `??` fallback and shared one timestamp;
 *   - the second leg (rounds 15-29) indexed up to 88 and collapsed
 *     almost entirely onto the fallback date.
 *
 * This only ever ran from season 2 onward (season 1 goes through
 * `ScheduleGenerator`, which uses `matchStart` correctly), which is
 * why the game looked fine through season 1 and then produced a
 * broken fixture list.
 */
private calculateFirstLegDates(startDate: Date, numRounds: number): Date[] {
    const dates: Date[] = [];

    // Anchor on the Monday of the first match-week. Walk forward from
    // `startDate` to the first Wednesday at or after it (UTC), then step
    // back two days to that week's Monday — the anchor
    // `ScheduleGenerator.matchStart(round, weekOneMonday)` expects.
    const firstWednesday = new Date(startDate);
    firstWednesday.setUTCHours(
      GAME_SETTINGS.MATCH_KICKOFF_HOUR_UTC,
      0,
      0,
      0,
    );
    while (firstWednesday.getUTCDay() !== 3) {
      firstWednesday.setTime(firstWednesday.getTime() + 24 * 60 * 60 * 1000);
    }
    const weekOneMonday = new Date(
      firstWednesday.getTime() - 2 * 24 * 60 * 60 * 1000,
    );

    for (let round = 0; round < numRounds; round++) {
      // Two rounds per match-week: even → Wednesday, odd → Saturday.
      // Monday=0, Wednesday=+2 days, Saturday=+5 days.
      const weekOffset = Math.floor(round / 2) * 7;
      const dayOffset = round % 2 === 0 ? 2 : 5;
      dates.push(
        new Date(
          weekOneMonday.getTime() + (weekOffset + dayOffset) * 24 * 60 * 60 * 1000,
        ),
      );
    }

    return dates;
  }

  /**
   * Second-leg kickoff dates: identical pattern to the
   * first leg but offset by `numRounds` weeks so the
   * first kickoff of the second leg lands ≥ numRounds
   * weeks after the first leg's first kickoff. The old
   * implementation reused `firstLegDates[round * 2..]`
   * and produced same-day duplicates.
   */
  private calculateSecondLegDates(startDate: Date, numRounds: number): Date[] {
    const offsetMs = numRounds * 7 * 24 * 60 * 60 * 1000;
    const firstLeg = this.calculateFirstLegDates(startDate, numRounds);
    return firstLeg.map((d) => new Date(d.getTime() + offsetMs));
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
