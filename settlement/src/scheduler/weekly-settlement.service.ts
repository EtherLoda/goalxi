import { Injectable, Logger, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class WeeklySettlementService {
  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    @InjectQueue('training-settlement')
    private trainingQueue: Queue,
    @InjectQueue('condition-settlement')
    private conditionQueue: Queue,
    @InjectQueue('construction-settlement')
    private constructionQueue: Queue,
  ) {}

  /**
   * Weekly training, condition, and stadium construction settlement cron.
   * Runs every Thursday at 00:00. The construction tick decrements
   * `remaining_weeks` on every queued project and applies capacity changes
   * to any project that lands on 0 this tick.
   */
  @Cron('0 0 0 * * 4') // Every Thursday at 00:00
  async processWeeklySettlement() {
    this.logger.info(
      '[WeeklySettlement] Starting weekly training, condition, and stadium construction settlement...',
    );

    try {
      // Queue training settlement
      const trainingJob = await this.trainingQueue.add(
        'process-all-teams-training',
        {},
        {
          jobId: `training-${Date.now()}`,
        },
      );
      this.logger.info(
        `[WeeklySettlement] Training settlement job queued! Job ID: ${trainingJob.id}`,
      );

      // Queue condition settlement
      const conditionJob = await this.conditionQueue.add(
        'process-all-teams-condition',
        {},
        {
          jobId: `condition-${Date.now()}`,
        },
      );
      this.logger.info(
        `[WeeklySettlement] Condition settlement job queued! Job ID: ${conditionJob.id}`,
      );

      // Queue stadium construction settlement
      const constructionJob = await this.constructionQueue.add(
        'process-all-stadium-constructions',
        {},
        {
          jobId: `construction-${Date.now()}`,
        },
      );
      this.logger.info(
        `[WeeklySettlement] Stadium construction settlement job queued! Job ID: ${constructionJob.id}`,
      );
    } catch (error) {
      this.logger.error(
        `[WeeklySettlement] Failed to queue settlement jobs: ${error.message}`,
        error.stack,
      );
    }
  }
}
