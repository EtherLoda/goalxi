import { Injectable, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, LessThanOrEqual, IsNull, Not } from 'typeorm';
import {
  calculateMatchAttendance,
  FanEntity,
  LeagueEntity,
  MatchEntity,
  MatchStatus,
  MatchType,
  MatchTacticsEntity,
  Uuid,
  MatchEventEntity,
  StadiumEntity,
  TacticsPresetEntity,
  WeatherEntity,
  GAME_SETTINGS,
} from '@goalxi/database';

/**
 * Recovery thresholds for stuck matches.
 *
 * - STUCK_IN_PROGRESS_MINUTES: an IN_PROGRESS match with no events past
 *   this many minutes after scheduledAt is considered stuck — the worker
 *   likely crashed or the BullMQ job was lost. Re-enqueue to retry.
 * - STUCK_LOCKED_MINUTES: a TACTICS_LOCKED match whose scheduledAt is
 *   already past this many minutes is similarly stuck.
 * - RECOVERY_JOBID_BUCKET_MS: width of the jobId bucket used to throttle
 *   re-enqueues. Within one bucket, BullMQ rejects duplicate jobIds, so
 *   we re-enqueue at most once per bucket per match.
 * - STALE_SIMULATION_LOCK_MS: a match whose `simulation_started_at` is
 *   older than this is assumed to have a crashed worker — clear the lease
 *   so the next job can claim. Pairs with the atomic claim in
 *   SimulationProcessor (see migration 1723500000000). Should be safely
 *   larger than the slowest possible simulation (engine + transaction).
 */
const STUCK_IN_PROGRESS_MINUTES = 30;
const STUCK_LOCKED_MINUTES = 5;
const RECOVERY_JOBID_BUCKET_MS = 5 * 60 * 1000;
const STALE_SIMULATION_LOCK_MS = 60 * 60 * 1000;

/**
 * Retry budget for the `cup-progress` job.
 *
 * The cup processor is NOT wrapped in a transaction (it issues a
 * sequence of CAS-guarded updates: stamp slot winner → stamp
 * loser elimination → CAS round to completed → build next round).
 * Every step is individually idempotent, so a retry is safe — but
 * the enqueue call site used to set no `attempts` at all, which made
 * every throw a permanent dead-letter: the round stayed `in_progress`
 * and the cup silently stopped advancing.
 *
 * This queue has no reconciliation sweep, so a job that exhausts its
 * attempts is unrecoverable. The `error` log in `completeMatches` is
 * therefore the only signal an operator gets.
 */
const CUP_PROGRESS_ATTEMPTS = 3;

/**
 * How long a COMPLETED match may sit unsettled before
 * `reconcileUnsettledMatches` treats it as a gap rather than a
 * still-in-flight job. Comfortably longer than a normal completion
 * round trip, comfortably shorter than a full matchday.
 */
const RECONCILE_SETTLED_GRACE_MINUTES = 10;

/**
 * Cap on how many unsettled matches one sweep re-enqueues. Keeps a
 * backlog (e.g. the first sweep after deploying the `settled_at`
 * migration against a database with no backfill) from flooding the queue
 * in a single tick; the remainder is picked up on the next minute.
 */
const RECONCILE_BATCH_SIZE = 100;

import { CronLocked } from '../common/cron-lock/cron-lock.decorator';
import { CronLockService } from '../common/cron-lock/cron-lock.service';

