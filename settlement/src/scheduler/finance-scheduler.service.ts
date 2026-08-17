import { InjectQueue } from '@nestjs/bullmq';
import { Cron } from '@nestjs/schedule';
import { Injectable, Logger, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MatchEntity,
  TeamEntity,
  currentSeasonWeek,
  resolveGameStart,
} from '@goalxi/database';

@Injectable()
export class FinanceSchedulerService {
  // Resolved once at construction; see training.processor for
  // the same pattern + reason (long-running crons must not
  // re-read env mid-tick).
  private readonly gameStart: Date;

  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    @InjectQueue('finance-settlement')
    private readonly financeQueue: Queue,
    @InjectRepository(TeamEntity)
    private readonly teamRepo: Repository<TeamEntity>,
    @InjectRepository(MatchEntity)
    private readonly matchRepo: Repository<MatchEntity>,
  ) {
    this.gameStart = resolveGameStart(process.env.GAME_START_DATE);
  }

  /**
   * Get current season and week. Delegates to the shared pure
   * function in @goalxi/database so the value matches what
   * `api/src/api/staffs/staffs.service.ts` and the training tick
   * see — three cron handlers that previously each hard-coded
   * `'2026-04-06'` and could disagree if anyone edited one copy
   * but not the others.
   */
  private getCurrentSeasonWeek(): { season: number; week: number } {
    return currentSeasonWeek(new Date(), this.gameStart);
  }

  /**
   * Weekly finance settlement cron - runs every Monday at UTC 00:00
   * Generates financial data (sponsorship, wages, staff, youth) for the NEW week
   */
  @Cron('0 0 0 * * 1') // Every Monday at 00:00 UTC
  async processWeeklyFinanceSettlement() {
    this.logger.info(
      '[FinanceScheduler] Starting weekly finance settlement...',
    );

    // Get current season and week from game state
    const { season, week } = this.getCurrentSeasonWeek();

    this.logger.info(
      `[FinanceScheduler] Current game state: Season ${season}, Week ${week}`,
    );

    // Get all non-bot teams. BOT teams (isBot=true) are skipped:
    //   - they have no owner, no economic decisions, and their
    //     players' wages are already skipped in player-wage.processor
    //     so any finance settlement writes zero-output rows into
    //     FinanceEntity / TransactionEntity;
    //   - the row count grows unboundedly without this filter
    //     (≈70% of teams in the pyramid are BOT, ~1000+ jobs/week);
    //   - on onboarding claim, a freshly-claimed BOT inherits
    //     ghost sponsorship income in FinanceEntity.balance.
    // Filtering here (not in the processor) also means a future
    // change cannot quietly start emitting finance activity for
    // BOT teams — they would need to be added back to the queue
    // explicitly.
    const teams = await this.teamRepo.find({ where: { isBot: false } });

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

    this.logger.info(
      `[FinanceScheduler] Finance settlement queued: ${successCount} teams succeeded, ${failCount} failed (Season ${season}, Week ${week})`,
    );
  }
}
