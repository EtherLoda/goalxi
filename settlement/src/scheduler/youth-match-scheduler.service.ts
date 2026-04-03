import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import {
  YouthMatchEntity,
  YouthMatchStatus,
  YouthMatchTacticsEntity,
  YouthMatchEventEntity,
  GAME_SETTINGS,
} from '@goalxi/database';

@Injectable()
export class YouthMatchSchedulerService {
  private readonly logger = new Logger(YouthMatchSchedulerService.name);

  constructor(
    @InjectQueue('youth-match-simulation')
    private simulationQueue: Queue,
    @InjectRepository(YouthMatchEntity)
    private matchRepository: Repository<YouthMatchEntity>,
    @InjectRepository(YouthMatchTacticsEntity)
    private tacticsRepository: Repository<YouthMatchTacticsEntity>,
    @InjectRepository(YouthMatchEventEntity)
    private eventRepository: Repository<YouthMatchEventEntity>,
  ) {}

  /**
   * Scheduler 1: 比赛前预处理
   * - 查找即将到达战术截止时间的比赛
   * - 提取双方战术数据，检查是否弃权
   * - 将战术数据和弃权状态提交到模拟器队列
   * - 锁定战术并更新比赛状态为 TACTICS_LOCKED
   */
  @Cron('0 * * * * *') // Every minute，与成人队一致
  async preprocessMatch(): Promise<void> {
    const deadlineMinutes = GAME_SETTINGS.MATCH_TACTICS_DEADLINE_MINUTES;
    const now = new Date();
    const deadline = new Date(now.getTime() + deadlineMinutes * 60 * 1000);

    const matches = await this.matchRepository.find({
      where: {
        status: YouthMatchStatus.SCHEDULED,
        tacticsLocked: false,
        scheduledAt: LessThanOrEqual(deadline),
      },
      relations: ['homeYouthTeam', 'awayYouthTeam'],
    });

    if (matches.length === 0) {
      return;
    }

    this.logger.log(
      `[YouthPreprocessScheduler] Found ${matches.length} youth matches to preprocess`,
    );

    for (const match of matches) {
      try {
        // 查找双方战术数据
        const homeTactics = await this.tacticsRepository.findOne({
          where: { youthMatchId: match.id, teamId: match.homeYouthTeamId },
        });
        const awayTactics = await this.tacticsRepository.findOne({
          where: { youthMatchId: match.id, teamId: match.awayYouthTeamId },
        });

        // 未提交战术视为弃权
        if (!homeTactics) {
          match.homeForfeit = true;
          this.logger.warn(
            `[YouthPreprocessScheduler] No home tactics for youth match ${match.id}, forfeiting home team`,
          );
        }
        if (!awayTactics) {
          match.awayForfeit = true;
          this.logger.warn(
            `[YouthPreprocessScheduler] No away tactics for youth match ${match.id}, forfeiting away team`,
          );
        }

        // 更新比赛状态
        match.tacticsLocked = true;
        match.tacticsLockedAt = new Date();
        match.status = YouthMatchStatus.TACTICS_LOCKED;
        await this.matchRepository.save(match);

        // 构造模拟器所需的数据，包含完整战术信息（与成人队一致）
        const jobData = {
          youthMatchId: match.id,
          homeTeamId: match.homeYouthTeamId,
          awayTeamId: match.awayYouthTeamId,
          homeTactics: homeTactics || null,
          awayTactics: awayTactics || null,
          homeForfeit: match.homeForfeit,
          awayForfeit: match.awayForfeit,
        };

        this.logger.log(
          `[YouthPreprocessScheduler] 🚀 Queueing youth simulation job to BullMQ queue 'youth-match-simulation'...`,
        );

        const job = await this.simulationQueue.add(
          'simulate-youth-match',
          jobData,
        );

        this.logger.log(
          `[YouthPreprocessScheduler] ✅ Youth simulation job added to BullMQ! ` +
            `Job ID: ${job.id}, Youth Match ID: ${match.id}`,
        );

        this.logger.log(
          `🔒 Youth match preprocessed: ${match.homeYouthTeam?.name || 'Home'} vs ${match.awayYouthTeam?.name || 'Away'}. ` +
            `Scheduled: ${match.scheduledAt.toISOString()}. Simulation job ${job.id} queued.`,
        );
      } catch (error) {
        this.logger.error(
          `[YouthPreprocessScheduler] Failed to preprocess youth match ${match.id}: ${(error as Error).message}`,
          (error as Error).stack,
        );
      }
    }
  }

  /**
   * Scheduler 2: 比赛时间到达时标记为进行中
   * - 查找状态为 TACTICS_LOCKED 且到达比赛时间的比赛
   * - 将状态更新为 IN_PROGRESS
   */
  @Cron('*/30 * * * * *') // Every 30 seconds，与成人队一致
  async startMatches(): Promise<void> {
    const now = new Date();

    const matches = await this.matchRepository.find({
      where: {
        status: YouthMatchStatus.TACTICS_LOCKED,
        scheduledAt: LessThanOrEqual(now),
      },
      relations: ['homeYouthTeam', 'awayYouthTeam'],
    });

    if (matches.length === 0) {
      return;
    }

    this.logger.log(
      `[YouthMatchStartScheduler] Found ${matches.length} youth matches to start`,
    );

    for (const match of matches) {
      try {
        match.status = YouthMatchStatus.IN_PROGRESS;
        match.startedAt = match.scheduledAt;
        await this.matchRepository.save(match);

        this.logger.log(
          `⚽ Youth match started: ${match.homeYouthTeam?.name || 'Home'} vs ${match.awayYouthTeam?.name || 'Away'} ` +
            `(ID: ${match.id}, Scheduled: ${match.scheduledAt.toISOString()})`,
        );
      } catch (error) {
        this.logger.error(
          `[YouthMatchStartScheduler] Failed to start youth match ${match.id}: ${(error as Error).message}`,
          (error as Error).stack,
        );
      }
    }
  }

  /**
   * Scheduler 3: 比赛结束后标记为已完成
   * - 查找状态为 IN_PROGRESS 的比赛
   * - 检查 simulationCompletedAt 和 actualEndTime（由模拟器设置）
   * - 如果已到结束时间则标记为 COMPLETED
   */
  @Cron('0 * * * * *') // Every minute，与成人队一致
  async completeMatches(): Promise<void> {
    const now = new Date();

    const matches = await this.matchRepository.find({
      where: {
        status: YouthMatchStatus.IN_PROGRESS,
      },
      relations: ['homeYouthTeam', 'awayYouthTeam'],
    });

    if (matches.length === 0) {
      return;
    }

    for (const match of matches) {
      // 需要模拟器先设置 simulationCompletedAt 和 actualEndTime
      if (!match.simulationCompletedAt || !match.actualEndTime) {
        continue;
      }

      if (now >= match.actualEndTime) {
        try {
          match.status = YouthMatchStatus.COMPLETED;
          match.completedAt = match.actualEndTime;
          await this.matchRepository.save(match);

          this.logger.log(
            `🏁 Youth match completed: ${match.homeYouthTeam?.name || 'Home'} vs ${match.awayYouthTeam?.name || 'Away'} ` +
              `(ID: ${match.id}, Score: ${match.homeScore}-${match.awayScore})`,
          );
        } catch (error) {
          this.logger.error(
            `[YouthMatchCompleteScheduler] Failed to complete youth match ${match.id}: ${(error as Error).message}`,
            (error as Error).stack,
          );
        }
      }
    }
  }
}
