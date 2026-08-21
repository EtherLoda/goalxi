import { InjectQueue } from '@nestjs/bullmq';
import { Cron } from '@nestjs/schedule';
import { Injectable, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { Queue } from 'bullmq';
import { currentSeasonWeek, resolveGameStart } from '@goalxi/database';

/**
 * Weekly senior-decline scheduler.
 *
 * Fires **Monday 00:00 UTC** and enqueues a single
 * `senior-decline-settlement` job. The corresponding
 * `PlayerDeclineProcessor` then scans every senior player on a
 * non-BOT team and applies one week of age-driven skill decay
 * (see `libs/database/src/services/player-decline.ts`).
 *
 * ## Why Monday, four days before training
 * The regular `WeeklySettlementService` runs Thursday 00:00 UTC and
 * the training worker diffs the snapshot against the post-decline
 * skills, recording the decline in `TrainingUpdateEntity`. By
 * running decline on Monday we get a four-day buffer: if the
 * Monday tick fails or stalls, the Thursday training tick still
 * runs (they share no queue or transaction), and the decline
 * catches up on the next Monday. The training diff for the
 * current week simply won't show the missed decline — a soft
 * failure mode the user can recover from by waiting a week.
 *
 * ## Why one job, not per-team
 * Decline is a global read of every senior player. The work does
 * not split cleanly by team (a player's `team` is only the filter
 * that excludes BOTs; the processor still scans every player).
 * One job keeps the cron simple and matches the pattern used by
 * `YouthProgressionProcessor`.
 *
 * ## Idempotency
 * `jobId = decline-weekly-${season}-week${week}` — the same
 * business key for the same (season, week) is rejected by BullMQ
 * at enqueue time, so a double-trigger (manual replay, deploy
 * restart) queues exactly one job. The processor does not need
 * to be idempotent on its own; it gets to see the job exactly
 * once.
 */
@Injectable()
export class SeniorDeclineSchedulerService {
  // Resolved once at construction; see the finance-scheduler for
  // the same pattern + reason (long-running crons must not
  // re-read env mid-tick).
  private readonly gameStart: Date;

  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    @InjectQueue('senior-decline-settlement')
    private readonly declineQueue: Queue,
  ) {
    this.gameStart = resolveGameStart(process.env.GAME_START_DATE);
  }

  private getCurrentSeasonWeek(): { season: number; week: number } {
    return currentSeasonWeek(new Date(), this.gameStart);
  }

  @Cron('0 0 0 * * 1') // Every Monday at 00:00 UTC
  async triggerWeeklyDecline() {
    const { season, week } = this.getCurrentSeasonWeek();

    this.logger.info(
      `[SeniorDeclineScheduler] Triggering weekly decline for Season ${season}, Week ${week}`,
    );

    const jobId = `decline-weekly-${season}-week${week}`;
    const job = await this.declineQueue.add(
      'process-all-decline',
      { season, week },
      {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: { age: 7 * 24 * 3600, count: 50 },
        removeOnFail: { age: 30 * 24 * 3600 },
      },
    );

    this.logger.info(
      `[SeniorDeclineScheduler] Queued senior-decline job ${job.id} for S${season}W${week}`,
    );
  }
}
