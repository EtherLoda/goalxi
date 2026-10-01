import {
  calculateMatchAttendance,
  FanEntity,
  FINANCE_CONSTANTS,
  InjuryEntity,
  LeagueStandingEntity,
  MatchEntity,
  MatchEventEntity,
  MatchStatus,
  MatchTacticsEntity,
  MatchType,
  PlayerEntity,
  StadiumEntity,
  TeamEntity,
  TICKET_PRICE_MULTIPLIER,
  TransactionType,
  tryParsePlayerId,
  Uuid,
} from '@goalxi/database';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  In,
  IsNull,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { FanService } from '../fan/fan.service';
import { FinanceService } from '../finance/finance.service';
import { MatchCacheService } from './match-cache.service';

@Injectable()
export class MatchCompletionService {
  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    @InjectRepository(MatchEntity)
    private matchRepository: Repository<MatchEntity>,
    @InjectRepository(LeagueStandingEntity)
    private standingRepository: Repository<LeagueStandingEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(PlayerEntity)
    private playerRepository: Repository<PlayerEntity>,
    @InjectRepository(MatchEventEntity)
    private eventRepository: Repository<MatchEventEntity>,
    @InjectRepository(MatchTacticsEntity)
    private tacticsRepository: Repository<MatchTacticsEntity>,
    @InjectRepository(TeamEntity)
    private teamRepository: Repository<TeamEntity>,
    @InjectRepository(StadiumEntity)
    private stadiumRepository: Repository<StadiumEntity>,
    @InjectRepository(FanEntity)
    private fanRepository: Repository<FanEntity>,
    @InjectRepository(InjuryEntity)
    private injuryRepository: Repository<InjuryEntity>,
    private matchCacheService: MatchCacheService,
    private financeService: FinanceService,
    private fanService: FanService,
  ) {}

  async completeMatch(matchId: string): Promise<void> {
    this.logger.info(`Completing match ${matchId}...`);

    // Fast-path dedup: a Redis key with a 24h TTL, checked BEFORE the DB
    // read so a burst of duplicate deliveries costs one cache hit.
    const isProcessed = await this.matchCacheService.isMatchProcessed(matchId);
    if (isProcessed) {
      this.logger.warn(
        `Match ${matchId} statistics already processed. Skipping duplicated job.`,
      );
      return;
    }

    const match = await this.matchRepository.findOne({
      where: { id: matchId },
      relations: ['homeTeam', 'awayTeam', 'league'],
    });

    if (!match) {
      this.logger.error(`Match ${matchId} not found for completion`);
      return;
    }

    // Durable dedup: `settled_at` is the settlement receipt, and unlike
    // the Redis key it does not expire. Without this, any delivery
    // arriving more than 24h after settlement (a stalled BullMQ job, a
    // manual replay, a second reconciliation pass) re-applied standings,
    // ELO, match minutes, fan emotion and ticket revenue.
    if (match.settledAt) {
      this.logger.warn(
        `Match ${matchId} already settled at ${match.settledAt.toISOString()}. Skipping duplicated job.`,
      );
      return;
    }

    // 1. Update Match status (only if not already updated by scheduler)
    if (match.status !== MatchStatus.COMPLETED) {
      match.status = MatchStatus.COMPLETED;
      match.completedAt = match.completedAt || new Date();
      await this.matchRepository.save(match);
    }

    // 2. Update League Standings
    await this.updateLeagueStandings(match);

    // 3. Player careerStats (matches / goals / assists / yellows / reds)
    //    are written by the SIMULATOR, not here. The simulator runs
    //    earlier in the same match lifecycle and already wrote the
    //    correct values inside its simulation transaction. Writing
    //    them a second time was the root cause of every career
    //    counter doubling after each match (see the player-loop
    //    block in simulation.processor.ts for the canonical path).

    // 3.5. Add match minutes to players for condition/form calculation
    //     Pass the match entity so we can read firstHalfInjuryTime /
    //     secondHalfInjuryTime / hasExtraTime / extraTime*Injury and credit
    //     stoppage time (without it, a player who sees out the 90+3
    //     gets 90 minutes instead of 93).
    await this.addMatchMinutes(match);

    // 4. Update ELO ratings
    await this.updateEloRatings(match);

    // 5. Update Fan Morale and Calculate Revenue
    await this.updateFanAndRevenue(match);

    // 6. Instant injury recovery for bot players
    await this.recoverBotPlayerInjuries(match);

    // 7. Stamp the durable settlement receipt LAST, after every mutation
    //    above has committed.
    //
    //    Order matters: if any step above throws, we never reach this
    //    line, so `settled_at` stays null and
    //    `MatchSchedulerService.reconcileUnsettledMatches` re-enqueues
    //    the match on a later sweep. Stamping first would mark a
    //    partially-settled match as done and strand it permanently.
    //
    //    The Redis key below is a fast path, not the record of truth —
    //    it expires after 24h, at which point a late duplicate delivery
    //    could re-apply standings / ELO / minutes / revenue without this
    //    column to stop it.
    await this.matchRepository.update(
      { id: matchId },
      { settledAt: new Date() },
    );

    // 8. Mark as processed in cache (fast-path dedup within the TTL)
    await this.matchCacheService.setMatchProcessed(matchId);

    // 9. Invalidate Cache
    await this.matchCacheService.invalidateMatchCache(matchId);

    this.logger.info(`Match ${matchId} completion processing finished.`);
  }

  private async updateLeagueStandings(match: MatchEntity): Promise<void> {
    const { leagueId, season, homeTeamId, awayTeamId, homeScore, awayScore } =
      match;

    if (homeScore === undefined || awayScore === undefined) {
      this.logger.error(
        `Cannot update standings for match ${match.id}: Score is undefined`,
      );
      return;
    }

    // [Fix 2026-08-23] League standings are scoped to a single
    // league. Cup / youth / friendly / national-team matches
    // have null leagueId (cup-scheduler.service.ts and the
    // youth match generator both stamp `leagueId: null`).
    // Without this guard, the getOrCreateStanding path below
    // created a phantom `league_standing` row with
    // `leagueId = null` for every non-league match, polluting
    // the table with dead rows the FE never queries. ELO,
    // fan/revenue, and player stats are NOT gated here —
    // they apply to every match type.
    if (!leagueId) {
      this.logger.debug(
        `Skipping league_standings update for non-league match ${match.id} (type=${match.type})`,
      );
      return;
    }

    // Playoff matches carry a NON-null `leagueId` — `playoff.service.ts`
    // stamps `leagueId = homeLeagueId` (the upper league) and parks the
    // lower league's id in `lowerLeagueId`. So the `!leagueId` guard above
    // does NOT catch them, and the `getOrCreateStanding` call below would
    // INSERT a phantom `league_standing` row into the *upper* league for a
    // team that belongs to a different league. The phantom row then gets
    // ranked by `recalculateLeaguePositions` and displaces a real team in
    // the table — and could even outrank the champion, at which point
    // `promotion-relegation.service.ts` would pick it for promotion.
    //
    // Playoffs decide promotion via `swapTeamLeague` in
    // `SeasonTransitionService.processAfterPlayoffsComplete`, never via
    // league standings, so there is nothing legitimate to record here.
    //
    // (This bug was masked while the playoff cron could never fire — the
    // gate was `week === 15` evaluated on the Monday that week 15
    // *began*, so no playoff was ever generated. Both are fixed together.)
    if (match.type === MatchType.PLAYOFF) {
      this.logger.debug(
        `Skipping league_standings update for playoff match ${match.id}`,
      );
      return;
    }

    // Atomic read-modify-write with row locks.
    //
    // The previous shape was `findOne` -> mutate in JS -> `save()` with
    // no transaction, no row lock, and no version column: a textbook lost
    // update. Two matches for the same team completing concurrently (a
    // Saturday double-matchweek is explicitly supported — see
    // `match.entity.ts`'s "Round within the week (1 or 2 for double
    // matchweeks)") both read the same row and the second write clobbers
    // the first's `points += 3`.
    //
    // Nothing enforced single-threadedness either: the completion worker
    // merely happened to be registered with BullMQ's default concurrency
    // of 1, which is an accident of configuration rather than a contract.
    // Raising that concurrency — the obvious fix for throughput — would
    // have silently corrupted the table.
    //
    // `pessimistic_write` issues `SELECT ... FOR UPDATE` on the two rows
    // for the duration of the transaction. This is the same primitive
    // `libs/database/src/services/onboarding-assigner.ts` uses for the
    // same class of read-modify-write.
    await this.dataSource.transaction(async (manager) => {
      // Read (or create) both rows under the lock. NOT `Promise.all`:
      // two `FOR UPDATE` statements issued concurrently on the same
      // transaction can deadlock, and there is nothing to gain — these
      // are two indexed single-row lookups.
      const homeStanding = await this.getOrCreateStanding(
        manager,
        leagueId,
        homeTeamId,
        season,
      );
      const awayStanding = await this.getOrCreateStanding(
        manager,
        leagueId,
        awayTeamId,
        season,
      );

      homeStanding.goalsFor += homeScore;
      homeStanding.goalsAgainst += awayScore;

      awayStanding.goalsFor += awayScore;
      awayStanding.goalsAgainst += homeScore;

      // Maintain goalDifference on the row. `season-archive.service.ts`
      // copies this column straight into
      // `archived_season_result.goalDifference`, so a stale 0 would
      // corrupt every team's end-of-season history.
      //
      // NOTE: this is a DERIVED column. The canonical sort key is the
      // computed expression, not this column — see `STANDINGS_SORT_SQL`.
      homeStanding.goalDifference =
        homeStanding.goalsFor - homeStanding.goalsAgainst;
      awayStanding.goalDifference =
        awayStanding.goalsFor - awayStanding.goalsAgainst;

      // `played` drives the FE scoreboard, so it must be incremented for
      // every match regardless of outcome. The win/draw/loss branch below
      // is points/W/D/L bookkeeping only.
      homeStanding.played += 1;
      awayStanding.played += 1;

      if (homeScore > awayScore) {
        homeStanding.wins += 1;
        homeStanding.points += 3;
        awayStanding.losses += 1;
      } else if (homeScore < awayScore) {
        awayStanding.wins += 1;
        awayStanding.points += 3;
        homeStanding.losses += 1;
      } else {
        homeStanding.draws += 1;
        homeStanding.points += 1;
        awayStanding.draws += 1;
        awayStanding.points += 1;
      }

      await manager
        .getRepository(LeagueStandingEntity)
        .save([homeStanding, awayStanding]);

      // Re-derive positions for the whole league inside the SAME
      // transaction, so direct DB readers (`season-archive.service.ts`
      // copies `standing.position` into `SeasonResult.finalPosition`;
      // `promotion-relegation.service.ts` and `playoff.service.ts`
      // select by exact `position === N`) never observe a stale rank
      // relative to the counters they are reading.
      await this.recalculateLeaguePositions(manager, leagueId, season);
    });
  }

  /**
   * Renumber positions 1..N for every team in the league so direct DB
   * readers see a consistent rank.
   *
   * ## Determinism
   *
   * The sort key is the shared `STANDINGS_SORT_SQL`, identical to the
   * public standings endpoint's. It previously stopped at three keys
   * (points, GD, GF), so two teams tied on all three received an
   * ARBITRARY rank from Postgres heap order — and since promotion,
   * relegation, playoff qualification and prize money all select by
   * exact `position === N`, a tie silently decided who was promoted and
   * who was paid. Keys 4-6 make the rank reproducible.
   *
   * ## Cost
   *
   * This runs after EVERY completed match, and it used to `save()` all N
   * rows unconditionally — and TypeORM's `save(array)` emits one UPDATE
   * per entity writing every column. At 85 leagues × 240 matches that is
   * ~326k full-row UPDATEs per season purely renumbering, on the
   * single-threaded completion worker. Worse, writing every column
   * clobbered a `goals_for` that a concurrently-completing match had just
   * incremented, using the value read a moment earlier.
   *
   * Now only rows whose position actually changed are written, with an
   * explicit column list. In the common case (the two teams that just
   * played moved, the rest did not) that is 2-3 rows instead of 16.
   */
  private async recalculateLeaguePositions(
    manager: EntityManager,
    leagueId: string,
    season: number,
  ): Promise<void> {
    const rows = await manager
      .getRepository(LeagueStandingEntity)
      .createQueryBuilder('s')
      .where('s.leagueId = :leagueId', { leagueId })
      .andWhere('s.season = :season', { season })
      .orderBy('s.points', 'DESC')
      .addOrderBy('s.goalsFor - s.goalsAgainst', 'DESC')
      .addOrderBy('s.goalsFor', 'DESC')
      // Deterministic tie-breaks — see STANDINGS_SORT_SQL.
      .addOrderBy('s.wins', 'DESC')
      .addOrderBy('s.goalsAgainst', 'ASC')
      .addOrderBy('s.teamId', 'ASC')
      .getMany();

    const moved: LeagueStandingEntity[] = [];
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].position !== i + 1) {
        rows[i].position = i + 1;
        moved.push(rows[i]);
      }
    }

    if (moved.length === 0) {
      return;
    }

    // Write ONLY the `position` column, via a single CASE expression.
    //
    // `save(moved)` would emit one UPDATE per row and write EVERY column
    // of each — which is precisely how the old version clobbered a
    // `goals_for` that a concurrently-completing match had just
    // incremented, using the value read a moment earlier. A
    // column-scoped UPDATE cannot touch anything else.
    const params: Record<string, unknown> = {};
    const cases = moved
      .map((r, i) => {
        params[`id${i}`] = r.id;
        params[`pos${i}`] = r.position;
        return `WHEN id = :id${i} THEN :pos${i}`;
      })
      .join(' ');

    await manager
      .createQueryBuilder()
      .update(LeagueStandingEntity)
      .set({ position: () => `CASE ${cases} ELSE "position" END` })
      .where(moved.map((_, i) => `id = :id${i}`).join(' OR '), params)
      .execute();

    this.logger.debug(
      `[MatchCompletion] Renumbered ${moved.length}/${rows.length} standing(s) for league ${leagueId} season ${season}`,
    );
  }

  /**
   * Load a team's standing row for the season, creating a zeroed row if
   * it doesn't exist yet.
   *
   * Runs on the transaction's manager with `pessimistic_write` so a
   * concurrent completion for the same team serialises here rather than
   * reading a value that is about to change. See
   * `updateLeagueStandings` for why that matters.
   */
  private async getOrCreateStanding(
    manager: EntityManager,
    leagueId: string,
    teamId: string,
    season: number,
  ): Promise<LeagueStandingEntity> {
    const repo = manager.getRepository(LeagueStandingEntity);
    let standing = await repo.findOne({
      where: { leagueId, teamId, season },
      lock: { mode: 'pessimistic_write' },
    });

    if (!standing) {
      standing = new LeagueStandingEntity();
      standing.leagueId = leagueId;
      standing.teamId = teamId;
      standing.season = season;
      standing.position = 0; // Renumbered by recalculateLeaguePositions.
      standing.points = 0;
      standing.wins = 0;
      standing.draws = 0;
      standing.losses = 0;
      standing.goalsFor = 0;
      standing.goalsAgainst = 0;
    }

    return standing;
  }

  /**
   * Add match minutes to players for condition/form calculation.
   * Accumulates minutes played since last condition update.
   *
   * For each player we compute minutes as (exit minute) - (entry minute).
   * The exit minute is whichever fires first:
   *   1. substitution off (a sub event for this player)
   *   2. red card (a red_card event for this player; engine emits
   *      these on direct reds AND on second yellows - see
   *      match.engine.ts:2814-2855)
   *   3. full-time, including stoppage time
   *
   * The previous implementation had two bugs that this version fixes:
   *   - A starter with a straight red card (no sub event) was
   *     credited with the full 90 minutes because the heuristic
   *     `subOutMinute ?? 90` had no fallback for the send-off
   *     case. With stoppage time this was off by
   *     `90 + secondHalfInjuryTime - redCardMinute` minutes for
   *     every dismissed starter.
   *   - Stoppage time was dropped entirely: a player who saw out
   *     the 90+3 was credited 90 minutes, not 93. ET matches were
   *     off by even more - a 120+2 ET match counted as 120.
   *
   * The fix reads firstHalfInjuryTime / secondHalfInjuryTime /
   * extraTimeSecondHalfInjury off the MatchEntity (populated by
   * the simulator's RFC injury-time-2026 work) and uses the
   * engine-derived finalMinute (90 + 2H injury, or 120 + ET 2H
   * injury when hasExtraTime is true) as the full-time fallback.
   *
   * Note: a substitution off and a red card are mutually
   * exclusive for a given player (a subbed-off player is no
   * longer on the pitch to receive a card), so a plain `??`
   * chain is correct here - we never need
   * `Math.min(subOutMinute, sentOffMinute)`.
   */
  private async addMatchMinutes(match: MatchEntity): Promise<void> {
    const matchId = match.id;
    // Engine-derived final minute: 90 + second-half injury for a
    // regulation match, 120 + extra-time 2H injury for ET. Falls
    // back to 90 / 120 if the simulator didn't write the field
    // (legacy rows / pre-RFC matches).
    const finalMinute = match.hasExtraTime
      ? 120 + (match.extraTimeSecondHalfInjury ?? 0)
      : 90 + (match.secondHalfInjuryTime ?? 0);

    const events = await this.eventRepository.find({
      where: { matchId },
    });

    // playerId -> minute they left the pitch
    //   subOut: explicit substitution (the `playerId` field on a
    //     substitution event is the player coming OFF)
    //   sentOff: red_card event; covers both direct reds and
    //     second-yellow reds (the engine emits a single
    //     type='red_card' event for either case)
    const substitutedOut = new Map<number, number>();
    const substitutedIn = new Map<number, number>();
    const sentOff = new Map<number, number>();

    for (const event of events) {
      const type = (event.typeName || '').toLowerCase();
      if (type === 'substitution') {
        const data = event.data as any;
        if (data?.playerId) {
          substitutedOut.set(data.playerId, event.minute);
        }
        if (data?.substitutedPlayerId) {
          substitutedIn.set(data.substitutedPlayerId, event.minute);
        }
      } else if (type === 'red_card') {
        if (event.playerId) {
          sentOff.set(event.playerId, event.minute);
        }
      }
    }

    const tactics = await this.tacticsRepository.find({ where: { matchId } });

    // Per-team rollup of (playerId -> { teamId, minutesPlayed }).
    // The same player shouldn't appear on both sides, but we keep
    // the existing `existing.minutes += ...` shape in case a
    // shared youth / national-team match ever surfaces them on
    // both rosters (defensive).
    const playerMinutes = new Map<
      number,
      { teamId: string; minutes: number }
    >();

    const record = (playerId: number, teamId: string, minutes: number) => {
      if (minutes <= 0) return;
      const existing = playerMinutes.get(playerId);
      if (existing) {
        existing.minutes += minutes;
      } else {
        playerMinutes.set(playerId, { teamId, minutes });
      }
    };

    for (const t of tactics) {
      const teamId = t.teamId;
      // Read the int-keyed v2 columns - the legacy `lineup` /
      // `substitutions` jsonb were wiped by the player.id
      // uuid->int migration (MatchTacticsEntity docstring).
      const starterIds = Object.values(t.lineupV2 ?? {})
        .map((id) => tryParsePlayerId(id))
        .filter((id): id is number => id !== null);

      for (const playerId of starterIds) {
        const exitMinute =
          substitutedOut.get(playerId) ?? sentOff.get(playerId) ?? finalMinute;
        record(playerId, teamId, exitMinute);
      }

      for (const sub of t.substitutionsV2 ?? []) {
        const inId = tryParsePlayerId(sub.in);
        if (inId === null) continue;
        const subInMinute = substitutedIn.get(inId);
        if (subInMinute === undefined) continue;
        const exitMinute =
          substitutedOut.get(inId) ?? sentOff.get(inId) ?? finalMinute;
        record(inId, teamId, exitMinute - subInMinute);
      }
    }

    for (const [playerId, data] of playerMinutes) {
      await this.playerRepository.increment(
        { id: playerId as any },
        'matchMinutes',
        data.minutes,
      );
    }

    this.logger.debug(
      `[MatchCompletion] Added match minutes for ${playerMinutes.size} players in match ${matchId} (finalMinute=${finalMinute})`,
    );
  }

  /**
   * Update ELO ratings after match
   */
  private async updateEloRatings(match: MatchEntity): Promise<void> {
    if (
      !match.homeTeam ||
      !match.awayTeam ||
      match.homeScore === undefined ||
      match.awayScore === undefined
    ) {
      return;
    }

    const homeElo = match.homeTeam.eloRating || 1500;
    const awayElo = match.awayTeam.eloRating || 1500;
    const K = 32;

    // Expected score
    const expectedHome = 1 / (1 + Math.pow(10, (awayElo - homeElo) / 400));
    const expectedAway = 1 - expectedHome;

    // Actual score
    const actualHome =
      match.homeScore > match.awayScore
        ? 1
        : match.homeScore < match.awayScore
          ? 0
          : 0.5;
    const actualAway = 1 - actualHome;

    // Update ELO
    const newHomeElo = homeElo + K * (actualHome - expectedHome);
    const newAwayElo = awayElo + K * (actualAway - expectedAway);

    await this.teamRepository.update(
      { id: match.homeTeamId as Uuid },
      { eloRating: Math.round(newHomeElo) },
    );
    await this.teamRepository.update(
      { id: match.awayTeamId as Uuid },
      { eloRating: Math.round(newAwayElo) },
    );

    this.logger.debug(
      `ELO update: ${match.homeTeam.name} ${homeElo} -> ${Math.round(newHomeElo)}, ` +
        `${match.awayTeam.name} ${awayElo} -> ${Math.round(newAwayElo)}`,
    );
  }

  /**
   * Update fan morale and calculate stadium revenue
   */
  private async updateFanAndRevenue(match: MatchEntity): Promise<void> {
    if (
      !match.homeTeam ||
      !match.awayTeam ||
      match.homeScore === undefined ||
      match.awayScore === undefined
    ) {
      return;
    }

    const tier = match.league?.tier || 4;
    const homeElo = match.homeTeam.eloRating || 1500;
    const awayElo = match.awayTeam.eloRating || 1500;

    // Get expected points for home team
    const homeExpected = this.fanService.getExpectedPoints(homeElo, awayElo);
    const awayExpected = this.fanService.getExpectedPoints(awayElo, homeElo);

    // Determine results
    const homeResult: 'W' | 'D' | 'L' =
      match.homeScore > match.awayScore
        ? 'W'
        : match.homeScore < match.awayScore
          ? 'L'
          : 'D';
    const awayResult: 'W' | 'D' | 'L' =
      homeResult === 'W' ? 'L' : homeResult === 'L' ? 'W' : 'D';

    // Calculate actual points
    const homeActualPoints =
      homeResult === 'W' ? 3 : homeResult === 'D' ? 1 : 0;
    const awayActualPoints =
      awayResult === 'W' ? 3 : awayResult === 'D' ? 1 : 0;

    // Update fan morale
    await this.fanService.updateAfterMatch(
      match.homeTeamId,
      homeActualPoints,
      homeExpected,
      homeResult,
    );
    await this.fanService.updateAfterMatch(
      match.awayTeamId,
      awayActualPoints,
      awayExpected,
      awayResult,
    );

    // Calculate and record stadium revenue
    await this.calculateStadiumRevenue(match, tier);
  }

  /**
   * Calculate and record stadium revenue
   */
  private async calculateStadiumRevenue(
    match: MatchEntity,
    tier: number,
  ): Promise<void> {
    const homeStadium = await this.stadiumRepository.findOne({
      where: { teamId: match.homeTeamId },
    });
    const homeFan = await this.fanRepository.findOne({
      where: { teamId: match.homeTeamId },
    });
    const awayFan = await this.fanRepository.findOne({
      where: { teamId: match.awayTeamId },
    });

    if (!homeStadium?.isBuilt || !homeFan) {
      return;
    }

    const homeFans = homeFan.totalFans;
    const awayFans = awayFan?.totalFans || 0;

    const homeMorale = homeFan.fanEmotion;
    const awayMorale = awayFan?.fanEmotion || 50;

    // Calculate attendance. The result is the single source of truth
    // for both the per-match revenue transaction AND the denormalised
    // `match.attendance` column consumed by the Stadium page's
    // season-average and the simulator's pre-sim emission
    // (see MatchEngine / `attendance_announcement` event).
    const totalAttendance = calculateMatchAttendance(
      homeFans,
      awayFans,
      homeMorale,
      awayMorale,
      homeStadium.capacity,
      tier,
    );

    // Persist the attendance figure onto the match row FIRST. The
    // finance transaction below is a separate dataSource.transaction
    // (see FinanceService.processTransaction) — we intentionally do not
    // widen that transaction to cover this save because the two writes
    // are independently safe to retry:
    //   - This save is idempotent: re-running the same inputs produces
    //     the same `totalAttendance` (the ±5% fluctuation is the only
    //     source of non-determinism, and overwriting with a new draw is
    //     acceptable for a stat column).
    //   - The cache guard `isMatchProcessed` in `completeMatch` means a
    //     duplicate job is short-circuited at the entry; we only get
    //     here once per (match, attempt) pair.
    //   - If the finance transaction below fails, the thrown error
    //     bubbles up and BullMQ retries the job; on the next attempt
    //     the attendance is recomputed and overwritten with a fresh
    //     draw, so we never persist a stale number paired with a
    //     newer revenue record.
    match.attendance = totalAttendance;
    await this.matchRepository.save(match);

    // Calculate revenue
    // `FINANCE_CONSTANTS.TICKET_PRICE` is the single source of truth
    // shared with `stadium.service.getSummary` (preview number) and
    // any other call site that needs the per-seat price. The
    // league-tier multiplier (`TICKET_PRICE_MULTIPLIER`) is *not*
    // applied on the Stadium page because there we want the
    // worst-case baseline; it's only applied here where the actual
    // income for the *home team's* league tier matters.
    const baseTicketPrice = FINANCE_CONSTANTS.TICKET_PRICE;
    const tierMultiplier =
      TICKET_PRICE_MULTIPLIER[tier as keyof typeof TICKET_PRICE_MULTIPLIER] ||
      1.0;
    const ticketRevenue = Math.round(
      totalAttendance * baseTicketPrice * tierMultiplier,
    );

    // Record ticket revenue
    await this.financeService.processTransaction(
      match.homeTeamId as Uuid,
      ticketRevenue,
      TransactionType.TICKET_INCOME,
      match.season,
      match.week,
      `Match ticket revenue (${totalAttendance} attendance)`,
      match.id,
    );

    this.logger.debug(
      `Stadium revenue for ${match.homeTeam?.name}: ${totalAttendance} total fans = ${ticketRevenue} (tier ${tier})`,
    );
  }

  /**
   * Instantly recover injuries for bot team players after match ends
   * Bot players should not suffer from lingering injuries
   */
  private async recoverBotPlayerInjuries(match: MatchEntity): Promise<void> {
    const botTeamIds: string[] = [];

    // Check if home team is a bot
    if (match.homeTeam?.isBot) {
      botTeamIds.push(match.homeTeamId as string);
    }
    // Check if away team is a bot
    if (match.awayTeam?.isBot) {
      botTeamIds.push(match.awayTeamId as string);
    }

    if (botTeamIds.length === 0) {
      return;
    }

    this.logger.debug(
      `[MatchCompletion] Recovering injuries for bot teams: ${botTeamIds.join(', ')}`,
    );

    // Find all bot players with active injuries
    const botPlayersWithInjuries = await this.playerRepository.find({
      where: {
        teamId: In(botTeamIds as any[]),
        currentInjuryValue: MoreThanOrEqual(1),
      },
    });

    if (botPlayersWithInjuries.length === 0) {
      return;
    }

    this.logger.log(
      `[MatchCompletion] Found ${botPlayersWithInjuries.length} bot player(s) with active injuries to recover`,
    );

    const playersToSave: PlayerEntity[] = [];
    const playerIds = botPlayersWithInjuries.map((p) => p.id);

    // Mark all active injuries as recovered. Active = no recoveredAt
    // timestamp yet (the legacy `is_recovered` boolean was removed in
    // 1726000000000-DropInjuryRedundantColumns).
    const activeInjuries = await this.injuryRepository.find({
      where: {
        playerId: In(playerIds as any[]),
        recoveredAt: IsNull(),
      },
    });

    for (const injury of activeInjuries) {
      injury.recoveredAt = new Date();
    }

    if (activeInjuries.length > 0) {
      await this.injuryRepository.save(activeInjuries);
    }

    // Clear injury fields on players
    for (const player of botPlayersWithInjuries) {
      player.currentInjuryValue = 0;
      player.injuryType = null;
      player.injuryState = null;
      player.injuredAt = null;
      playersToSave.push(player);

      this.logger.debug(
        `[MatchCompletion] Bot player ${player.name} injury instantly recovered`,
      );
    }

    if (playersToSave.length > 0) {
      await this.playerRepository.save(playersToSave);
    }

    this.logger.log(
      `[MatchCompletion] Completed instant injury recovery for ${playersToSave.length} bot player(s)`,
    );
  }
}
