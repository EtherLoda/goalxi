import { Injectable, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, LessThanOrEqual } from 'typeorm';
import {
  MatchEntity,
  MatchTacticsEntity,
  MatchEventEntity,
  MatchStatus,
  WeatherEntity,
  TacticsPresetEntity,
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

@Injectable()
export class MatchSchedulerService {
  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    @InjectQueue('match-simulation')
    private simulationQueue: Queue,
    @InjectQueue('match-completion')
    private completionQueue: Queue,
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
  ) {}

  /**
   * Scheduler 1: 比赛前预处理
   * - 查找即将到达战术截止时间的比赛
   * - 提取双方战术数据，检查是否弃权
   * - 获取比赛日天气
   * - 将战术数据和弃权状态提交到模拟器队列
   * - 锁定战术并更新比赛状态为 TACTICS_LOCKED
   */
  @Cron('0 * * * * *') // Every minute
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
        `[MatchPreprocessScheduler] ✅ Found ${matches.length} match(es) ready for preprocessing`,
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
              `Home: ${homeTactics ? '✅ submitted/default' : '❌ missing'}, ` +
              `Away: ${awayTactics ? '✅ submitted/default' : '❌ missing'}`,
          );

          // 只要有一方提交了战术（或使用了默认/自动生成阵容），就不判负
          // 只有双方都没有阵容时才判负
          match.homeForfeit = !homeTactics;
          match.awayForfeit = !awayTactics;
          match.tacticsLocked = true;
          match.tacticsLockedAt = now;
          match.status = MatchStatus.TACTICS_LOCKED;

          const matchDate = match.scheduledAt.toISOString().split('T')[0];
          const weather = await this.weatherRepository.findOne({
            where: { date: matchDate, locationId: 'default' },
          });
          if (weather) {
            match.weather = weather.actualWeather;
          }

          await this.matchRepository.save(match);

          this.logger.info(
            `[MatchPreprocessScheduler] ✅ Match ${match.id} preprocessed and saved to DB`,
          );

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

          this.logger.info(
            `[MatchPreprocessScheduler] 🚀 Queueing simulation job to BullMQ queue 'match-simulation'...`,
          );

          const job = await this.simulationQueue.add('simulate', jobData);

          this.logger.info(
            `[MatchPreprocessScheduler] ✅ Simulation job added to BullMQ! ` +
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
   * Find matches stuck in TACTICS_LOCKED whose scheduledAt is already past
   * the grace period, and re-enqueue their simulation job.
   */
  private async recoverStuckTacticsLockedMatches(now: Date): Promise<void> {
    const stuckThreshold = new Date(
      now.getTime() - STUCK_LOCKED_MINUTES * 60 * 1000,
    );
    const stuckMatches = await this.matchRepository.find({
      where: {
        status: MatchStatus.TACTICS_LOCKED,
        scheduledAt: LessThan(stuckThreshold),
      },
    });

    if (stuckMatches.length === 0) {
      return;
    }

    this.logger.warn(
      `[MatchRecovery] Found ${stuckMatches.length} TACTICS_LOCKED match(es) past scheduledAt — re-enqueueing simulation`,
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
   */
  @Cron('*/30 * * * * *') // Every 30 seconds
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
        match.status = MatchStatus.IN_PROGRESS;
        match.startedAt = match.scheduledAt;
        await this.matchRepository.save(match);

        this.logger.info(
          `⚽ Match started: ${match.homeTeam?.name || 'Home'} vs ${match.awayTeam?.name || 'Away'} ` +
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
  @Cron('0 * * * * *') // Every minute
  async completeMatches() {
    this.logger.debug(
      '[MatchCompletionScheduler] Checking for matches to complete',
    );

    const now = new Date();

    const matches = await this.matchRepository.find({
      where: {
        status: MatchStatus.IN_PROGRESS,
      },
    });

    if (matches.length === 0) {
      return;
    }

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
          match.status = MatchStatus.COMPLETED;
          match.completedAt = lastEvent.eventScheduledTime;
          match.actualEndTime = lastEvent.eventScheduledTime;
          await this.matchRepository.save(match);

          await this.completionQueue.add(
            'complete-match',
            { matchId: match.id },
            { jobId: `complete-${match.id}` },
          );

          this.logger.info(
            `🏁 Match completed: ${match.homeTeam?.name || 'Home'} ${match.homeScore || 0} - ` +
              `${match.awayScore || 0} ${match.awayTeam?.name || 'Away'} ` +
              `(ID: ${match.id})`,
          );
        }
      } catch (error) {
        this.logger.error(
          `[MatchCompletionScheduler] Failed to complete match ${match.id}: ${error.message}`,
          error.stack,
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
   * 将战术预设转换为比赛战术实体
   */
  private presetToMatchTactics(
    preset: TacticsPresetEntity,
    matchId: string,
    teamId: string,
  ): MatchTacticsEntity {
    const tactics = new MatchTacticsEntity();
    tactics.matchId = matchId;
    tactics.teamId = teamId;
    tactics.presetId = preset.id;
    tactics.formation = preset.formation;
    tactics.lineup = preset.lineup;
    tactics.instructions = preset.instructions;
    tactics.substitutions = preset.substitutions;
    tactics.submittedAt = new Date();
    return tactics;
  }
}
