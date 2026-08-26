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
   */
  async generateNextSeasonSchedule(
    currentSeason: number,
  ): Promise<MatchEntity[]> {
    const nextSeason = currentSeason + 1;

    const leagues = await this.leagueRepository.find();
    const startDate = this.calculateNextSeasonStartDate();

    const allMatches: MatchEntity[] = [];

    for (const league of leagues) {
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
      `Generated ${allMatches.length} matches for Season ${nextSeason}`,
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
        const scheduledAt =
          firstLegDates[round * 2 + i] ?? firstLegDates[round * 2];
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
        const scheduledAt =
          secondLegDates[round * 2 + i] ?? secondLegDates[round * 2];
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
   * First-leg kickoff dates: `numRounds` weeks of
   * Wed + Sat, starting from the next Wednesday on or
   * after `startDate`. All at
   * `GAME_SETTINGS.MATCH_KICKOFF_HOUR_UTC` UTC.
   */
  private calculateFirstLegDates(startDate: Date, numRounds: number): Date[] {
    const dates: Date[] = [];
    // Walk forward to the first Wednesday at or after
    // startDate (UTC).
    let cursor = new Date(startDate);
    cursor.setUTCHours(GAME_SETTINGS.MATCH_KICKOFF_HOUR_UTC, 0, 0, 0);
    while (cursor.getUTCDay() !== 3) {
      cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    }

    for (let round = 0; round < numRounds; round++) {
      // Wed (cursor is currently Wed) + Sat (cursor + 3d).
      const wed = new Date(cursor.getTime());
      const sat = new Date(cursor.getTime() + 3 * 24 * 60 * 60 * 1000);
      dates.push(wed, sat);
      // Next week's Wednesday is +7 days.
      cursor = new Date(cursor.getTime() + 7 * 24 * 60 * 60 * 1000);
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
