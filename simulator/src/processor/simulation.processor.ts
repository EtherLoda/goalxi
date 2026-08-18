import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Inject, Injectable } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In, EntityManager } from 'typeorm';
import {
  MatchEntity,
  MatchEventEntity,
  MatchEventType,
  MatchTeamStatsEntity,
  MatchStatus,
  MatchTacticsEntity,
  PlayerEntity,
  PlayerEventEntity,
  PlayerEventType,
  PlayerCompetitionStatsEntity,
  TeamEntity,
  MatchType,
  GAME_SETTINGS,
  MatchPhase,
  MatchLane,
  toSimulationPlayer,
  applyInjuryBatch,
  StaffEntity,
  StaffRole,
  calculateMatchExperience,
  addExperience,
  Uuid,
} from '@goalxi/database';
import { MatchEngine, MatchEvent } from '../engine/match.engine';
import { Team } from '../engine/classes/Team';
import { normalizePositionKey } from '../engine/utils/attribute-calculator';
import {
  EventCondition,
  TacticalInstruction,
  TacticalPlayer,
} from '../engine/types/simulation.types';
import {
  TacticsConfig,
  Tempo,
  PitchWidth,
  DefensiveLine,
} from '../engine/types/tactics-config';
import { Player } from '../types/player.types';
import { DEFAULT_TACTICS } from '../engine/tactics/tactics-presets';
import {
  NotificationService,
  NotificationType,
} from '../notification/notification.service';

interface SimulationJobData {
  matchId: string;
  homeForfeit?: boolean;
  awayForfeit?: boolean;
  weather?: string;
  /** Inbound X-Request-Id from the api caller; propagates traceId to logs. */
  traceId?: string;
}