@Injectable()
export class MatchSchedulerService {
  @Inject(CronLockService)
  private readonly cronLock!: CronLockService;

  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    @InjectQueue('match-simulation')
    private simulationQueue: Queue,
    @InjectQueue('match-completion')
    private completionQueue: Queue,
    @InjectQueue('cup-progress')
    private cupProgressQueue: Queue,
    @InjectRepository(MatchEntity)
    private matchRepository: Repository<MatchEntity>,
    @InjectRepository(MatchTacticsEntity)
    private tacticsRepository: Repository<MatchTacticsEntity>,
    @InjectRepository(MatchEventEntity)
    private eventRepository: Repository<MatchEventEntity>,
    @InjectRepository(WeatherEntity)
    private weatherRepository: Repository<WeatherEntity>,
    @InjectRepository(TacticsPresetEntity)
    private presetRepository: Repository<TacticsPresetEntity>,
    // For Bug 4: precompute the home-side attendance at preprocess
    // time so the simulator can pick it up before the live page
    // emits the first `attendance_announcement` event. See the
    // comment in `preprocessMatch` below.
    @InjectRepository(StadiumEntity)
    private stadiumRepository: Repository<StadiumEntity>,
    @InjectRepository(FanEntity)
    private fanRepository: Repository<FanEntity>,
    @InjectRepository(LeagueEntity)
    private leagueRepository: Repository<LeagueEntity>,
  ) {}

  /**
   * Scheduler 1: 比赛前预处理
   * - 查找即将到达战术截止时间的比赛
   * - 提取双方战术数据，检查是否弃权
   * - 获取比赛日天气
   * - 将战术数据和弃权状态提交到模拟器队列
   * - 锁定战术并更新比赛状态为 TACTICS_LOCKED
   */
  // The three per-minute crons in this class fire concurrently
  // (see the note above `startMatches`) and are logically
  // independent, so each gets its own lock name. All three already
  // CAS their DB writes; the lock is the belt to that braces.
  @Cron('0 * * * * *', { timeZone: GAME_SETTINGS.CRON_TIME_ZONE }) // Every minute
  @CronLocked('settlement.match.preprocess', { ttlMs: 3 * 60_000 })
  async preprocessMatch() {
    const now = new Date();
    this.logger.debug(
      `[MatchPreprocessScheduler] Running at ${now.toISOString()} - Checking for matches to preprocess`,
    );

    const lockThreshold = new Date(
      now.getTime() + GAME_SETTINGS.MATCH_TACTICS_DEADLINE_MINUTES * 60 * 1000,
    );

    this.logger.debug(
      `[MatchPreprocessScheduler] Looking for matches scheduled before ${lockThreshold.toISOString()} ` +
        `(${GAME_SETTINGS.MATCH_TACTICS_DEADLINE_MINUTES} minutes from now)`,
    );

    const matches = await this.matchRepository.find({
      where: {
        status: MatchStatus.SCHEDULED,
        tacticsLocked: false,
        scheduledAt: LessThanOrEqual(lockThreshold),
      },
    });

    this.logger.debug(
      `[MatchPreprocessScheduler] Query result: Found ${matches.length} match(es) ` +
        `(status=SCHEDULED, tacticsLocked=false, scheduledAt<=${lockThreshold.toISOString()})`,
    );

    if (matches.length === 0) {
      // No new matches to lock — fall through to the recovery scan below.
    } else {
      this.logger.info(
        `[MatchPreprocessScheduler] [ok] Found ${matches.length} match(es) ready for preprocessing`,
      );

      for (const match of matches) {
        try {
          this.logger.info(
            `[MatchPreprocessScheduler] Processing match ${match.id}: ` +
              `${match.homeTeam?.name || 'Home'} vs ${match.awayTeam?.name || 'Away'}, ` +
              `Scheduled: ${match.scheduledAt.toISOString()}`,
          );

          const [homeTactics, awayTactics] = await Promise.all([
            this.getTeamTactics(match.id, match.homeTeamId),
            this.getTeamTactics(match.id, match.awayTeamId),
          ]);

          this.logger.debug(
            `[MatchPreprocessScheduler] Tactics check - ` +
              `Home: ${homeTactics ? '[ok] submitted/default' : '[x] missing'}, ` +
              `Away: ${awayTactics ? '[ok] submitted/default' : '[x] missing'}`,
          );

          // 只要有一方提交了战术（或使用了默认/自动生成阵容），就不判负
          // 只有双方都没有阵容时才判负
          const homeForfeit = !homeTactics;
          const awayForfeit = !awayTactics;

          const matchDate = match.scheduledAt.toISOString().split('T')[0];
          const weather = await this.weatherRepository.findOne({
            where: { date: matchDate, locationId: 'default' },
          });
          // TypeORM `update` ignores `undefined` values in the partial
          // (the column is left untouched), which is exactly what we
          // want when no weather row exists for this date.
          const weatherValue = weather?.actualWeather;

          // Precompute attendance (Bug 4: "Attendance 0" on the live
          // page). Fetches the same three rows the API completion
          // service reads — home stadium + both fan rows — and runs
          // the shared `calculateMatchAttendance` pure function so
          // the value written here is byte-equal to the value the
          // completion service would write 90 minutes later. When
          // any required row is missing (unbuilt stadium, no fan
          // row, league not found) we leave the column null — same
          // gate the completion service uses. The CAS update below
          // (TypeORM ignores `undefined`) won't overwrite a non-null
          // existing value either, so re-running the tick after the
          // simulator already pre-baked a different value is a no-op.
          const attendanceValue =
            await this.computeAttendanceForPreprocess(match);

          // Atomic status-guard update. Without this, two cron ticks
          // could both pass the SCHEDULED-tacticsLocked-false filter
          // before either one calls `save`, then both `save` and
          // both enqueue a simulation job. The second tick's save
          // also overwrites any fields the worker has already
          // written back (e.g. simulationStartedAt on retries).
          // The status-in-WHERE clause makes the update a CAS:
          // it only succeeds while the row is still SCHEDULED.
          const updateResult = await this.matchRepository.update(
            { id: match.id, status: MatchStatus.SCHEDULED },
            {
              status: MatchStatus.TACTICS_LOCKED,
              tacticsLocked: true,
              tacticsLockedAt: now,
              homeForfeit,
              awayForfeit,
              weather: weatherValue,
              attendance: attendanceValue,
            },
          );
          if (!updateResult.affected) {
            this.logger.debug(
              `[MatchPreprocessScheduler] Match ${match.id} status changed under us, skipping enqueue`,
            );
            continue;
          }

          this.logger.info(
            `[MatchPreprocessScheduler] [ok] Match ${match.id} preprocessed and saved to DB`,
          );

          const jobData = {
            matchId: match.id,
            homeTeamId: match.homeTeamId,
            awayTeamId: match.awayTeamId,
            homeTactics: homeTactics || null,
            awayTactics: awayTactics || null,
            homeForfeit,
            awayForfeit,
            matchType: match.type,
            weather: weatherValue,
          };

          this.logger.info(
            `[MatchPreprocessScheduler] 🚀 Queueing simulation job to BullMQ queue 'match-simulation'...`,
          );

          const job = await this.simulationQueue.add('simulate', jobData);

          this.logger.info(
            `[MatchPreprocessScheduler] [ok] Simulation job added to BullMQ! ` +
              `Job ID: ${job.id}, Match ID: ${match.id}`,
          );

          this.logger.info(
            `🔒 Match preprocessed: ${match.id} ` +
              `(${match.homeTeam?.name || 'Home'} vs ${match.awayTeam?.name || 'Away'}). ` +
              `Scheduled: ${match.scheduledAt.toISOString()}. ` +
              `Simulation job ${job.id} queued to BullMQ.`,
          );
        } catch (error) {
          this.logger.error(
            `[MatchPreprocessScheduler] Failed to preprocess match ${match.id}: ${error.message}`,
            error.stack,
          );
        }
      }
    }

    // Recovery scan: re-enqueue simulation for matches stuck in TACTICS_LOCKED
    // past their scheduled start. Catches the case where the BullMQ job was
    // lost (e.g. Redis flush) between enqueue and worker pickup.
    await this.recoverStuckTacticsLockedMatches(now);
  }

  /**
   * Compute the match attendance for a match that has not yet been
   * simulated. Returns `undefined` (so the column stays null) when
   * any required row is missing — the same gate the API completion
   * service uses, so the FE's "no venue / no fans" rendering kicks
   * in for both first-half and post-completion views.
   *
   * Lives in the settlement scheduler because the preprocess tick
   * is where `match.attendance` gets baked into the row; the API
   * service re-derives the same number at completion time and
   * overwrites this column with a fresh draw (the +/- 5% per-match
   * fluctuation is the only source of non-determinism, and
   * overwriting is acceptable for a stat column — see the
   * `calculateStadiumRevenue` docstring).
   */
  private async computeAttendanceForPreprocess(
    match: MatchEntity,
  ): Promise<number | undefined> {
    const [homeStadium, homeFan, awayFan, league] = await Promise.all([
      this.stadiumRepository.findOne({
        where: { teamId: match.homeTeamId },
      }),
      this.fanRepository.findOne({
        where: { teamId: match.homeTeamId },
      }),
      this.fanRepository.findOne({
        where: { teamId: match.awayTeamId },
      }),
      match.leagueId
        ? this.leagueRepository.findOne({
            where: { id: match.leagueId as Uuid },
          })
        : Promise.resolve(null),
    ]);

    // Mirrors `api/src/api/match/match-completion.service.ts:545`.
    if (!homeStadium?.isBuilt || !homeFan) {
      return undefined;
    }

    return calculateMatchAttendance(
      homeFan.totalFans,
      awayFan?.totalFans ?? 0,
      homeFan.fanEmotion,
      awayFan?.fanEmotion ?? 50,
      homeStadium.capacity,
      league?.tier ?? 4,
    );
  }
  /**
   * Find matches stuck in TACTICS_LOCKED whose scheduledAt is already past
   * the grace period, and re-enqueue their simulation job.
   *
   * ## `simulationCompletedAt IS NULL` is load-bearing
   *
   * The simulator deliberately does NOT flip `status` to COMPLETED after
   * simulating — it writes the score + events, stamps
   * `simulationCompletedAt`, and leaves the row `TACTICS_LOCKED` for
   * `completeMatches` to finalise on a later tick. So a freshly-simulated
   * match looks exactly like a stuck one: `TACTICS_LOCKED` with a
   * `scheduledAt` in the past.
   *
   * Without the `simulationCompletedAt IS NULL` filter, this sweep
   * re-enqueued those matches. Both this method and `completeMatches` are
   * `@Cron('0 * * * * *')`, so they run concurrently in the same process
   * and either can win the race on any given minute — meaning a match had
   * up to a 60-second window to be re-simulated. The simulator's guards
   * did not save it:
   *
   *   - `status === COMPLETED` doesn't apply (it's TACTICS_LOCKED);
   *   - the `simulation_started_at` lease is RELEASED in the processor's
   *     `finally`, so the atomic claim succeeds on the second run.
   *
   * The delete-then-reinsert of `match_event` made the EVENT rows look
   * fine, which is why this was invisible. The aggregate writes are `+=`
   * against the freshly-read row and were applied twice:
   * `careerStats.club.matches` / goals / assists / tackles, experience,
   * and `PlayerCompetitionStats.appearances` / starts / goals.
   */
  private async recoverStuckTacticsLockedMatches(now: Date): Promise<void> {
    const stuckThreshold = new Date(
      now.getTime() - STUCK_LOCKED_MINUTES * 60 * 1000,
    );
    const stuckMatches = await this.matchRepository.find({
      where: {
        status: MatchStatus.TACTICS_LOCKED,
        scheduledAt: LessThan(stuckThreshold),
        // Simulated already, awaiting `completeMatches`. Not stuck.
        simulationCompletedAt: IsNull(),
      },
    });

    if (stuckMatches.length === 0) {
      return;
    }

    this.logger.warn(
      `[MatchRecovery] Found ${stuckMatches.length} TACTICS_LOCKED match(es) past scheduledAt with no simulation — re-enqueueing`,
    );

    for (const match of stuckMatches) {
      await this.enqueueSimulationRecovery(match.id);
    }
  }

  /**
   * Enqueue a simulation job for a stuck match with a bucket-based jobId.
   *
   * The jobId encodes a 5-minute time bucket: `recover-${matchId}-${bucket}`.
   * BullMQ rejects duplicate jobIds, so within one bucket we re-enqueue at
   * most once per match — the throttle. The SimulationProcessor is itself
   * idempotent (it short-circuits when match.status is COMPLETED), so a
   * second re-enqueue is safe if the previous recovery actually ran.
   *
   * The payload is rebuilt from the current DB state (not just `{ matchId }`)
   * because the worker reads `homeForfeit`/`awayForfeit`/`weather` from
   * job.data — re-enqueueing with just matchId would silently turn a forfeit
   * match into a real one.
   */
  private async enqueueSimulationRecovery(matchId: string): Promise<void> {
    const bucket = Math.floor(Date.now() / RECOVERY_JOBID_BUCKET_MS);
    const jobId = `recover-${matchId}-${bucket}`;

    const match = await this.matchRepository.findOne({
      where: { id: matchId },
    });
    if (!match) {
      this.logger.warn(
        `[MatchRecovery] Match ${matchId} no longer exists, skipping recovery`,
      );
      return;
    }
    if (match.status === MatchStatus.COMPLETED) {
      this.logger.debug(
        `[MatchRecovery] Match ${matchId} already completed, skipping recovery`,
      );
      return;
    }
    if (match.simulationCompletedAt) {
      // Second line of defence behind the query filter above: the
      // simulator stamps this but leaves `status = TACTICS_LOCKED` for
      // `completeMatches` to finalise. Re-enqueueing here would run the
      // engine a second time — the lease is released in the processor's
      // `finally`, so the atomic claim succeeds — and double-apply every
      // `+=` aggregate (careerStats, PlayerCompetitionStats, experience).
      // The event rows survive that only because the simulator
      // delete-then-reinserts them.
      this.logger.debug(
        `[MatchRecovery] Match ${matchId} is already simulated ` +
          `(simulationCompletedAt=${match.simulationCompletedAt.toISOString()}), ` +
          `awaiting completion — skipping recovery`,
      );
      return;
    }

    const [homeTactics, awayTactics] = await Promise.all([
      this.tacticsRepository.findOne({
        where: { matchId, teamId: match.homeTeamId },
      }),
      this.tacticsRepository.findOne({
        where: { matchId, teamId: match.awayTeamId },
      }),
    ]);

    const jobData = {
      matchId: match.id,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      homeTactics: homeTactics || null,
      awayTactics: awayTactics || null,
      homeForfeit: match.homeForfeit,
      awayForfeit: match.awayForfeit,
      matchType: match.type,
      weather: match.weather || null,
    };

    try {
      await this.simulationQueue.add('simulate', jobData, { jobId });
      this.logger.warn(
        `[MatchRecovery] Re-enqueued simulation for stuck match ${matchId} (jobId=${jobId})`,
      );
    } catch (err) {
      // BullMQ throws on duplicate jobId — that's the throttle working.
      const msg = err instanceof Error ? err.message : String(err);
      if (/already exists|Job with id|duplicate/i.test(msg)) {
        return;
      }
      throw err;
    }
  }

  /**
   * Scheduler 2: 比赛时间到达时标记为进行中
   * - 查找状态为 TACTICS_LOCKED 且到达比赛时间的比赛
   * - 将状态更新为 IN_PROGRESS
   *
   * Why 1 minute (not 30s / 5s):
   *  - All match kickoff times are deterministic and stored
   *    in `scheduledAt` at schedule-creation time. A 1m
   *    scan is enough to flip a match to IN_PROGRESS within
   *    60s of its kickoff — no user-visible latency.
   *  - 1m tolerates `scheduledAt` being edited at runtime
   *    (reschedules, weather delays) without a separate
   *    wake-up. A fixed "0 6 * * 3,6" cron would miss them.
   *  - Matches the cadence of `preprocessMatch` and
   *    `completeMatches` so the three deterministic
   *    schedulers are all in lockstep (one wake-up,
   *    three checks). The recovery scan inside
   *    `preprocessMatch` covers the only "as fast as
   *    possible" case (stuck TACTICS_LOCKED).
   *  - CAS on match.status makes this idempotent; a
   *    slower tick is latency, not correctness.
   */
  @Cron('0 * * * * *', { timeZone: GAME_SETTINGS.CRON_TIME_ZONE }) // Every minute
  @CronLocked('settlement.match.start', { ttlMs: 3 * 60_000 })
  async startMatches() {
    this.logger.debug('[MatchStartScheduler] Checking for matches to start');

    const now = new Date();

    const matches = await this.matchRepository.find({
      where: {
        status: MatchStatus.TACTICS_LOCKED,
        scheduledAt: LessThanOrEqual(now),
      },
    });

    if (matches.length === 0) {
      return;
    }

    this.logger.info(
      `[MatchStartScheduler] Found ${matches.length} match(es) ready to start`,
    );

    for (const match of matches) {
      try {
        // Atomic status-guard update: only flip to IN_PROGRESS while
        // the row is still TACTICS_LOCKED. Without this guard two
        // ticks can both grab the same row, both `save` it, and the
        // second save silently overwrites anything a worker (or the
        // simulation completion path) has already written back.
        const updateResult = await this.matchRepository.update(
          { id: match.id, status: MatchStatus.TACTICS_LOCKED },
          { status: MatchStatus.IN_PROGRESS, startedAt: match.scheduledAt },
        );
        if (!updateResult.affected) {
          this.logger.debug(
            `[MatchStartScheduler] Match ${match.id} status changed under us, skipping`,
          );
          continue;
        }

        this.logger.info(
          `[kickoff] Match started: ${match.homeTeam?.name || 'Home'} vs ${match.awayTeam?.name || 'Away'} ` +
            `(ID: ${match.id}, Scheduled: ${match.scheduledAt.toISOString()})`,
        );
      } catch (error) {
        this.logger.error(
          `[MatchStartScheduler] Failed to start match ${match.id}: ${error.message}`,
          error.stack,
        );
      }
    }
  }

  /**
   * Scheduler 3: 比赛结束后标记为已完成
   * - 查找状态为 IN_PROGRESS 的比赛
   * - 检查最后事件时间，如果已到时间则标记为 COMPLETED
   * - 提交完成任务到结算队列
   */
  @Cron('0 * * * * *', { timeZone: GAME_SETTINGS.CRON_TIME_ZONE }) // Every minute
  @CronLocked('settlement.match.complete', { ttlMs: 3 * 60_000 })
  async completeMatches() {
    this.logger.debug(
      '[MatchCompletionScheduler] Checking for matches to complete',
    );

    const now = new Date();

    // Find IN_PROGRESS matches (normal live matches) and
    // TACTICS_LOCKED matches where simulation has completed but status wasn't updated
    // (simulation processor leaves status as TACTICS_LOCKED, expecting scheduler to finalize)
    const matches = await this.matchRepository.find({
      where: [
        { status: MatchStatus.IN_PROGRESS },
        {
          status: MatchStatus.TACTICS_LOCKED,
          simulationCompletedAt: Not(IsNull()),
        },
      ],
    });

    // Deliberately NOT an early return: the reconciliation sweep below is
    // independent of this scan. An early `if (matches.length === 0)
    // return` would mean the sweep only ever runs on ticks that also
    // happened to finalise a match — so the tick that could recover a
    // stranded match is the one tick most likely to find nothing to do.
    for (const match of matches) {
      try {
        const lastEvent = await this.eventRepository.findOne({
          where: { matchId: match.id },
          order: { eventScheduledTime: 'DESC' },
          select: ['id', 'matchId', 'minute', 'eventScheduledTime'],
        });

        if (!lastEvent || !lastEvent.eventScheduledTime) {
          // Stale lease sweep: if a previous worker set simulation_started_at
          // but crashed before completing, the lease is still held and the
          // next simulation job would skip via the atomic claim. Clear it
          // so the retry can actually run. Past STALE_SIMULATION_LOCK_MS,
          // we treat the holder as dead. The processor's try/finally also
          // releases the lease on the happy path — this sweep only matters
          // for crashed workers.
          if (
            match.simulationStartedAt &&
            now.getTime() - new Date(match.simulationStartedAt).getTime() >
              STALE_SIMULATION_LOCK_MS
          ) {
            await this.matchRepository.update(
              { id: match.id },
              { simulationStartedAt: null },
            );
            this.logger.warn(
              `[MatchRecovery] Cleared stale simulation lock for ${match.id}`,
            );
          }

          // Recovery branch: an IN_PROGRESS match with no events past the
          // grace window is stuck — the simulation job was lost or the
          // worker crashed. Re-enqueue (idempotent in the worker) to give
          // it another chance. Within the grace window we just continue and
          // let the simulation finish; re-enqueueing too eagerly would
          // create duplicate worker invocations for normal slow runs.
          const minutesSinceScheduled =
            (now.getTime() - match.scheduledAt.getTime()) / 60000;
          if (minutesSinceScheduled > STUCK_IN_PROGRESS_MINUTES) {
            await this.enqueueSimulationRecovery(match.id);
          }
          continue;
        }

        if (lastEvent.eventScheduledTime <= now) {
          // Atomic status-guard update. `match.status` here is the
          // value we just read (IN_PROGRESS or TACTICS_LOCKED with
          // simulationCompletedAt set); including it in the WHERE
          // makes this a CAS, so a tick racing the same row to
          // COMPLETED won't double-enqueue the completion job.
          const updateResult = await this.matchRepository.update(
            { id: match.id, status: match.status },
            {
              status: MatchStatus.COMPLETED,
              completedAt: lastEvent.eventScheduledTime,
              actualEndTime: lastEvent.eventScheduledTime,
            },
          );
          if (!updateResult.affected) {
            this.logger.debug(
              `[MatchCompletionScheduler] Match ${match.id} status changed under us, skipping completion enqueue`,
            );
            continue;
          }

          await this.completionQueue.add(
            'complete-match',
            { matchId: match.id },
            { jobId: `complete-${match.id}` },
          );

          this.logger.info(
            `[done] Match completed: ${match.homeTeam?.name || 'Home'} ${match.homeScore || 0} - ` +
              `${match.awayScore || 0} ${match.awayTeam?.name || 'Away'} ` +
              `(ID: ${match.id})`,
          );

          // Cup bracket closeout runs on its own queue. `match-completion`
          // is consumed by the API's `MatchCompletionProcessor` (standings,
          // ELO, fan/revenue, minutes); if the cup processor shared that
          // queue the two workers would compete and each job would only be
          // seen by one of them. See `cup.module.ts`.
          //
          // Deliberately AFTER the log + outside the completion enqueue:
          // the match is already COMPLETED by this point, so a failure
          // here cannot be retried by this cron — `reconcileUnsettledMatches`
          // is the safety net (it re-enqueues on `settled_at IS NULL`).
          // Log loudly and move on rather than letting a Redis blip on
          // the second queue hide the fact that the match itself
          // completed.
          if (match.type === MatchType.CUP) {
            try {
              await this.cupProgressQueue.add(
                'complete-match',
                { matchId: match.id },
                {
                  jobId: `cup-complete-${match.id}`,
                  attempts: CUP_PROGRESS_ATTEMPTS,
                  backoff: { type: 'exponential', delay: 60_000 },
                },
              );
            } catch (cupError) {
              this.logger.error(
                `[MatchCompletionScheduler] FAILED to enqueue cup progression for match ${match.id}: ${cupError.message}. ` +
                  `The bracket will NOT advance for this cup match. The ` +
                  `reconciliation sweep re-enqueues any match that stays ` +
                  `unsettled, so this should self-heal; if the match is ` +
                  `already marked settled, re-enqueue manually with jobId ` +
                  `"cup-complete-${match.id}".`,
                cupError.stack,
              );
            }
          }
        }
      } catch (error) {
        this.logger.error(
          `[MatchCompletionScheduler] Failed to complete match ${match.id}: ${error.message}`,
          error.stack,
        );
      }
    }

    // Safety net for matches that were flipped to COMPLETED but whose
    // settlement job never landed. See `reconcileUnsettledMatches`.
    await this.reconcileUnsettledMatches(now);
  }

  /**
   * Re-enqueue settlement for matches that are COMPLETED but unsettled.
   *
   * ## The hole this closes
   *
   * `completeMatches` scans `IN_PROGRESS` and `TACTICS_LOCKED +
   * simulationCompletedAt NOT NULL`, then does two separate statements:
   * a status CAS to COMPLETED, and a `queue.add`. A crash between them
   * leaves a row that is COMPLETED but has never been settled — and
   * permanently invisible, because the next scan no longer matches it.
   *
   * Recovery by hand did not work either: `jobId: complete-${match.id}`
   * still exists in Redis (no `removeOnComplete` on that queue), so
   * re-adding is a silent BullMQ no-op; and the only settlement guard
   * was a Redis key with a **24h TTL**, so after 24h a duplicate
   * re-applied standings, ELO, minutes, fan emotion and ticket revenue.
   *
   * `match.settledAt` (migration 1788000000030) is the durable receipt:
   * `MatchCompletionService` stamps it only after every mutation
   * commits, so `status = COMPLETED AND settled_at IS NULL` is exactly
   * the set of matches needing (re)settlement.
   *
   * ## Why re-enqueueing is safe
   *
   * `completeMatch` short-circuits on `settledAt`, so a match settled by
   * the original job is skipped rather than re-applied. A match that
   * genuinely failed mid-way has `settledAt IS NULL` and is re-run from
   * the top; `updateLeagueStandings` is now transactional and the Redis
   * key still covers the 24h fast path.
   *
   * The jobId is suffixed with a time bucket so a stuck match is
   * re-enqueued at most once per bucket instead of every minute — the
   * same throttle `enqueueSimulationRecovery` uses. `removeOnComplete` /
   * `removeOnFail` free the key so a later attempt isn't blocked by an
   * old job record.
   */
  private async reconcileUnsettledMatches(now: Date): Promise<void> {
    // Only look at matches that have been COMPLETED long enough that a
    // missing settlement is a real gap rather than a job still in flight.
    const settledThreshold = new Date(
      now.getTime() - RECONCILE_SETTLED_GRACE_MINUTES * 60 * 1000,
    );

    const unsettled = await this.matchRepository.find({
      where: {
        status: MatchStatus.COMPLETED,
        settledAt: IsNull(),
        completedAt: LessThan(settledThreshold),
      },
      select: ['id', 'type'],
      take: RECONCILE_BATCH_SIZE,
    });

    if (unsettled.length === 0) {
      return;
    }

    this.logger.warn(
      `[MatchReconcile] Found ${unsettled.length} COMPLETED but unsettled match(es) — re-enqueueing settlement`,
    );

    const bucket = Math.floor(now.getTime() / RECOVERY_JOBID_BUCKET_MS);

    for (const match of unsettled) {
      try {
        await this.completionQueue.add(
          'complete-match',
          { matchId: match.id },
          {
            // Bucketed so a permanently-failing match retries once per
            // bucket instead of every minute. The base `completeMatches`
            // enqueue uses an unbucketed id, so a normal in-flight job
            // never collides with this.
            jobId: `reconcile-complete-${match.id}-${bucket}`,
            attempts: 3,
            backoff: { type: 'exponential', delay: 60_000 },
            removeOnComplete: { age: 3600, count: 500 },
            removeOnFail: { age: 24 * 3600 },
          },
        );
        // A CUP match's bracket advance lives on its own queue and keys
        // off the same settlement event, so it needs re-driving too.
        if (match.type === MatchType.CUP) {
          await this.cupProgressQueue.add(
            'complete-match',
            { matchId: match.id },
            {
              jobId: `reconcile-cup-${match.id}-${bucket}`,
              attempts: CUP_PROGRESS_ATTEMPTS,
              backoff: { type: 'exponential', delay: 60_000 },
              removeOnComplete: { age: 3600, count: 500 },
              removeOnFail: { age: 24 * 3600 },
            },
          );
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (/already exists|Job with id|duplicate/i.test(msg)) {
          // BullMQ rejected a duplicate jobId — the bucket throttle is
          // working, i.e. we already re-enqueued this match this bucket.
          continue;
        }
        this.logger.error(
          `[MatchReconcile] Failed to re-enqueue settlement for match ${match.id}: ${msg}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }

  /**
   * 获取球队阵容：优先使用比赛提交的战术，其次尝试默认阵型预设
   */
  private async getTeamTactics(
    matchId: string,
    teamId: string,
  ): Promise<MatchTacticsEntity | null> {
    // 1. 查找比赛提交的战术
    const matchTactics = await this.tacticsRepository.findOne({
      where: { matchId, teamId },
    });
    if (matchTactics) {
      return matchTactics;
    }

    // 2. 查找球队默认阵型预设
    const defaultPreset = await this.presetRepository.findOne({
      where: { teamId, isDefault: true },
    });
    if (defaultPreset) {
      this.logger.debug(
        `[MatchPreprocessScheduler] Using default preset for team ${teamId}`,
      );
      return this.presetToMatchTactics(defaultPreset, matchId, teamId);
    }

    // 3. 没有预设则返回 null（将判负）
    return null;
  }

  /**
   * 将战术预设转换为比赛战术实体并持久化
   */
  private async presetToMatchTactics(
    preset: TacticsPresetEntity,
    matchId: string,
    teamId: string,
  ): Promise<MatchTacticsEntity> {
    const tactics = new MatchTacticsEntity();
    tactics.matchId = matchId;
    tactics.teamId = teamId;
    tactics.presetId = preset.id;
    tactics.formation = preset.formation;
    // Legacy `lineup`/`substitutions` columns were emptied by the player.id
    // uuid→int migration; the new v2 columns hold the int-keyed payload.
    tactics.lineup = {};
    tactics.lineupV2 = preset.lineupV2;
    tactics.instructions = preset.instructions;
    tactics.substitutions = null;
    tactics.substitutionsV2 = preset.substitutionsV2;
    tactics.submittedAt = new Date();
    // [Bug fix 2026-08-18] Originally this method only constructed the
    // entity in memory and returned it; the preprocessor's "fall back to
    // default preset" path therefore never persisted the row. The sim
    // worker reads `match_tactics` from the DB and threw "Tactics
    // missing" for every match where both teams relied on the fallback
    // (i.e. all BOT-vs-BOT matches in the very first week). Save here
    // so the row is actually written.
    return this.tacticsRepository.save(tactics);
  }
}
