import { Injectable, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  GAME_SETTINGS,
  currentSeasonWeek, resolveGameStart,
} from '@goalxi/database';

type SettlementKind =
  | 'training'
  | 'condition'
  | 'construction'
  | 'fan';

/**
 * Weekly training, condition, stadium construction, and fan
 * settlement cron. Runs every Thursday at
 * 00:00 UTC.
 *
 * Each settlement is a single "all teams" BullMQ job that the
 * respective processor drains. The five jobs are enqueued in
 * parallel — a Redis blip on one queue should not block the
 * other four from landing.
 *
 * Idempotency contract: every jobId is a business key
 * (`weekly-${kind}-${season}-${week}`), NOT `Date.now()`. BullMQ
 * rejects duplicate jobIds at enqueue time, so a Thursday
 * cron that runs twice (manual retry, deploy restart, clock
 * skew) queues exactly one job per kind. The processors do not
 * need to be idempotent on their own; they get to see the job
 * exactly once.
 *
 * Retry: 3 attempts with exponential backoff. A full-team
 * training tick that fails halfway (e.g. Postgres restart)
 * retries up to 2 more times before landing in the failed
 * list. Previously the queue had `attempts: 0` (BullMQ default)
 * and any error went straight to dead-letter.
 */
import { CronLocked } from '../common/cron-lock/cron-lock.decorator';
import { CronLockService } from '../common/cron-lock/cron-lock.service';

@Injectable()
export class WeeklySettlementService {
  @Inject(CronLockService)
  private readonly cronLock!: CronLockService;

  // Resolved once at construction. see game-clock.ts doc for
  // why a constructor capture is safer than a per-tick read.
  private readonly gameStart: Date;

  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    @InjectQueue('training-settlement')
    private trainingQueue: Queue,
    @InjectQueue('condition-settlement')
    private conditionQueue: Queue,
    @InjectQueue('construction-settlement')
    private constructionQueue: Queue,
    @InjectQueue('fan-settlement')
    private fanQueue: Queue,
  ) {
    this.gameStart = resolveGameStart(process.env.GAME_START_DATE);
  }

  // Only enqueues; the 4 consumers do the heavy work. The
  // BullMQ business-key jobIds (`weekly-{kind}-{season}-week{n}`)
  // already dedupe the enqueue, so this lock mainly stops two
  // replicas racing the same Thursday tick.
  @Cron('0 0 0 * * 4', { timeZone: GAME_SETTINGS.CRON_TIME_ZONE }) // Every Thursday at 00:00 UTC
  @CronLocked('settlement.weekly.enqueue', { ttlMs: 15 * 60_000 })
  async processWeeklySettlement() {
    const { season, week } = currentSeasonWeek(new Date(), this.gameStart);

    this.logger.info(
      `[WeeklySettlement] Starting tick for Season ${season}, Week ${week}`,
    );

    const queues: Array<{ kind: SettlementKind; queue: Queue }> = [
      { kind: 'training', queue: this.trainingQueue },
      { kind: 'condition', queue: this.conditionQueue },
      { kind: 'construction', queue: this.constructionQueue },
      { kind: 'fan', queue: this.fanQueue },
    ];

    // Enqueue all four in parallel. Each getSettlementJobId is
    // the same business key for the same (season, week) so a
    // double-trigger (manual replay, restart) dedupes
    // automatically. Each .add returns the existing-job indicator
    // if the jobId was already taken.
    const enqueueResults = await Promise.allSettled(
      queues.map(async ({ kind, queue }) => {
        const jobId = `weekly-${kind}-${season}-week${week}`;
        const job = await queue.add(
          `process-all-${kind}`,
          { season, week },
          {
            jobId,
            attempts: 3,
            backoff: { type: 'exponential', delay: 60_000 },
            removeOnComplete: { age: 7 * 24 * 3600, count: 50 },
            removeOnFail: { age: 30 * 24 * 3600 },
          },
        );
        return { kind, jobId, jobIdFromQueue: job.id };
      }),
    );

    const succeeded: string[] = [];
    const failed: { kind: SettlementKind; reason: string }[] = [];

    for (let i = 0; i < enqueueResults.length; i++) {
      const r = enqueueResults[i];
      const { kind } = queues[i];
      if (r.status === 'fulfilled') {
        succeeded.push(kind);
      } else {
        const reason =
          r.reason instanceof Error ? r.reason.message : String(r.reason);
        failed.push({ kind, reason });
      }
    }

    if (failed.length === 0) {
      this.logger.info(
        `[WeeklySettlement] Queued all 5 settlements for Season ${season}, Week ${week}: ${succeeded.join(', ')}`,
      );
      return;
    }

    // Partial failure is the dangerous case: 4/5 ticks land
    // but 1/5 silently doesn't. We log a single WARN line
    // naming the missing kinds so on-call can re-trigger the
    // missing one manually.
    this.logger.warn(
      `[WeeklySettlement] Partial enqueue for Season ${season}, Week ${week}. ` +
        `Succeeded: [${succeeded.join(', ')}]. ` +
        `Failed: [${failed.map((f) => `${f.kind} (${f.reason})`).join(', ')}]. ` +
        `Re-trigger the failed kinds manually.`,
    );
  }
}
