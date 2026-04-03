import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class TrainingSchedulerService {
  private readonly logger = new Logger(TrainingSchedulerService.name);

  constructor(
    @InjectQueue('training-settlement')
    private trainingQueue: Queue,
  ) {}

  /**
   * Weekly training settlement cron - runs every Thursday at midnight
   * Processes training for all teams and updates player skills
   */
  @Cron('0 0 0 * * 4') // Every Thursday at 00:00
  async processWeeklyTraining() {
    this.logger.log(
      '[TrainingScheduler] Starting weekly training settlement...',
    );

    try {
      const job = await this.trainingQueue.add(
        'process-all-teams-training',
        {},
        {
          jobId: `training-${Date.now()}`,
        },
      );

      this.logger.log(
        `[TrainingScheduler] Training settlement job queued! Job ID: ${job.id}`,
      );
    } catch (error) {
      this.logger.error(
        `[TrainingScheduler] Failed to queue training settlement: ${error.message}`,
        error.stack,
      );
    }
  }
}
