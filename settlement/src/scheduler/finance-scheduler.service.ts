import { InjectQueue } from '@nestjs/bullmq';
import { Cron } from '@nestjs/schedule';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TeamEntity } from '@goalxi/database';

@Injectable()
export class FinanceSchedulerService {
  private readonly logger = new Logger(FinanceSchedulerService.name);

  constructor(
    @InjectQueue('finance-settlement')
    private readonly financeQueue: Queue,
    @InjectRepository(TeamEntity)
    private readonly teamRepo: Repository<TeamEntity>,
  ) {}

  /**
   * Weekly finance settlement cron - runs every Sunday at midnight
   * Processes sponsorship, TV revenue, merchandise, staff wages, youth team cost
   */
  @Cron('0 0 0 * * 0') // Every Sunday at 00:00
  async processWeeklyFinanceSettlement() {
    this.logger.log('[FinanceScheduler] Starting weekly finance settlement...');

    try {
      // Get all teams and their current season
      const teams = await this.teamRepo.find();

      for (const team of teams) {
        // Determine current season (simplified: assume season 1 for now)
        const season = 1;

        await this.financeQueue.add(
          'weekly-settlement',
          {
            teamId: team.id,
            season,
            type: 'weekly',
          },
          {
            jobId: `finance-weekly-${team.id}-${Date.now()}`,
          },
        );
      }

      this.logger.log(
        `[FinanceScheduler] Finance settlement queued for ${teams.length} teams`,
      );
    } catch (error) {
      this.logger.error(
        `[FinanceScheduler] Failed to queue finance settlement: ${error.message}`,
        error.stack,
      );
    }
  }
}
