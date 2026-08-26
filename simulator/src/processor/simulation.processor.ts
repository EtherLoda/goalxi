import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Inject, Injectable } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In, EntityManager } from 'typeorm';
import {
  MatchEntity,
  MatchEventEntity,
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
  // RFC 0002 — Two-Axis Event Coding class ids. INJURY=9,
  // used in the injury-event query below (the legacy
  // MatchEventType.INJURY int is gone in Phase 3).
  EventClassId,
  toSimulationPlayer,
  applyInjuryBatch,
  StaffEntity,
  StaffRole,
  calculateMatchExperience,
  addExperience,
  Uuid,
  competitionTypeForMatch,
  // RFC 0002 — Two-Axis Event Coding. The processor uses the
  // hot-path TS mirror (`getEventTwoAxis`) to look up the
  // (classId, outcomeId, outcomeCode) tuple for each event's
  // `type` string. See
  // `libs/database/src/constants/event-two-axis.ts`.
  getEventTwoAxis,
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

  /**
   * Compute the real-world offset (ms from `match.scheduledAt`) for an
   * event, given the engine's actual stoppage times and the match's
   * ET flag.
   *
   * The math has to thread the cumulative stoppage through the break
   * boundary correctly:
   *
   *   - 1H regulation (0..45 min label)        → 0..45 real min
   *   - 1H injury    (46..45+N1 min label)     → 46..(45+N1) real min
   *   - 1H whistle   (45+N1 min label)         → (45+N1) real min
   *   - HT break                                  15 min, CONSTANT
   *   - 2H kickoff  (46 min label)             → 60 real min
   *   - 2H regulation (47..90 min label)       → 62..105 real min
   *   - 2H injury    (91..(90+M) min label)    → 106..(105+M) real min
   *   - 2H whistle  ((90+M) min label)         → (105+M) real min
   *
   *   - ET kickoff  (90 min label)             → 105 real min
   *   - ET 1H regulation (91..105)             → 106..120 real min
   *   - ET 1H injury (106..(105+N2))           → 121..(120+N2) real min
   *   - ET 1H whistle ((105+N2) min label)     → (120+N2) real min
   *   - ET break                                   5 min, CONSTANT
   *   - ET 2H kickoff (105 min label)          → (125+N2) real min
   *   - ET 2H regulation (106..120)            → (126+N2)..(140+N2) real min
   *   - ET 2H injury (121..(120+M2))           → (141+N2)..(140+N2+M2) real min
   *   - ET FT whistle ((120+M2) min label)     → (140+N2+M2) real min
   *
   * The pre-2H break (`HT = 15 min`) and the pre-ET-2H break
   * (`ET_BREAK = 5 min`) are CONSTANT — real football doesn't extend
   * them based on how much injury time was added. The breaks therefore
   * don't depend on N1 or N2.
   *
   * What DOES cascade is the *elapsed real time* before the next
   * phase. The 1H injury (N1) sits BEFORE the HT break, so it does
   * NOT shift any 2H event — the 2H kickoff is always at real 60
   * (45 + 15 HT) regardless of N1. The ET 1H injury (N2), however,
   * sits BEFORE the ET break, so it DOES shift every ET 2H event
   * (kickoff + regulation + injury + FT) by +N2 real minutes. This
   * is the subtle invariant the previous version got wrong: the
   * "ET 2H" arms computed real time as if N2 = 0, putting the FT
   * whistle `15 + N2` minutes too early in any match with ET 1H
   * stoppage.
   *
   * Pure / static so the verification spec can call it directly
   * without spinning up a Nest container or a BullMQ worker.
   */
  static computeEventRealTimeMs(
    event: MatchEvent,
    phase:
      | 'pre_1h'
      | 'post_1h'
      | 'pre_et1'
      | 'post_et1',
    ctx: {
      hasExtraTime: boolean;
      firstHalfInjuryTime: number;
      secondHalfInjuryTime: number;
      extraTimeFirstHalfInjury: number;
      extraTimeSecondHalfInjury: number;
    },
  ): number {
    const eventMinute = event.minute;
    const eventType = event.type;
    const dataPeriod = event.data?.period;

    // Type predicates on the wire shape the engine emits. Centralized
    // here so the if/else chain reads against named conditions.
    const isSecondHalfKickoff =
      eventMinute === 46 &&
      eventType === 'second_half' &&
      dataPeriod === 'second_half';
    const isExtraTimeKickoff =
      eventMinute === 90 &&
      eventType === 'kickoff' &&
      dataPeriod === 'extra_time';
    const isExtraTimeSecondHalfKickoff =
      eventMinute === 105 &&
      eventType === 'kickoff' &&
      dataPeriod === 'extra_time_second_half';
    const isHalfTimeWhistle = eventType === 'half_time';
    const isFullTimeWhistle = eventType === 'full_time';

    const HT = GAME_SETTINGS.MATCH_HALF_TIME_MINUTES;
    const ET_BREAK = GAME_SETTINGS.MATCH_EXTRA_TIME_BREAK_MINUTES;
    const N1 = ctx.firstHalfInjuryTime;
    const M = ctx.secondHalfInjuryTime;
    const N2 = ctx.extraTimeFirstHalfInjury;
    const M2 = ctx.extraTimeSecondHalfInjury;

    const MIN = 60 * 1000;

    // Pre-boundary clock-end minutes (used by the override block
    // below the if/else). Computed once instead of per-branch to
    // keep the if/else body linear.
    const firstHalfEndMinute = 45 + N1;
    const etFirstHalfEndMinute = 105 + N2;

    let realWorldOffset = 0;

    if (phase === 'pre_1h') {
      if (eventMinute < 45) {
        // 1H regulation (0..44): direct mapping, no break.
        realWorldOffset = eventMinute * MIN;
      } else if (eventMinute === 45 && !isSecondHalfKickoff) {
        // 1H minute-45 event (no injury). Anything at exactly
        // 45 min before the whistle lands here; the whistle is
        // handled by the isHalfTimeWhistle override below.
        realWorldOffset = 45 * MIN;
      } else if (isSecondHalfKickoff) {
        // 2H kickoff: 45 min play + 15 min HT = 60 min real.
        realWorldOffset = (45 + HT) * MIN;
      } else {
        // 1H injury-time event (46..45+N1-1). These minutes
        // happen before the half-time whistle, so no HT-break
        // offset should be added.
        realWorldOffset = eventMinute * MIN;
      }
    } else if (phase === 'post_1h') {
      if (isSecondHalfKickoff) {
        // 2H kickoff (defensive — engine emits this in
        // post_1h phase, but the value matches pre_1h).
        realWorldOffset = (45 + HT) * MIN;
      } else if (eventMinute <= 90) {
        // 2H regulation (46..90): minute + HT. Note N1 does
        // not shift this — the HT break is constant.
        realWorldOffset = (eventMinute + HT) * MIN;
      } else {
        // 2H injury (91..(90+M)) and the 2H full-time
        // whistle (at minute 90+M). Same formula.
        realWorldOffset = (eventMinute + HT) * MIN;
      }
    } else if (phase === 'pre_et1') {
      if (isExtraTimeKickoff) {
        // ET kickoff: 90 min 2H play + 15 HT = 105 min real.
        realWorldOffset = (90 + HT) * MIN;
      } else if (eventMinute < 105) {
        // ET 1H regulation (91..104): 2H end (105) +
        // (eventMinute - 90) ET minutes.
        realWorldOffset = (90 + HT + (eventMinute - 90)) * MIN;
      } else {
        // ET 1H injury-time event (106..105+N2-1). Same
        // formula as ET 1H regulation — before the ET
        // half-time whistle, no ET-break offset.
        realWorldOffset =
          (90 + HT + (eventMinute - 90)) * MIN;
      }
    } else {
      // phase === 'post_et1'
      if (isExtraTimeSecondHalfKickoff) {
        // ET 2H kickoff: 2H end (105) + ET 1H (15) + ET 1H
        // injury (N2) + ET break (5). N2 is the load-bearing
        // term — pre-fix the processor dropped it and put the
        // kickoff `N2` minutes too early whenever ET 1H had
        // any stoppage.
        realWorldOffset =
          (90 + HT + 15 + N2 + ET_BREAK) * MIN;
      } else if (eventMinute <= 120) {
        // ET 2H regulation (106..120).
        realWorldOffset =
          (90 + HT + 15 + N2 + ET_BREAK + (eventMinute - 105)) * MIN;
      } else {
        // ET 2H injury (121..(120+M2)) and the ET full-time
        // whistle at (120+M2). Same formula.
        realWorldOffset =
          (90 + HT + 15 + N2 + ET_BREAK + (eventMinute - 105)) * MIN;
      }
    }

    // Overrides for half-time whistle events. The whistle blows
    // at a specific in-game minute, BEFORE the subsequent break,
    // so the break's time hasn't elapsed yet. The exact value
    // depends on which whistle:
    //
    //   - 1H whistle at minute (45+N1): the 15-min HT is
    //     *after* this event, so real time = in-game minute.
    //   - ET 1H whistle at minute (105+N2): the 15-min HT is
    //     *before* this event (it elapsed between 1H end and
    //     ET start), so real time = in-game minute + 15.
    if (isHalfTimeWhistle) {
      const isEt1Whistle = dataPeriod === 'extra_time_half_time';
      realWorldOffset = isEt1Whistle
        ? (eventMinute + HT) * MIN
        : eventMinute * MIN;
    }

    return realWorldOffset;
  }

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

  /**
   * [RFC 0002 P3 tripwire] Pre-flight every event through
   * `getEventTwoAxis` and throw with a clear, actionable error
   * if any event's `type` has no mapping. Pure / static so the
   * spec can call it directly without spinning up a Nest
   * container or a BullMQ worker.
   *
   * Background: migration 1788000000002 made `event_class_id`
   * NOT NULL. A future engine emit that lands here without a
   * corresponding row in `EVENT_TWO_AXIS` would otherwise
   * 5xx with a cryptic PG `violates not-null constraint` error
   * — the worker can't tell *which* event is the culprit
   * without re-running the whole match and grepping the
   * typeNames. The pre-flight names the offending typeName(s)
   * and points the fix at the map file.
   *
   * Throws are intentional: a no-throw `if (unmapped) logger.warn`
   * would let the broken event pass through to the bulk insert
   * and surface as the same PG error. Failing loud here is
   * strictly better — BullMQ will retry the job, the retry will
   * hit the same error, and the operator can see the typeName
   * in the simulator logs to know exactly which `EVENT_TWO_AXIS`
   * row to add.
   *
   * @param events  The events to pre-flight. Accepts any
   *                `{ type: string | null | undefined }[]`
   *                shape — the function only reads `.type`.
   * @param matchId The match id, embedded in the error for log
   *                triage. Optional — pass `'<unknown>'` when
   *                called outside a match context.
   * @param path    Free-form label for the call site, embedded
   *                in the error message. The processor calls
   *                this with `'simulation'` (main path) or
   *                `'forfeit'` (forfeit path).
   */
  static assertAllEventsMapped(
    events: ReadonlyArray<{ type?: string | null }>,
    matchId: string,
    path: 'simulation' | 'forfeit',
  ): void {
    const unmapped = new Set<string>();
    for (const e of events) {
      if (e.type != null && getEventTwoAxis(e.type).classId == null) {
        unmapped.add(e.type);
      }
    }
    if (unmapped.size > 0) {
      const sample = Array.from(unmapped).slice(0, 5);
      const ellipsis = unmapped.size > 5 ? ', ...' : '';
      throw new Error(
        `[${path}] match=${matchId} produced ${events.length} events; ` +
          `${unmapped.size} distinct typeName(s) have no EVENT_TWO_AXIS ` +
          `mapping: ${sample.join(', ')}${ellipsis}. Add a row to ` +
          `EVENT_TWO_AXIS in libs/database/src/constants/event-two-axis.ts ` +
          `(classId + outcomeId tuple) and update event-two-axis.spec.ts.`,
      );
    }
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
      // RFC 0002 Phase 3 — `type: MatchEventType.INJURY` (the
      // legacy int) is gone. The INJURY class id is 9
      // (see `event_class_def` in the migration 1788000000001
      // seed data). The two-axis tuple is the single source.
      where: { matchId: matchId, eventClassId: 9 as EventClassId },
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
    //
    // `lineupV2` carries BOTH pitch slots (11 keys, e.g. `CBL`, `GK`,
    // `LW`) and bench slots (`BENCH_GK`, `BENCH_CB`, ...). The engine
    // treats both as starters unless we filter the `BENCH_*` keys
    // here, which inflates the per-team count to 16-17 and the
    // `player_introduction` commentary template ("双方球员就位！{n}
    // vs {m} 名球员") reads e.g. "13 vs 12" instead of "11 vs 11"
    // whenever one team fields a 12-striker formation (4-3-3 /
    // 4-2-3-1 / 5-3-2) and the other fields an 11-striker (4-4-2 /
    // 3-5-2). The bench players are added back via `substitutionsV2`
    // below — they enter the pitch through the swap path, not
    // through the initial roster.
    const pitchLineupIds = (
      lineup: Record<string, number> | null | undefined,
    ): number[] => {
      if (!lineup) return [];
      const out: number[] = [];
      for (const [slot, id] of Object.entries(lineup)) {
        if (slot.startsWith('BENCH_')) continue;
        if (typeof id !== 'number') continue;
        out.push(id);
      }
      return out;
    };
    const homeStarterIds = pitchLineupIds(homeTactics.lineupV2);
    const awayStarterIds = pitchLineupIds(awayTactics.lineupV2);
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

    // Read the editor's slot key first (canonical, e.g. `CBL` / `CMR`),
    // then split it into two fields:
    //   - `positionKey`  — family-folded (`CB` / `CM`) the engine's
    //     POSITION_WEIGHTS matrix and swap math consumes.
    //   - `lineupSlotKey` — the original canonical key, round-tripped
    //     back to the FE in the snapshot's `p` field. Without this,
    //     the FE's `toPitchSlot` alias map (`CB -> CBL`, `CM -> CML`)
    //     collapses every CB / CM / CF family to a single marker
    //     coordinate, so a 3-CB team visually stacks all 3 players
    //     on the same `CBL` dot. The original `p` was already a family
    //     key (Bug 3: "CBC / CMC overlap"); carrying the canonical key
    //     through fixes that without touching engine internals.
    const slotKeyFor = (
      lineup: Record<string, number> | null | undefined,
      pid: number,
    ): string => this.findPositionInLineup(lineup, pid) ?? 'ST';

    const homeTacticalPlayers: TacticalPlayer[] = validHomeIds.map((pid) => {
      const slotKey = slotKeyFor(homeTactics.lineupV2, pid);
      return {
        player: toSimulationPlayer(allPlayers.find((p) => p.id === pid)),
        // Family-folded for the engine (POSITION_WEIGHTS keyed by family).
        positionKey: normalizePositionKey(slotKey),
        // Canonical round-trip for the FE so each of the 3 CBs lands
        // on its own slot. Survives sub / swap / position_swap because
        // the engine never mutates this field — the family key
        // (`positionKey`) is what the swap path reassigns.
        lineupSlotKey: slotKey,
      };
    });

    const awayTacticalPlayers: TacticalPlayer[] = validAwayIds.map((pid) => {
      const slotKey = slotKeyFor(awayTactics.lineupV2, pid);
      return {
        player: toSimulationPlayer(allPlayers.find((p) => p.id === pid)),
        positionKey: normalizePositionKey(slotKey),
        lineupSlotKey: slotKey,
      };
    });

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
    // The actual real-time math is in
    // `SimulationProcessor.computeEventRealTimeMs` (a pure static
    // method we can unit-test without spinning up Nest).
    // Track which half the current event belongs to. The engine
    // emits events in array order — first 1H (including 1H
    // injury), then a `half_time` whistle, then 2H (including
    // 2H injury), then a `full_time` whistle. For ET matches
    // the cycle repeats: ET 1H, ET 1H injury, ET `half_time`,
    // ET 2H, ET 2H injury, ET `full_time`. The `inGamePhase`
    // we pass to `computeEventRealTimeMs` mirrors this — the
    // current in-game phase flips each time we see a `half_time`
    // or `full_time` whistle (or, for ET, each new kickoff
    // variant).
    //
    // Why state instead of inferring from `eventMinute` alone:
    // 1H injury (minute 46..50) and 2H regulation (minute 46..90)
    // share the same minute range, and ET 1H injury (106..110)
    // shares the same range as ET 2H regulation (106..120). The
    // function can't disambiguate from the event alone — it
    // needs to know which "phase" the current event falls in.
    let inGamePhase:
      | 'pre_1h'
      | 'post_1h'
      | 'pre_et1'
      | 'post_et1' = 'pre_1h';
    for (const event of events) {
      // Phase transitions: a `half_time` event marks the end of
      // the current regulation half; a `full_time` event ends
      // the current match (or ET).
      if (event.type === 'half_time') {
        const realWorldOffset = SimulationProcessor.computeEventRealTimeMs(
          event,
          inGamePhase,
          {
            hasExtraTime: match.hasExtraTime,
            firstHalfInjuryTime,
            secondHalfInjuryTime,
            extraTimeFirstHalfInjury: engine.extraTimeFirstHalfInjury || 0,
            extraTimeSecondHalfInjury: engine.extraTimeSecondHalfInjury || 0,
          },
        );
        event.eventScheduledTime = new Date(
          matchStartTimeUTC.getTime() + realWorldOffset,
        );
        // Advance to the next phase: post-1H or post-ET-1H
        // (depending on whether we were in the 1H half or
        // the ET 1H half).
        inGamePhase = inGamePhase === 'pre_1h' ? 'post_1h' : 'post_et1';
        continue;
      }
      if (event.type === 'full_time') {
        const realWorldOffset = SimulationProcessor.computeEventRealTimeMs(
          event,
          inGamePhase,
          {
            hasExtraTime: match.hasExtraTime,
            firstHalfInjuryTime,
            secondHalfInjuryTime,
            extraTimeFirstHalfInjury: engine.extraTimeFirstHalfInjury || 0,
            extraTimeSecondHalfInjury: engine.extraTimeSecondHalfInjury || 0,
          },
        );
        event.eventScheduledTime = new Date(
          matchStartTimeUTC.getTime() + realWorldOffset,
        );
        // `full_time` ends the match. For non-ET, that's after
        // `post_1h`; for ET, after `post_et1`. Nothing comes
        // after a `full_time` in the same match (the penalty
        // shootout emits its own `full_time` at the end with
        // `isPenalty: true`, and the for-loop processes that
        // too — we keep the phase but the result is the same
        // because the function is keyed on the current
        // `inGamePhase`).
        continue;
      }
      // For the ET transition: when the engine emits the
      // `kickoff` event with `data.period === 'extra_time'`,
      // we're entering ET 1H. The `eventMinute === 90` for
      // that event, and the function returns the ET kickoff
      // real time. After processing it, advance to `pre_et1`.
      if (
        event.type === 'kickoff' &&
        event.data?.period === 'extra_time' &&
        inGamePhase === 'post_1h'
      ) {
        const realWorldOffset = SimulationProcessor.computeEventRealTimeMs(
          event,
          inGamePhase,
          {
            hasExtraTime: match.hasExtraTime,
            firstHalfInjuryTime,
            secondHalfInjuryTime,
            extraTimeFirstHalfInjury: engine.extraTimeFirstHalfInjury || 0,
            extraTimeSecondHalfInjury: engine.extraTimeSecondHalfInjury || 0,
          },
        );
        event.eventScheduledTime = new Date(
          matchStartTimeUTC.getTime() + realWorldOffset,
        );
        inGamePhase = 'pre_et1';
        continue;
      }

      const realWorldOffset = SimulationProcessor.computeEventRealTimeMs(
        event,
        inGamePhase,
        {
          hasExtraTime: match.hasExtraTime,
          firstHalfInjuryTime,
          secondHalfInjuryTime,
          extraTimeFirstHalfInjury: engine.extraTimeFirstHalfInjury || 0,
          extraTimeSecondHalfInjury: engine.extraTimeSecondHalfInjury || 0,
        },
      );

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
      //
      // [RFC 0002 P3 tripwire] Pre-flight every event through
      // `getEventTwoAxis` BEFORE the bulk insert. If the engine
      // pushed a `type` string that's not in EVENT_TWO_AXIS,
      // `getEventTwoAxis` returns the null tuple (classId=null),
      // and migration 1788000000002 made `event_class_id` NOT
      // NULL — the bulk insert would 5xx with a cryptic PG
      // "violates not-null constraint" error. The first time
      // this fired in production was 2026-08-26 on a
      // `recover-${matchId}-${bucket}` job (see
      // settlement/src/scheduler/match-scheduler.service.ts),
      // where the engine emitted `'tactical_change'` for a
      // position_swap tactical instruction — the map had no
      // entry. Catching it here surfaces a clear error that
      // names the offending typeName and points the fix at
      // `EVENT_TWO_AXIS`, instead of dumping the worker with
      // an opaque PG error.
      SimulationProcessor.assertAllEventsMapped(events, match.id, 'simulation');

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
              // RFC 0002 Phase 3 — the legacy `type` int column is
              // DROPPED. The single source of truth for the event
              // classification is the (eventClassId, outcomeId,
              // outcomeCode) tuple below, derived from `e.type`
              // (the engine's lower_snake string) via
              // `getEventTwoAxis`.
              //
              // The `typeName` column is KEPT (1:1 mirror of
              // `e.type`) because the wire format is context-
              // sensitive in ways the tuple can't capture
              // (PERIOD+END can be 'half_time' or 'full_time';
              // SHOT+MISS can be 'miss' or 'turnover'). The FE
              // uses `e.typeName` directly in commentary
              // templates and EVENT_COLOR / EVENT_ICON lookups.
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
              // RFC 0002 — Two-Axis Event Coding. The lookup is O(1)
              // via `getEventTwoAxis` (TS map mirror of the SQL
              // backfill function — kept in sync by unit spec).
              eventClassId: getEventTwoAxis(e.type).classId,
              outcomeId: getEventTwoAxis(e.type).outcomeId,
              outcomeCode: getEventTwoAxis(e.type).outcomeCode,
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
    // Bucket the row once per match (youth/cup/league/other) so
    // each per-player create picks up the same discriminator.
    // `competitionTypeForMatch` consults `match.youthLeagueId`
    // first, then `match.type`, so youth matches don't get
    // mis-labelled as senior league just because the
    // scheduler writes `match.type = 'league'` for them.
    const competitionType = competitionTypeForMatch(match);

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
          // Discriminator for the league/cup/youth split. The
          // migration backfills existing rows; from now on the
          // simulator owns the value.
          competitionType,
          goals: 0,
          assists: 0,
          tackles: 0,
          yellowCards: 0,
          redCards: 0,
          starts: 0,
          substituteAppearances: 0,
          appearances: 0,
          shots: 0,
          saves: 0,
          minutes: 0,
        });
      }

      // Update stats using playerStatsMap (which comes from match report)
      compStats.goals += stats.goals || 0;
      compStats.assists += stats.assists || 0;
      compStats.tackles += stats.tackles || 0;
      compStats.shots += stats.shots || 0;
      compStats.saves += stats.saves || 0;
      compStats.minutes += stats.minutesPlayed || 0;
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

  // RFC 0002 Phase 3 — `mapEventType` removed. The legacy
  // `type` int column is dropped, so there's no need to map
  // engine strings to MatchEventType enum values. The
  // `getEventTwoAxis(e.type)` helper (used in the bulk
  // insert above) is now the single translation layer from
  // the engine's lower_snake string to the DB tuple.

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

    // [RFC 0002 P3 tripwire] Same fail-fast as the main path —
    // see the comment at the main bulk-insert site. The forfeit
    // path's events are all hardcoded ('forfeit', 'full_time',
    // 'weather_announcement', etc.) so the check is defensive
    // belt-and-braces; if a future contributor adds a new hard-
    // coded type to the forfeit path without updating the map,
    // this catches it at insert time.
    SimulationProcessor.assertAllEventsMapped(forfeitEvents, match.id, 'forfeit');

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
            // RFC 0002 Phase 3 — same dual-write as the main
            // bulk-insert path. The forfeit event's `e.type` is
            // always 'forfeit' (or 'full_time' / 'match_start'),
            // all of which have entries in the EVENT_TWO_AXIS
            // mapping.
            teamId: null,
            playerId: null,
            relatedPlayerId: null,
            phase: MatchPhase.FIRST_HALF,
            lane: null,
            isHome: null,
            data: e.data ?? {},
            eventScheduledTime: e.eventScheduledTime,
            isRevealed: true,
            // RFC 0002 Phase 3 — same as the main bulk-insert
            // path. The legacy `type` int is gone; `typeName`
            // stays as the wire format.
            typeName: e.type,
            eventClassId: getEventTwoAxis(e.type).classId,
            outcomeId: getEventTwoAxis(e.type).outcomeId,
            outcomeCode: getEventTwoAxis(e.type).outcomeCode,
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
