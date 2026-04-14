import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class WeeklySettlementService {
  private readonly logger = new Logger(WeeklySettlementService.name);

  constructor(
    @InjectQueue('training-settlement')
    private trainingQueue: Queue,
    @InjectQueue('condition-settlement')
    private conditionQueue: Queue,
  ) {}

  /**
   * Weekly training and condition settlement cron - runs every Thursday at 00:00
   * Processes training for all teams and updates player skills
   * Also updates player form based on match appearances
   */
  @Cron('0 0 0 * * 4') // Every Thursday at 00:00
  async processWeeklySettlement() {
    this.logger.log(
      '[WeeklySettlement] Starting weekly training and condition settlement...',
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
      this.logger.log(
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
      this.logger.log(
        `[WeeklySettlement] Condition settlement job queued! Job ID: ${conditionJob.id}`,
      );
    } catch (error) {
      this.logger.error(
        `[WeeklySettlement] Failed to queue settlement jobs: ${error.message}`,
        error.stack,
      );
    }
  }
}
