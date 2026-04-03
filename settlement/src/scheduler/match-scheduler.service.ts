import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import {
  MatchEntity,
  MatchTacticsEntity,
  MatchEventEntity,
  MatchStatus,
  WeatherEntity,
  TacticsPresetEntity,
  GAME_SETTINGS,
} from '@goalxi/database';

@Injectable()
export class MatchSchedulerService {
  private readonly logger = new Logger(MatchSchedulerService.name);

  constructor(
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
      return;
    }

    this.logger.log(
      `[MatchPreprocessScheduler] ✅ Found ${matches.length} match(es) ready for preprocessing`,
    );

    for (const match of matches) {
      try {
        this.logger.log(
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

        this.logger.log(
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

        this.logger.log(
          `[MatchPreprocessScheduler] 🚀 Queueing simulation job to BullMQ queue 'match-simulation'...`,
        );

        const job = await this.simulationQueue.add('simulate-match', jobData);

        this.logger.log(
          `[MatchPreprocessScheduler] ✅ Simulation job added to BullMQ! ` +
            `Job ID: ${job.id}, Match ID: ${match.id}`,
        );

        this.logger.log(
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

    this.logger.log(
      `[MatchStartScheduler] Found ${matches.length} match(es) ready to start`,
    );

    for (const match of matches) {
      try {
        match.status = MatchStatus.IN_PROGRESS;
        match.startedAt = match.scheduledAt;
        await this.matchRepository.save(match);

        this.logger.log(
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

          this.logger.log(
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
