import { InjectQueue } from '@nestjs/bullmq';
import { Cron } from '@nestjs/schedule';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MatchEntity, TeamEntity, GAME_SETTINGS } from '@goalxi/database';

@Injectable()
export class FinanceSchedulerService {
  private readonly logger = new Logger(FinanceSchedulerService.name);

  // Game start date: Season 1, Week 1 begins at this date (UTC)
  private readonly GAME_START_DATE = new Date('2026-04-06T00:00:00Z');

  constructor(
    @InjectQueue('finance-settlement')
    private readonly financeQueue: Queue,
    @InjectRepository(TeamEntity)
    private readonly teamRepo: Repository<TeamEntity>,
    @InjectRepository(MatchEntity)
    private readonly matchRepo: Repository<MatchEntity>,
  ) {}

  /**
   * Get current season and week based on UTC time elapsed since game start
   */
  private getCurrentSeasonWeek(): { season: number; week: number } {
    const now = new Date();
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;

    const weeksElapsed = Math.floor(
      (now.getTime() - this.GAME_START_DATE.getTime()) / msPerWeek,
    );

    const season =
      Math.floor(weeksElapsed / GAME_SETTINGS.SEASON_LENGTH_WEEKS) + 1;
    const week = (weeksElapsed % GAME_SETTINGS.SEASON_LENGTH_WEEKS) + 1;

    return { season, week };
  }

  /**
   * Weekly finance settlement cron - runs every Monday at UTC 00:00
   * Generates financial data (sponsorship, wages, staff, youth) for the NEW week
   */
  @Cron('0 0 0 * * 1') // Every Monday at 00:00 UTC
  async processWeeklyFinanceSettlement() {
    this.logger.log('[FinanceScheduler] Starting weekly finance settlement...');

    // Get current season and week from game state
    const { season, week } = this.getCurrentSeasonWeek();

    this.logger.log(
      `[FinanceScheduler] Current game state: Season ${season}, Week ${week}`,
    );

    // Get all teams
    const teams = await this.teamRepo.find();

    let successCount = 0;
    let failCount = 0;

    for (const team of teams) {
      try {
        await this.financeQueue.add(
          'weekly-settlement',
          {
            teamId: team.id,
            season,
            week,
            type: 'weekly',
          },
          {
            jobId: `finance-weekly-${team.id}-${Date.now()}`,
          },
        );
        successCount++;
      } catch (error) {
        failCount++;
        this.logger.error(
          `[FinanceScheduler] Failed to queue finance settlement for team ${team.id}: ${error.message}`,
        );
      }
    }

    this.logger.log(
      `[FinanceScheduler] Finance settlement queued: ${successCount} teams succeeded, ${failCount} failed (Season ${season}, Week ${week})`,
    );
  }
}