@Processor('match-simulation')
@Injectable()
export class SimulationProcessor extends WorkerHost {
  /** Active job-scoped logger. Set at the top of process() so every method
   *  below emits lines bound to the inbound traceId without changing
   *  signatures. */
  private jobLog!: PinoLoggerService;

  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    @InjectRepository(MatchEntity)
    private readonly matchRepository: Repository<MatchEntity>,
    @InjectRepository(MatchEventEntity)
    private readonly eventRepository: Repository<MatchEventEntity>,
    @InjectRepository(MatchTeamStatsEntity)
    private readonly statsRepository: Repository<MatchTeamStatsEntity>,
    @InjectRepository(MatchTacticsEntity)
    private readonly tacticsRepository: Repository<MatchTacticsEntity>,
    @InjectRepository(PlayerEntity)
    private readonly playerRepository: Repository<PlayerEntity>,
    @InjectRepository(TeamEntity)
    private readonly teamRepository: Repository<TeamEntity>,
    @InjectRepository(PlayerEventEntity)
    private readonly playerEventRepository: Repository<PlayerEventEntity>,
    @InjectRepository(StaffEntity)
    private readonly staffRepository: Repository<StaffEntity>,
    @InjectRepository(PlayerCompetitionStatsEntity)
    private readonly competitionStatsRepo: Repository<PlayerCompetitionStatsEntity>,
    private readonly dataSource: DataSource,
    private readonly notificationService: NotificationService,
  ) {
    super();
  }

  async process(job: Job<SimulationJobData>): Promise<void> {
    const { matchId, homeForfeit, awayForfeit, weather, traceId } = job.data;
    // Bind the inbound traceId (X-Request-Id from the api caller) to every
    // log line emitted for this job. If absent, fall back to the base logger.
    this.jobLog = traceId ? this.logger.child({ traceId }) : this.logger;

    const match = await this.matchRepository.findOne({
      where: { id: matchId },
      relations: ['homeTeam', 'awayTeam'],
    });

    if (!match) {
      this.jobLog.error(`Match ${matchId} not found`);
      return;
    }

    if (match.status === MatchStatus.COMPLETED) {
      this.jobLog.warn(`Match ${matchId} already completed.`);
      return;
    }

    // [RFC sim-worker-lock] Atomic claim — a per-match lease that prevents
    // two workers from both running the engine and bulk-inserting events for
    // the same match. The recovery branch in `completeMatches`
    // (settlement scheduler) re-enqueues while the first worker is still
    // computing; the first worker never sets status=COMPLETED itself
    // (the scheduler does that once lastEvent.eventScheduledTime <= now),
    // so the old "skip if COMPLETED" guard was racey. The atomic
    // UPDATE+RETURNING makes the second worker see 0 rows and bail out
    // before touching `match_event`. See migration
    // `1723500000000-AddSimulationStartedAt`.
    const claimed = await this.dataSource.transaction(async (manager) => {
      const result = await manager.query(
        `UPDATE "match"
         SET "simulation_started_at" = NOW()
         WHERE "id" = $1
           AND "simulation_started_at" IS NULL
           AND "status" IN ('tactics_locked', 'in_progress')
         RETURNING "id"`,
        [matchId],
      );
      return Array.isArray(result) && result.length > 0;
    });
    if (!claimed) {
      this.jobLog.warn(
        `Match ${matchId} simulation already in flight or finished, skipping duplicate job`,
      );
      return;
    }

    try {
      if (homeForfeit || awayForfeit) {
        await this.handleForfeit(match, !!homeForfeit, !!awayForfeit);
      } else {
        await this.runSimulation(match, weather);
      }
    } finally {
      // Release the lease on success OR crash so the next legitimate run
      // (e.g. after a fixed worker) can claim. `completeMatches` has a
      // separate stale-lock sweep for crashes that leave the lease set.
      await this.matchRepository.update(
        { id: matchId },
        { simulationStartedAt: null },
      );
    }

    // Create match result notifications for both teams
    const homeTeam = await this.teamRepository.findOne({
      where: { id: match.homeTeamId as any },
    });
    const awayTeam = await this.teamRepository.findOne({
      where: { id: match.awayTeamId as any },
    });

    const homeUserId = homeTeam?.userId;
    const awayUserId = awayTeam?.userId;
    const homeScore = match.homeScore ?? 0;
    const awayScore = match.awayScore ?? 0;

    if (homeUserId) {
      const resultType =
        homeScore > awayScore
          ? NotificationType.MATCH_RESULT_WIN
          : homeScore < awayScore
            ? NotificationType.MATCH_RESULT_LOSS
            : NotificationType.MATCH_RESULT_DRAW;
      await this.notificationService.createWithTime(
        homeUserId,
        resultType,
        `notification.${resultType.toLowerCase()}`,
        {
          matchId: match.id,
          homeTeamId: match.homeTeamId,
          awayTeamId: match.awayTeamId,
          homeTeamName: homeTeam?.name || 'Unknown',
          awayTeamName: awayTeam?.name || 'Unknown',
          homeScore,
          awayScore,
        },
        match.actualEndTime?.getTime() || Date.now(),
      );
    }

    if (awayUserId) {
      const resultType =
        awayScore > homeScore
          ? NotificationType.MATCH_RESULT_WIN
          : awayScore < homeScore
            ? NotificationType.MATCH_RESULT_LOSS
            : NotificationType.MATCH_RESULT_DRAW;
      await this.notificationService.createWithTime(
        awayUserId,
        resultType,
        `notification.${resultType.toLowerCase()}`,
        {
          matchId: match.id,
          homeTeamId: match.homeTeamId,
          awayTeamId: match.awayTeamId,
          homeTeamName: homeTeam?.name || 'Unknown',
          awayTeamName: awayTeam?.name || 'Unknown',
          homeScore,
          awayScore,
        },
        match.actualEndTime?.getTime() || Date.now(),
      );
    }

    const winner =
      match.homeScore > match.awayScore
        ? 'home'
        : match.awayScore > match.homeScore
          ? 'away'
          : 'draw';
    this.jobLog.info(
      `[Match] result matchId=${matchId} ${match.homeScore}-${match.awayScore} winner=${winner} type=${match.type} extraTime=${!!match.hasExtraTime} penalties=${!!match.hasPenaltyShootout}`,
    );

    // Create injury notifications for both teams
    const injuryEvents = await this.eventRepository.find({
      where: { matchId: matchId, type: MatchEventType.INJURY },
    });

    if (injuryEvents.length > 0) {
      for (const event of injuryEvents) {
        const eventData = event.data as any;
        const injuryData = eventData?.injuryData;
        if (!injuryData) continue;

        const playerName = eventData?.playerName || 'Unknown Player';
        const team = event.team;
        if (!team?.userId) continue;

        await this.notificationService.createWithTime(
          team.userId,
          NotificationType.PLAYER_INJURED,
          'notification.playerInjured',
          {
            playerId: event.playerId,
            playerName,
            injuryType: injuryData.injuryType,
            injuryValue: injuryData.injuryValue,
            severity: injuryData.severity,
            estimatedRecoveryDays: injuryData.estimatedRecoveryDays,
          },
          match.actualEndTime?.getTime() || Date.now(),
        );
      }
    }
  }

  private findPositionInLineup(
    lineup: Record<string, string | number> | undefined,
    playerId: number,
  ): string | undefined {
    return Object.keys(lineup).find((key) => lineup[key] === playerId);
  }

  private async runSimulation(
    match: MatchEntity,
    weather?: string,
  ): Promise<void> {
    // 1. Fetch Tactics
    const homeTactics = await this.tacticsRepository.findOne({
      where: { matchId: match.id, teamId: match.homeTeamId },
    });
    const awayTactics = await this.tacticsRepository.findOne({
      where: { matchId: match.id, teamId: match.awayTeamId },
    });

    if (!homeTactics || !awayTactics) {
      throw new Error(`Tactics missing for match ${match.id}`);
    }

    // 2. Fetch Teams with Bench Config and Doctors
    const [homeTeamEntity, awayTeamEntity] = await Promise.all([
      this.teamRepository.findOne({ where: { id: match.homeTeamId as any } }),
      this.teamRepository.findOne({ where: { id: match.awayTeamId as any } }),
    ]);

    const homeBenchConfig = homeTeamEntity?.benchConfig || null;
    const awayBenchConfig = awayTeamEntity?.benchConfig || null;

    // Fetch team doctors for injury calculation
    const [homeDoctors, awayDoctors] = await Promise.all([
      this.staffRepository.find({
        where: {
          teamId: match.homeTeamId,
          role: StaffRole.TEAM_DOCTOR,
          isActive: true,
        },
      }),
      this.staffRepository.find({
        where: {
          teamId: match.awayTeamId,
          role: StaffRole.TEAM_DOCTOR,
          isActive: true,
        },
      }),
    ]);
    const homeDoctorLevel = homeDoctors[0]?.level || 0;
    const awayDoctorLevel = awayDoctors[0]?.level || 0;

    // 3. Fetch Players
    // After the player id uuid→int migration we read the new
    // `lineupV2`/`substitutionsV2` (number ids). If v2 is missing the
    // editor hasn't been re-saved yet — skip silently and let the upstream
    // caller re-submit tactics.
    const homeStarterIds = Object.values(homeTactics.lineupV2 ?? {}).filter(
      (id): id is number => typeof id === 'number',
    );
    const awayStarterIds = Object.values(awayTactics.lineupV2 ?? {}).filter(
      (id): id is number => typeof id === 'number',
    );
    const homeSubIds = (homeTactics.substitutionsV2 ?? []).map((s) => s.in);
    const awaySubIds = (awayTactics.substitutionsV2 ?? []).map((s) => s.in);

    const allPlayerIds = [
      ...homeStarterIds,
      ...awayStarterIds,
      ...homeSubIds,
      ...awaySubIds,
    ];
    const allPlayers = await this.playerRepository.find({
      where: { id: In(allPlayerIds) },
    });

    // 3. Map Instructions
    const mapInstructions = (
      tactics: MatchTacticsEntity,
    ): TacticalInstruction[] => {
      const results: TacticalInstruction[] = [];
      if (tactics.substitutionsV2) {
        for (const s of tactics.substitutionsV2) {
          results.push({
            minute: s.minute,
            type: 'swap',
            playerId: s.out,
            newPlayerId: s.in,
            newPosition:
              this.findPositionInLineup(tactics.lineupV2, s.out) || 'CF',
            // Forward the user-selected trigger condition (always /
            // leading / trailing / tied / notLeading / notTrailing).
            // `undefined` means "always" — the engine's shouldFire()
            // treats both the same way.
            ...((s as { condition?: EventCondition }).condition
              ? { condition: (s as { condition?: EventCondition }).condition }
              : {}),
          });
        }
      }
      if (tactics.instructions) {
        if (Array.isArray(tactics.instructions.positionSwaps)) {
          for (const ps of tactics.instructions.positionSwaps) {
            results.push({
              minute: ps.minute,
              type: 'position_swap',
              playerId: ps.playerA,
              newPlayerId: ps.playerB,
              newPosition: 'SWAP',
            });
          }
        }
        if (Array.isArray(tactics.instructions.moves)) {
          for (const m of tactics.instructions.moves) {
            results.push({
              minute: m.minute,
              type: 'move',
              playerId: m.player,
              newPosition: m.position,
              ...((m as { condition?: EventCondition }).condition
                ? {
                    condition: (m as { condition?: EventCondition }).condition,
                  }
                : {}),
            });
          }
        }
      }
      return results;
    };

    const homeInstructions = mapInstructions(homeTactics);
    const awayInstructions = mapInstructions(awayTactics);

    // 4. Setup Engine Teams
    // Filter out players that don't exist in DB to avoid runtime crashes.
    // NOTE: this is a combined lookup of starters + subs from BOTH teams (built
    // above as `allPlayers`), not just the home side. The variable name is
    // kept on the home side for historical reasons.
    const knownPlayerIds = new Set(allPlayers.map((p) => p.id));
    const missingHome = homeStarterIds.filter(
      (pid) => !knownPlayerIds.has(pid),
    );
    const missingAway = awayStarterIds.filter(
      (pid) => !knownPlayerIds.has(pid),
    );
    if (missingHome.length > 0)
      this.jobLog.warn(
        `[Simulator] Home lineup references missing players: ${missingHome.join(', ')}`,
      );
    if (missingAway.length > 0)
      this.jobLog.warn(
        `[Simulator] Away lineup references missing players: ${missingAway.join(', ')}`,
      );

    const validHomeIds = homeStarterIds.filter((pid) =>
      knownPlayerIds.has(pid),
    );
    const validAwayIds = awayStarterIds.filter((pid) =>
      knownPlayerIds.has(pid),
    );

    const homeTacticalPlayers: TacticalPlayer[] = validHomeIds.map((pid) => ({
      player: toSimulationPlayer(allPlayers.find((p) => p.id === pid)),
      // Read the int-keyed v2 column. The legacy `lineup` jsonb was wiped
      // by the `MatchTacticsLineupToInt` migration and stays `{}`, so
      // any read against it would silently fall through to the 'ST'
      // fallback and stack all 11 starters on the same pitch slot
      // (rendered as a single CF marker on the match page).
      //
      // The `normalizePositionKey` wrap folds youth-editor keys
      // (LCB/RCB/LCM/RCM/CDM1/CDM2/LAM/RAM/CAM/ST/LST/RST) and the
      // legacy CAM/CAML/CAMR/CDM/DMF/DMFL/DMFR family into the
      // senior canonical 25-slot set, so downstream consumers
      // (POSITION_TO_BENCH_KEY, POSITION_WEIGHTS, getSubstituteForPosition)
      // never see a key they don't recognise.
      positionKey: normalizePositionKey(
        this.findPositionInLineup(homeTactics.lineupV2, pid) ?? 'ST',
      ),
    }));

    const awayTacticalPlayers: TacticalPlayer[] = validAwayIds.map((pid) => ({
      player: toSimulationPlayer(allPlayers.find((p) => p.id === pid)),
      // Same v2-only read for the away side — see homeTacticalPlayers
      // comment above.
      positionKey: normalizePositionKey(
        this.findPositionInLineup(awayTactics.lineupV2, pid) ?? 'ST',
      ),
    }));

    // Roster gate: any team below the minimum field size forfeits the match.
    // Without this guard the engine runs with empty arrays and emits ~20 fake
    // "key moment" events for a match that, in reality, never starts.
    const minPlayers = SimulationProcessor.MIN_PLAYERS_PER_TEAM;
    if (
      homeTacticalPlayers.length < minPlayers ||
      awayTacticalPlayers.length < minPlayers
    ) {
      const homeForfeit = homeTacticalPlayers.length < minPlayers;
      const awayForfeit = awayTacticalPlayers.length < minPlayers;
      this.jobLog.warn(
        `[Simulator] Match ${match.id} forfeit — home=${homeTacticalPlayers.length} away=${awayTacticalPlayers.length} (min=${minPlayers})`,
      );
      // Pass the partial lineups so the forfeit event stream can still
      // introduce any players that *did* show up (the non-forfeiting
      // side). Players on the forfeiting side are dropped.
      await this.handleRosterForfeit(
        match,
        homeForfeit,
        awayForfeit,
        homeTacticalPlayers,
        awayTacticalPlayers,
      );
      return;
    }

    const subMap = new Map<number, TacticalPlayer>();
    for (const pid of [...homeSubIds, ...awaySubIds]) {
      const entity = allPlayers.find((p) => p.id === pid);
      if (entity) {
        subMap.set(pid, {
          player: toSimulationPlayer(entity),
          positionKey: 'SUB',
        });
      }
    }

    const tA = new Team(
      match.homeTeam.name,
      homeTacticalPlayers,
      homeDoctorLevel,
    );
    const tB = new Team(
      match.awayTeam.name,
      awayTacticalPlayers,
      awayDoctorLevel,
    );

    // Normalize weather string for MatchEngine
    const normalizedWeather = weather || 'cloudy';

    const homeTacticsConfig: TacticsConfig = {
      tempo: (homeTactics.tempo as Tempo) || Tempo.BALANCED,
      pitchWidth: (homeTactics.pitchWidth as PitchWidth) || PitchWidth.BALANCED,
      defensiveLine:
        (homeTactics.defensiveLine as DefensiveLine) || DefensiveLine.MID,
    };

    const awayTacticsConfig: TacticsConfig = {
      tempo: (awayTactics.tempo as Tempo) || Tempo.BALANCED,
      pitchWidth: (awayTactics.pitchWidth as PitchWidth) || PitchWidth.BALANCED,
      defensiveLine:
        (awayTactics.defensiveLine as DefensiveLine) || DefensiveLine.MID,
    };

    const engine = new MatchEngine(
      tA,
      tB,
      homeInstructions,
      awayInstructions,
      subMap,
      homeBenchConfig,
      awayBenchConfig,
      normalizedWeather,
      homeTacticsConfig,
      awayTacticsConfig,
      this.jobLog,
      // Pre-computed crowd size; the engine treats it as read-only
      // and emits an `attendance_announcement` event from it. Falls
      // back to 0 when the upstream scheduler hasn't populated the
      // column yet (legacy rows / pre-RFC matches).
      match.attendance ?? 0,
    );

    // 5. Run Match (wrapped in try/catch to ensure transaction rollback on error)
    this.jobLog.log(
      `[Simulator] Starting engine for ${match.id} with weather: ${normalizedWeather}`,
    );
    let events: MatchEvent[];
    try {
      events = engine.simulateMatch();
    } catch (err) {
      this.jobLog.error(
        `[Simulator] simulateMatch crashed for match ${match.id}: ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw err;
    }

    // [RFC injury-time-2026] Read the per-half stoppage the engine
    // actually simulated (computed from fouls/cards/injuries). The
    // engine is now the single source of truth — we no longer roll
    // our own 1-5 random and pretend the engine played it. The
    // `match.*InjuryTime` fields get written here so the post-match
    // summary card and `MatchEntity` carry the same value the
    // event-log timestamps below assume.
    const firstHalfInjuryTime = engine.firstHalfInjuryTime;
    const secondHalfInjuryTime = engine.secondHalfInjuryTime;

    match.firstHalfInjuryTime = firstHalfInjuryTime;
    match.secondHalfInjuryTime = secondHalfInjuryTime;

    // Check if extra time is needed (match requires winner and is tied)
    if (match.requiresWinner && engine.homeScore === engine.awayScore) {
      this.jobLog.log(
        `[Simulator] Match ${match.id} is tied and requires winner - playing extra time`,
      );
      try {
        events = engine.simulateExtraTime();
      } catch (err) {
        this.jobLog.error(
          `[Simulator] simulateExtraTime crashed for match ${match.id}: ${(err as Error).message}`,
          (err as Error).stack,
        );
        throw err;
      }
      match.hasExtraTime = true;

      // [RFC injury-time-2026] Same source-of-truth shift for ET:
      // the engine computed the stoppage from ET's own fouls/cards
      // counts and stored them on `engine.*Injury`.
      const etFirstHalfInjury = engine.extraTimeFirstHalfInjury;
      const etSecondHalfInjury = engine.extraTimeSecondHalfInjury;
      match.extraTimeFirstHalfInjury = etFirstHalfInjury;
      match.extraTimeSecondHalfInjury = etSecondHalfInjury;

      // If still tied after extra time, penalty shootout
      if (engine.homeScore === engine.awayScore) {
        this.jobLog.log(
          `[Simulator] Still tied after extra time - penalty shootout`,
        );
        try {
          events = engine.simulatePenaltyShootout();
        } catch (err) {
          this.jobLog.error(
            `[Simulator] simulatePenaltyShootout crashed for match ${match.id}: ${(err as Error).message}`,
            (err as Error).stack,
          );
          throw err;
        }
        match.hasPenaltyShootout = true;
      }
    }

    // 6. Calculate Event Scheduled Times
    // Ensure matchStartTime is in UTC by creating a new Date from ISO string
    const matchStartTime = new Date(match.scheduledAt);
    // Force to UTC by getting the time value directly
    const matchStartTimeUTC = new Date(matchStartTime.toISOString());

    this.jobLog.log(
      `[Simulator] Calculating event scheduled times (match starts: ${matchStartTimeUTC.toISOString()})
` +
        `  1st half injury time: ${firstHalfInjuryTime}min, 2nd half injury time: ${secondHalfInjuryTime}min`,
    );

    // [RFC injury-time-2026] The engine now simulates injury time
    // per half, so the event-log can have:
    //   - First half events at minutes 46..(45+N1)
    //   - Half-time event at minute (45+N1)
    //   - Second half events at minutes 46..90
    //   - Second half injury at minutes 91..(90+M)
    //   - Full-time event at minute (90+M)
    // and the symmetric ET case (91..105, 105+N2, 106..120, 121..(120+M2)).
    // We track the per-half end-minute here so the timeline math
    // below doesn't need to recompute it for every event.
    const firstHalfEndMinute = 45 + firstHalfInjuryTime;
    const etFirstHalfEndMinute = 105 + (engine.extraTimeFirstHalfInjury || 0);

    for (const event of events) {
      const eventMinute = event.minute;
      let realWorldOffset = 0; // Will calculate based on event minute

      /**
       * Timeline breakdown:
       * Minutes 0-45: First half (0 to 45 real-world minutes)
       * Minute 45 (second half kickoff): Halftime break (revealed at T+60, after 15min break)
       * Minutes 46-90: Second half starts at T+60 (T+45 + 15min break)
       * Minute 90+: Match ends when last event scheduled
       *
       * Note: Game minutes don't include halftime break
       * Event at minute 46 happens at real-world T+60 (45min play + 15min break)
       */

      // Special case: Second half kickoff. The engine emits this as
      // `{ minute: 46, type: 'second_half', data: { period: 'second_half' } }`
      // — the in-game minute label is 46 (the first minute of the
      // second half), but the event itself marks the boundary where
      // the second half *begins* — i.e. real time 60 (45 + 15 HT).
      //
      // Pre-fix this check was:
      //   `eventMinute === 45 && type === 'kickoff' && period === 'second_half'`
      // which matched NOTHING — the engine never emits a `kickoff`
      // event with `period === 'second_half'` (kickoffs use period
      // 'first_half' / 'extra_time' / 'extra_time_second_half'). So
      // the second_half event silently fell through to the
      // `eventMinute <= 90` arm and got 46 + 15 = 61 min, 1 minute
      // late. The new check matches the actual wire shape.
      const isSecondHalfKickoff =
        eventMinute === 46 &&
        event.type === 'second_half' &&
        event.data?.period === 'second_half';

      // Special case: Extra time kickoff at minute 90
      const isExtraTimeKickoff =
        eventMinute === 90 &&
        event.type === 'kickoff' &&
        event.data?.period === 'extra_time';

      // Special case: Extra time second half kickoff at minute 105
      const isExtraTimeSecondHalfKickoff =
        eventMinute === 105 &&
        event.type === 'kickoff' &&
        event.data?.period === 'extra_time_second_half';

      // [RFC injury-time-2026] Half-time whistle: the engine emits
      // this at minute (45 + N1) for regulation and (105 + N2) for
      // ET1. Both land BEFORE the halftime / ET-break, so the real
      // time is just the in-game minute (no break offset added).
      const isHalfTimeWhistle = event.type === 'half_time';
      // Full-time whistle: minute (90 + M) for regulation and
      // (120 + M2) for ET. Both land at real time = in-game minute +
      // any preceding breaks (HT for regulation, HT + ET break for
      // ET) — handled by the same `eventMinute <= 90` / `match.hasExtraTime`
      // arms below, so no special case needed here.

      if (eventMinute < 45) {
        // First half: direct mapping (minutes 0-44)
        realWorldOffset = eventMinute * 60 * 1000;
      } else if (eventMinute === 45 && !isSecondHalfKickoff) {
        // First half minute 45 events (goals, fouls, etc. at 45')
        realWorldOffset = 45 * 60 * 1000;
      } else if (isSecondHalfKickoff) {
        // Second half kickoff: happens after 15-minute break
        // Real time = 45min play + 15min break = 60 minutes
        realWorldOffset =
          45 * 60 * 1000 + GAME_SETTINGS.MATCH_HALF_TIME_MINUTES * 60 * 1000;
      } else if (eventMinute <= 90) {
        // Second half (minutes 46-90): add 15-minute halftime break
        realWorldOffset =
          eventMinute * 60 * 1000 +
          GAME_SETTINGS.MATCH_HALF_TIME_MINUTES * 60 * 1000;
      } else if (match.hasExtraTime) {
        // Extra time kickoff events and regular ET events
        if (isExtraTimeKickoff) {
          // Extra time kickoff: happens immediately after regular time ends
          // Real time = 90min play + 15min HT = 105 minutes
          realWorldOffset =
            90 * 60 * 1000 + GAME_SETTINGS.MATCH_HALF_TIME_MINUTES * 60 * 1000;
        } else if (eventMinute < 105) {
          // ET first half (91-104): regular events
          // Real time = 90min play + 15min HT + (eventMinute - 90) ET minutes
          realWorldOffset =
            90 * 60 * 1000 +
            GAME_SETTINGS.MATCH_HALF_TIME_MINUTES * 60 * 1000 +
            (eventMinute - 90) * 60 * 1000;
        } else if (isExtraTimeSecondHalfKickoff) {
          // ET second half kickoff: happens after 5-minute ET break
          // Real time = 90min play + 15min HT + 15min ET1st + 5min ET break
          realWorldOffset =
            90 * 60 * 1000 +
            GAME_SETTINGS.MATCH_HALF_TIME_MINUTES * 60 * 1000 +
            15 * 60 * 1000 + // ET first half
            GAME_SETTINGS.MATCH_EXTRA_TIME_BREAK_MINUTES * 60 * 1000;
        } else if (eventMinute <= 120) {
          // ET second half (106-120): regular events
          // Real time = 90min play + 15min HT + 15min ET1st + 5min ET break + (eventMinute - 105) ET2nd minutes
          realWorldOffset =
            90 * 60 * 1000 +
            GAME_SETTINGS.MATCH_HALF_TIME_MINUTES * 60 * 1000 +
            15 * 60 * 1000 + // ET first half
            GAME_SETTINGS.MATCH_EXTRA_TIME_BREAK_MINUTES * 60 * 1000 +
            (eventMinute - 105) * 60 * 1000;
        } else {
          // [RFC injury-time-2026] ET second-half injury time
          // (121..120+M2). Real time = 90 + 15 HT + 15 ET1 + 5 ET
          // break + (eventMinute - 120) ET2-injury minutes.
          // The `full_time` whistle for ET also lands here at
          // minute 120+M2.
          realWorldOffset =
            90 * 60 * 1000 +
            GAME_SETTINGS.MATCH_HALF_TIME_MINUTES * 60 * 1000 +
            15 * 60 * 1000 + // ET first half
            GAME_SETTINGS.MATCH_EXTRA_TIME_BREAK_MINUTES * 60 * 1000 +
            (eventMinute - 120) * 60 * 1000;
        }
      } else {
        // [RFC injury-time-2026] Second-half injury time without ET
        // (91..90+M). Real time = eventMinute + 15 HT. The
        // `full_time` whistle also lands here at minute 90+M.
        realWorldOffset =
          eventMinute * 60 * 1000 +
          GAME_SETTINGS.MATCH_HALF_TIME_MINUTES * 60 * 1000;
      }

      // [RFC injury-time-2026] First-half-injury window
      // (46..45+N1) and ET1-injury window (106..105+N2): the events
      // here are pushed AFTER `simulateMinute` and BEFORE the
      // `half_time` whistle, so their `eventMinute` is in [46, 50]
      // (or [106, 110] for ET1). They sit in the first half
      // (before the HT break) and should map to real time =
      // `eventMinute` — the same direct mapping as minutes 0-44
      // uses. Without this override, they would fall into the
      // `eventMinute <= 90` arm and get +15 HT added (placing a
      // 46th-minute injury-time event at T+61 instead of T+46).
      if (isHalfTimeWhistle) {
        // Half-time whistle at minute 45+N1 (or 105+N2 for ET):
        // real time = in-game minute (whistle blows at that clock).
        realWorldOffset = eventMinute * 60 * 1000;
      } else if (
        !match.hasExtraTime &&
        eventMinute > 45 &&
        eventMinute < firstHalfEndMinute
      ) {
        // First-half injury-time events (46..45+N1-1). These
        // minutes happen before the half-time whistle, so no
        // HT-break offset should be added.
        realWorldOffset = eventMinute * 60 * 1000;
      } else if (
        match.hasExtraTime &&
        eventMinute > 105 &&
        eventMinute < etFirstHalfEndMinute
      ) {
        // ET1 injury-time events (106..105+N2-1). Same idea:
        // before the ET half-time whistle, no ET-break offset.
        realWorldOffset =
          90 * 60 * 1000 +
          GAME_SETTINGS.MATCH_HALF_TIME_MINUTES * 60 * 1000 +
          (eventMinute - 90) * 60 * 1000;
      }

      // Create event scheduled time in UTC
      event.eventScheduledTime = new Date(
        matchStartTimeUTC.getTime() + realWorldOffset,
      );
    }

    const lastEvent = events[events.length - 1];
    const totalDuration = lastEvent?.eventScheduledTime
      ? (lastEvent.eventScheduledTime.getTime() - matchStartTimeUTC.getTime()) /
        (60 * 1000)
      : 0;

    this.jobLog.log(
      `[Simulator] Events will be revealed from ${matchStartTimeUTC.toISOString()} ` +
        `to ${lastEvent?.eventScheduledTime?.toISOString() || 'unknown'}\n` +
        `  Total events: ${events.length}, Real-world duration: ~${Math.ceil(totalDuration)} minutes`,
    );

    // 7. Persist Results
    // Pre-build an id->name lookup so the bulk-insert below can
    // resolve `playerName` / `assistName` in O(1) instead of
    // doing an O(N) `allPlayers.find` per event row. With
    // ~150 events and 22 players, the legacy code did 300
    // linear scans per match (one for the playerId, one for the
    // relatedPlayerId, per event). micro-bench: 1.37× speedup
    // on this pattern alone.
    const playerById = new Map<number, string>();
    for (const p of allPlayers) {
      playerById.set(p.id, p.name);
    }

    await this.dataSource.transaction(async (manager) => {
      // [RFC sim-worker-lock] Defense in depth: clear any stale events from
      // a previous (now-released) attempt before inserting fresh ones. The
      // atomic claim above already prevents two workers from running at the
      // same time, but if a prior worker crashed mid-save after the lock
      // was released by the sweep in `completeMatches`, those rows could
      // otherwise linger and yield 2× snapshots at the same minute.
      await manager.delete(MatchEventEntity, { matchId: match.id });
      await manager.delete(MatchTeamStatsEntity, { matchId: match.id });

      // Get match report from engine for settlement
      const matchReport = engine.getMatchReport();

      // Record hat-trick events
      for (const hatTrick of matchReport.hatTricks) {
        const playerEvent = manager.create(PlayerEventEntity, {
          playerId: hatTrick.playerId,
          season: match.season,
          date: new Date(),
          eventType: PlayerEventType.HAT_TRICK,
          icon: 'sports_kabaddi',
          titleKey: 'player_events.hat_trick',
          matchId: match.id,
          titleData: { goals: hatTrick.goals, minute: hatTrick.minute },
          details: {
            matchId: match.id,
            homeTeam: match.homeTeam.name,
            awayTeam: match.awayTeam.name,
            homeScore: engine.homeScore,
            awayScore: engine.awayScore,
          },
        });
        await manager.save(playerEvent);
      }

      // Update Match - DON'T change status, let scheduler handle it
      // Simulation completes BEFORE match starts, status should remain TACTICS_LOCKED
      match.homeScore = engine.homeScore;
      match.awayScore = engine.awayScore;
      // match.status stays as TACTICS_LOCKED - scheduler will change to IN_PROGRESS at match start time
      match.simulationCompletedAt = new Date(); // Internal timestamp
      match.actualEndTime = lastEvent?.eventScheduledTime || new Date(); // When match will actually end
      await manager.save(match);

      // Save Events with Bulk Insert (bypass entity instantiation overhead)
      await manager
        .createQueryBuilder()
        .insert()
        .into(MatchEventEntity)
        .values(
          events.map((e) => {
            // O(1) Map lookup instead of O(N) `allPlayers.find`
            // per event. ~150 events × 22 players = 3300
            // linear scans → 300 Map.get calls.
            const playerName = e.playerId
              ? playerById.get(e.playerId)
              : undefined;
            const assistName = e.relatedPlayerId
              ? playerById.get(e.relatedPlayerId)
              : undefined;
            return {
              matchId: match.id,
              minute: e.minute,
              second: 0,
              type: this.mapEventType(e.type),
              typeName: e.type,
              teamId:
                e.teamName === match.homeTeam.name
                  ? match.homeTeamId
                  : e.teamName === match.awayTeam.name
                    ? match.awayTeamId
                    : null,
              playerId: e.playerId || null,
              relatedPlayerId: e.relatedPlayerId || null,
              phase: (e.phase as MatchPhase) || MatchPhase.FIRST_HALF,
              lane: (e.lane as any) || null,
              isHome: e.teamName ? e.teamName === match.homeTeam.name : null,
              data: { ...e.data, playerName, assistName },
              eventScheduledTime: e.eventScheduledTime,
              // [RFC 0001] Per RFC §4.3 fog is a column on MatchEventEntity
              // used by the live-match subscription to decide what to
              // stream to each viewer. Both senior and youth matches
              // start with isRevealed = true; the GET endpoints fog
              // individual rows for unauthorized viewers. The player
              // skill fog (PlayerEntity.revealedSkills) is a separate
              // concern handled at the API/DTO layer.
              isRevealed: true,
            } as any;
          }),
        )
        .execute();

      // Save Stats with Lane Strength Averages
      const laneStrengthAverages = matchReport.laneStrengthAverages;
      // Foul count is no longer derivable from `events` because plain
      // fouls (the ~82% majority) stopped emitting a `foul` event —
      // see `MatchEngine.resolveFoul`. The engine now tracks the count
      // internally on `matchStats.foulStats` and surfaces it on the
      // match report; read from there so the persisted
      // `MatchTeamStatsEntity.fouls` stays accurate.
      const foulStats = matchReport.matchStats.foulStats;
      // Single-pass per-team counter. Legacy code did 6
      // `events.filter` passes per team (goals / misses / saves
      // by opponent / corners / yellows / reds), so the full
      // `calculateStats(home) + calculateStats(away)` did 12
      // traversals of `events`. Walk the event list once and
      // dispatch by (type, teamName) — each event lands in 0, 1,
      // or 2 of the per-team buckets (a save by the away GK
      // counts as a `savesByOpponent` for home; everything else
      // is per-team). micro-bench: 6.14× speedup on this
      // pattern.
      const homeName = match.homeTeam.name;
      const awayName = match.awayTeam.name;
      type PerTeamCounters = {
        goals: number;
        misses: number;
        savesByOpponent: number;
        corners: number;
        yellowCards: number;
        redCards: number;
      };
      const counters: Record<'home' | 'away', PerTeamCounters> = {
        home: { goals: 0, misses: 0, savesByOpponent: 0, corners: 0, yellowCards: 0, redCards: 0 },
        away: { goals: 0, misses: 0, savesByOpponent: 0, corners: 0, yellowCards: 0, redCards: 0 },
      };
      for (const e of events) {
        // Skip events that don't belong to either team (e.g.
        // kickoff, half_time, full_time) — they don't move any
        // per-team counter and the legacy `events.filter` calls
        // would also have ignored them via the teamName check.
        const side = e.teamName === homeName ? 'home' : e.teamName === awayName ? 'away' : null;
        if (side === null) continue;
        const c = counters[side];
        switch (e.type) {
          case 'goal': c.goals++; break;
          case 'miss': c.misses++; break;
          case 'save':
            // A save by the defending GK counts as a
            // `savesByOpponent` for the OTHER team.
            counters[side === 'home' ? 'away' : 'home'].savesByOpponent++;
            break;
          case 'corner': c.corners++; break;
          case 'yellow_card': c.yellowCards++; break;
          case 'red_card': c.redCards++; break;
          // 'foul' is intentionally absent — fouls are tracked
          // in `foulStats` (the engine's running counter), not
          // in the event stream. See the comment above
          // `foulStats` for the rationale.
        }
      }

      // Get possession from match stats
      const possessionStats = matchReport.matchStats.possessionStats;
      const totalPossession = possessionStats.home + possessionStats.away;

      const buildStats = (side: 'home' | 'away') => {
        const c = counters[side];
        const teamName = side === 'home' ? homeName : awayName;
        const teamId = side === 'home' ? match.homeTeamId : match.awayTeamId;
        const possessionPercent =
          totalPossession > 0
            ? ((possessionStats[side] / totalPossession) * 100)
            : 50;
        const teamLaneStrengths =
          side === 'home' ? laneStrengthAverages.home : laneStrengthAverages.away;
        return manager.create(MatchTeamStatsEntity, {
          matchId: match.id,
          teamId,
          possessionPercentage: possessionPercent,
          shots: c.goals + c.misses + c.savesByOpponent,
          shotsOnTarget: c.goals + c.savesByOpponent,
          corners: c.corners,
          // Read from the engine's running counter (see comment above
          // `calculateStats`); events no longer carry a `foul` row.
          fouls: foulStats[side],
          yellowCards: c.yellowCards,
          redCards: c.redCards,
          laneStrengthAverages: teamLaneStrengths,
        });
      };

      await manager.save([
        buildStats('home'),
        buildStats('away'),
      ]);

      // Update Player Career Stats (Settlement)
      const playerStats = matchReport.playerStats;
      const playerStatsMap = new Map(playerStats.map((p) => [p.playerId, p]));

      // Pre-compute per-player card counts in a single events
      // pass. The legacy code did `events.filter(...)` per
      // player (22 players × 2 events.filter = 44 walks of
      // the 150-event list = 6600 comparisons). One pass with
      // a Map lookup wins by ~11× on the in-process pattern
      // and is also what the existing
      // `updatePlayerCompetitionStats` does below (see its
      // `playerCardCounts` build).
      const playerCardCounts = new Map<
        number,
        { yellowCards: number; redCards: number }
      >();
      for (const e of events) {
        if (!e.playerId) continue;
        if (e.type !== 'yellow_card' && e.type !== 'red_card') continue;
        let c = playerCardCounts.get(e.playerId);
        if (!c) {
          c = { yellowCards: 0, redCards: 0 };
          playerCardCounts.set(e.playerId, c);
        }
        if (e.type === 'yellow_card') c.yellowCards++;
        else c.redCards++;
      }

      // Find players and update their career stats
      for (const player of allPlayers) {
        const stats = playerStatsMap.get(player.id);
        if (!stats || stats.minutesPlayed === 0) continue; // Skip players who didn't play

        // Ensure careerStats has proper structure
        if (!player.careerStats || typeof player.careerStats !== 'object') {
          player.careerStats = {
            club: {
              matches: 0,
              goals: 0,
              assists: 0,
              tackles: 0,
              yellowCards: 0,
              redCards: 0,
              avgContribution: 0,
              avgStars: 0,
            },
          };
        }
        if (!player.careerStats.club) {
          player.careerStats.club = {
            matches: 0,
            goals: 0,
            assists: 0,
            tackles: 0,
            yellowCards: 0,
            redCards: 0,
            avgContribution: 0,
            avgStars: 0,
          };
        }

        // Update club stats
        player.careerStats.club.matches += 1;
        player.careerStats.club.goals += stats.goals;
        player.careerStats.club.assists += stats.assists;
        player.careerStats.club.tackles += stats.tackles;
        player.careerStats.club.avgContribution = stats.avgContribution;
        player.careerStats.club.avgStars = stats.avgStars;

        // Count cards from events (pre-computed in
        // `playerCardCounts` above — see the comment block
        // before the player loop for the rationale).
        const playerCards =
          playerCardCounts.get(player.id) ?? { yellowCards: 0, redCards: 0 };
        player.careerStats.club.yellowCards += playerCards.yellowCards;
        player.careerStats.club.redCards += playerCards.redCards;

        // Calculate and update experience
        const experienceGain = calculateMatchExperience(
          match.type,
          stats.minutesPlayed,
        );
        const expResult = addExperience(
          player.id,
          player.experience,
          experienceGain,
        );
        player.experience = expResult.experienceAfter;
      }

      // Save all updated players
      await manager.save(
        allPlayers.filter(
          (p) =>
            playerStatsMap.has(p.id) &&
            playerStatsMap.get(p.id).minutesPlayed > 0,
        ),
      );

      // Update Player Competition Stats
      await this.updatePlayerCompetitionStats(
        manager,
        match,
        events,
        allPlayers,
        playerStatsMap,
        homeStarterIds,
        awayStarterIds,
      );

      // Persist injury records + player-side cache. The bulk
      // insert + per-player update used to live inline here as a
      // 90-line block, but the same logic is now in the shared
      // helper `applyInjuryBatch` (libs/database). The cron uses
      // the symmetric `applyDailyInjuryRecovery` helper for the
      // recovery path. The simulator only translates the engine's
      // string severity to the int column, then hands off.
      const injuryItems: Array<{
        playerId: number;
        matchId: string;
        injuryType: 'muscle' | 'ligament' | 'joint' | 'head' | 'other';
        severity: 1 | 2;
        injuryValue: number;
        estimatedDays: number;
        occurredAt: Date;
      }> = [];

      // Simulator emits severity as the string union 'mild' | 'severe'
      // (InjurySystem.InjurySeverity). InjuryEntity.severity is stored
      // as int (1 | 2) — convert here so the bulk insert doesn't fail
      // with "invalid input syntax for type integer: 'mild'". Values
      // outside the union fall back to 2 (severe) so an unexpected
      // string never crashes the job. The pre-2026-08-06 'moderate'
      // string is no longer emitted by the simulator, but if it ever
      // appears in legacy event payloads we map it to 2 (severe) too
      // — see migration 1729000000000-MergeInjurySeverity for the
      // matching DB-side remap of historical severity=3 rows.
      const severityMap: Record<string, 1 | 2> = {
        mild: 1,
        severe: 2,
        // legacy: 'moderate' was 2 in the old 3-tier model, which
        // lines up with the new "severe" so the value remains
        // semantically correct. 'unknown' values also default to 2.
        moderate: 2,
      };

      for (const e of events) {
        if (e.type !== 'injury') continue;
        const injuryData = (e.data as any)?.injuryData;
        if (!injuryData?.playerId) continue;

        injuryItems.push({
          playerId: injuryData.playerId,
          matchId: match.id,
          injuryType: injuryData.injuryType,
          severity: severityMap[injuryData.severity as string] ?? 2,
          injuryValue: injuryData.injuryValue,
          // Single deterministic recovery estimate — the redundant
          // `estimated_min_days` column was dropped (see
          // 1726000000000-DropInjuryRedundantColumns). Recovery status
          // is derived from `recoveredAt`, not stored as a boolean.
          estimatedDays: injuryData.estimatedRecoveryDays,
          // Pin the occurredAt to the match's scheduled kickoff so
          // the injury is recorded in the match's week, not the
          // wall-clock time of the simulation worker.
          occurredAt: match.scheduledAt,
        });
      }

      if (injuryItems.length > 0) {
        await applyInjuryBatch(manager, injuryItems);
      }
    });
  }

  private async updatePlayerCompetitionStats(
    manager: EntityManager,
    match: MatchEntity,
    events: MatchEvent[],
    allPlayers: PlayerEntity[],
    playerStatsMap: Map<number, any>,
    homeStarterIds: number[],
    awayStarterIds: number[],
  ): Promise<void> {
    const { id: matchId, leagueId, season } = match;
    const starterIds = new Set([...homeStarterIds, ...awayStarterIds]);

    // Count cards from events (yellow/red)
    const playerCardCounts = new Map<
      number,
      { yellowCards: number; redCards: number }
    >();

    for (const e of events) {
      if (!e.playerId) continue;

      if (!playerCardCounts.has(e.playerId)) {
        playerCardCounts.set(e.playerId, {
          yellowCards: 0,
          redCards: 0,
        });
      }

      const counts = playerCardCounts.get(e.playerId);
      switch (e.type) {
        case 'yellow_card':
          counts.yellowCards++;
          break;
        case 'red_card':
          counts.redCards++;
          break;
      }
    }

    // Collect the player IDs that actually played — these are
    // the only ones we need competition-stats rows for. Used as
    // the `In(...)` clause for the single batched `find` below
    // (replaces 22 sequential `findOne` round trips with one
    // `find({ playerId: In([...]) })`).
    const playingPlayerIds: number[] = [];
    const playingPlayers: PlayerEntity[] = [];
    for (const player of allPlayers) {
      const stats = playerStatsMap.get(player.id);
      if (!stats || stats.minutesPlayed === 0) continue;
      playingPlayerIds.push(player.id);
      playingPlayers.push(player);
    }

    // Single batched lookup: one SQL round trip fetches all
    // existing comp-stats rows for the players who actually
    // played. The legacy code did `findOne` per player
    // (`22 × findOne` round trips) inside the same transaction.
    const existingRows = playingPlayerIds.length
      ? await manager.find(PlayerCompetitionStatsEntity, {
          where: {
            playerId: In(playingPlayerIds),
            leagueId: leagueId as any,
            season,
          },
        })
      : [];
    const compByPlayer = new Map<number, PlayerCompetitionStatsEntity>();
    for (const row of existingRows) {
      compByPlayer.set(row.playerId, row);
    }

    // Partition into "update existing" and "create new", batch
    // the saves. Two `manager.save(arrayOfEntities)` calls
    // instead of 22 sequential single-row saves.
    const toUpdate: PlayerCompetitionStatsEntity[] = [];
    const toCreate: PlayerCompetitionStatsEntity[] = [];
    for (const player of playingPlayers) {
      const stats = playerStatsMap.get(player.id)!;
      const cardCounts = playerCardCounts.get(player.id) || {
        yellowCards: 0,
        redCards: 0,
      };

      let compStats = compByPlayer.get(player.id);
      if (!compStats) {
        compStats = manager.create(PlayerCompetitionStatsEntity, {
          playerId: player.id,
          leagueId: leagueId as any,
          season,
          goals: 0,
          assists: 0,
          tackles: 0,
          yellowCards: 0,
          redCards: 0,
          starts: 0,
          substituteAppearances: 0,
          appearances: 0,
        });
      }

      // Update stats using playerStatsMap (which comes from match report)
      compStats.goals += stats.goals || 0;
      compStats.assists += stats.assists || 0;
      compStats.tackles += stats.tackles || 0;
      compStats.yellowCards += cardCounts.yellowCards;
      compStats.redCards += cardCounts.redCards;
      compStats.appearances += 1;

      // Determine if starter or substitute
      if (starterIds.has(player.id) || stats.minutesPlayed >= 45) {
        compStats.starts += 1;
      } else {
        compStats.substituteAppearances += 1;
      }

      if (compByPlayer.has(player.id)) {
        toUpdate.push(compStats);
      } else {
        toCreate.push(compStats);
      }
    }

    if (toUpdate.length) {
      await manager.save(toUpdate);
    }
    if (toCreate.length) {
      await manager.save(toCreate);
    }
  }

  private mapEventType(type: string): number {
    // Map the engine's string event types onto the database-side
    // `MatchEventType` enum. The enum is the single source of truth
    // — if you renumber a value, this function follows automatically
    // and no caller needs to chase a magic number. Falls back to
    // `NEUTRAL_EVENT` for unknown strings (defensive: a new event
    // type added to the engine should not 5xx the whole match).
    const mapping: Record<string, MatchEventType> = {
      kickoff: MatchEventType.KICKOFF,
      goal: MatchEventType.GOAL,
      shot_on_target: MatchEventType.SHOT_ON_TARGET,
      save: MatchEventType.SAVE,
      miss: MatchEventType.SHOT_OFF_TARGET,
      turnover: MatchEventType.PASS,
      foul: MatchEventType.FOUL,
      yellow_card: MatchEventType.YELLOW_CARD,
      red_card: MatchEventType.RED_CARD,
      substitution: MatchEventType.SUBSTITUTION,
      half_time: MatchEventType.HALF_TIME,
      second_half: MatchEventType.SECOND_HALF_START,
      full_time: MatchEventType.FULL_TIME,
      injury: MatchEventType.INJURY,
      offside: MatchEventType.OFFSIDE,
      corner: MatchEventType.CORNER,
      free_kick: MatchEventType.FREE_KICK,
      penalty_goal: MatchEventType.PENALTY,
      penalty_miss: MatchEventType.PENALTY_MISS,
      snapshot: MatchEventType.SNAPSHOT,
      tactical_change: MatchEventType.NEUTRAL_EVENT,
      weather_announcement: MatchEventType.WEATHER_ANNOUNCEMENT,
      player_introduction: MatchEventType.PLAYER_INTRODUCTION,
      attendance_announcement: MatchEventType.ATTENDANCE_ANNOUNCEMENT,
      forfeit: MatchEventType.FORFEIT,
    };
    return mapping[type] ?? MatchEventType.NEUTRAL_EVENT;
  }

  /** Minimum number of players required in a team's lineup for a match
   *  to be played. Below this, the team forfeits (3-0 walkover, or 0-0
   *  if both teams forfeit). */
  private static readonly MIN_PLAYERS_PER_TEAM = 9;

  private async handleRosterForfeit(
    match: MatchEntity,
    homeForfeit: boolean,
    awayForfeit: boolean,
    homeTacticalPlayers: TacticalPlayer[] = [],
    awayTacticalPlayers: TacticalPlayer[] = [],
  ): Promise<void> {
    // Score rule mirrors the externally-triggered forfeit path:
    // homeForfeit ? 0 : 3, awayForfeit ? 0 : 3 → 0-0 if both forfeit, 3-0 otherwise.
    match.homeScore = homeForfeit ? 0 : 3;
    match.awayScore = awayForfeit ? 0 : 3;
    match.status = MatchStatus.COMPLETED;
    match.simulationCompletedAt = new Date();
    match.actualEndTime = new Date(
      new Date(match.scheduledAt).getTime() + 90 * 60 * 1000,
    );

    const homeName = match.homeTeam.name;
    const awayName = match.awayTeam.name;
    const winnerName = homeForfeit ? awayName : homeName;
    const forfeitingName = homeForfeit ? homeName : awayName;

    // Clean event timeline: kickoff → weather + crowd announcement → player
    // introduction (only for the non-forfeiting side) → forfeit notice → full_time.
    // Mirrors the normal match engine's minute-0 intro sequence so the match
    // page renders a familiar "match preview" for forfeits too.
    const start = new Date(match.scheduledAt);
    const end = new Date(start.getTime() + 90 * 60 * 1000);
    const weather = match.weather ?? 'cloudy';
    const attendance = match.attendance ?? 0;

    const toPlayerInfo = (p: TacticalPlayer) => ({
      name: (p.player as Player).name,
      position: p.positionKey,
    });

    const forfeitEvents: Array<{
      minute: number;
      type: string;
      data?: Record<string, any>;
      eventScheduledTime: Date;
    }> = [
      { minute: 0, type: 'kickoff', eventScheduledTime: start },
      {
        minute: 0,
        type: 'weather_announcement',
        data: {
          weather: weather
            .split('_')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' '),
          weatherKey: weather,
          homeTeam: homeName,
          awayTeam: awayName,
        },
        eventScheduledTime: start,
      },
      {
        minute: 0,
        type: 'attendance_announcement',
        // Crowd size lives on its own event now so the FE renders
        // the attendance line independently of weather. Matches the
        // normal-path engine emission for one-to-one parity.
        data: {
          attendance,
          homeTeam: homeName,
          awayTeam: awayName,
        },
        eventScheduledTime: start,
      },
    ];

    // Player introduction: only emit when at least one team has players
    // (i.e. the non-forfeiting side showed up). Forfeiting side is sent
    // as an empty array — never synthesise fake players.
    const homePlayers = homeForfeit ? [] : homeTacticalPlayers.map(toPlayerInfo);
    const awayPlayers = awayForfeit ? [] : awayTacticalPlayers.map(toPlayerInfo);
    if (homePlayers.length > 0 || awayPlayers.length > 0) {
      forfeitEvents.push({
        minute: 0,
        type: 'player_introduction',
        data: {
          homeTeam: homeName,
          awayTeam: awayName,
          homePlayers,
          awayPlayers,
        },
        eventScheduledTime: start,
      });
    }

    forfeitEvents.push(
      {
        minute: 0,
        type: 'forfeit',
        data: { forfeitingTeam: forfeitingName, winner: winnerName },
        eventScheduledTime: start,
      },
      { minute: 90, type: 'full_time', eventScheduledTime: end },
    );

    await this.dataSource.transaction(async (manager) => {
      await manager.save(match);
      await manager
        .createQueryBuilder()
        .insert()
        .into(MatchEventEntity)
        .values(
          forfeitEvents.map((e) => ({
            matchId: match.id,
            minute: e.minute,
            second: 0,
            type: this.mapEventType(e.type),
            typeName: e.type,
            teamId: null,
            playerId: null,
            relatedPlayerId: null,
            phase: MatchPhase.FIRST_HALF,
            lane: null,
            isHome: null,
            data: e.data ?? {},
            eventScheduledTime: e.eventScheduledTime,
            isRevealed: true,
          })),
        )
        .execute();
    });
  }

  private async handleForfeit(
    match: MatchEntity,
    homeForfeit: boolean,
    awayForfeit: boolean,
  ) {
    match.homeScore = homeForfeit ? 0 : 3;
    match.awayScore = awayForfeit ? 0 : 3;
    match.status = MatchStatus.COMPLETED;
    match.simulationCompletedAt = new Date();
    await this.matchRepository.save(match);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.jobLog.log(`Job ${job.id} completed successfully`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.jobLog.error(`Job ${job.id} failed: ${error.message}`);
  }
}
