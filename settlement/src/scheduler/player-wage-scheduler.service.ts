import { InjectQueue } from '@nestjs/bullmq';
import { Cron } from '@nestjs/schedule';
import { Injectable, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlayerEntity } from '@goalxi/database';

/**
 * The game-day clock: every (DAYS_PER_YEAR = 112) game-days is
 * a player's game-birthday. Aligned to UTC midnight so a job
 * queued at 00:00 UTC and a job queued at 23:59 UTC the
 * previous day both agree on which day index we're on.
 *
 * Reads `Date.now()` rather than constructing `new Date()` so
 * tests can pin the clock via `jest.spyOn(Date, 'now')`
 * without monkey-patching the Date constructor.
 */
const computeTodayGameDay = (nowMs: number = Date.now()): number => {
  return Math.floor((nowMs - Date.UTC(1970, 0, 1)) / 86_400_000);
};

@Injectable()
export class PlayerWageSchedulerService {
  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    @InjectQueue('player-wage')
    private readonly playerWageQueue: Queue,
    @InjectRepository(PlayerEntity)
    private readonly playerRepo: Repository<PlayerEntity>,
  ) {}

  /**
   * Daily cron to check for players with birthdays today
   * and update their wages accordingly. Runs at 00:00 UTC every
   * day.
   *
   * Idempotency: the jobId is `birthday-wage-${playerId}-${todayGameDay}`.
   *   - The per-player key means a player only ever gets one
   *     wage-update job per game-day. If the cron fires twice
   *     (manual retry, restart) the second `add` is a no-op at
   *     the queue level.
   *   - The `todayGameDay` suffix means a stale queued job
   *     for yesterday can't resurrect as a duplicate of
   *     today's — they'd be distinct keys.
   *
   * Previously the jobId embedded `Date.now()`, so a second
   * trigger always queued a fresh job. With BullMQ's default
   * 0 attempts and no idempotent processor, a double-fire
   * meant the player got two wage updates in one day.
   */
  @Cron('0 0 0 * * *') // Every day at midnight
  async processBirthdayWageUpdates() {
    const todayGameDay = computeTodayGameDay();

    this.logger.info(
      '[PlayerWageScheduler] Checking for birthday wage updates...',
    );

    try {
      // [C2] "Birthday today" check uses the game-day clock:
      // a player's game-birthday is every 112 game-days starting
      // from their `createdDay`. PostgreSQL `MOD` always returns
      // a non-negative remainder, so the same query catches
      // players whose birthday is today regardless of how long
      // ago they were created.
      const playersWithBirthday = await this.playerRepo
        .createQueryBuilder('player')
        .where('MOD(:today - player.created_day, 112) = 0', {
          today: todayGameDay,
        })
        .andWhere('player.is_youth = false') // Only adult players
        .getMany();

      if (playersWithBirthday.length === 0) {
        this.logger.info(
          '[PlayerWageScheduler] No birthday wage updates today',
        );
        return;
      }

      // Enqueue all in parallel. Each jobId is per-player + per-day
      // so the queue dedupes both intra-day and cross-day retries.
      const enqueueResults = await Promise.allSettled(
        playersWithBirthday.map((player) =>
          this.playerWageQueue.add(
            'birthday-wage-update',
            { playerId: player.id },
            {
              jobId: `birthday-wage-${player.id}-${todayGameDay}`,
              attempts: 3,
              backoff: { type: 'exponential', delay: 30_000 },
              removeOnComplete: { age: 24 * 3600, count: 100 },
              removeOnFail: { age: 7 * 24 * 3600 },
            },
          ),
        ),
      );

      const succeeded = enqueueResults.filter(
        (r) => r.status === 'fulfilled',
      ).length;
      const failed = enqueueResults.length - succeeded;

      if (failed > 0) {
        this.logger.warn(
          `[PlayerWageScheduler] Partial enqueue for game-day ${todayGameDay}: ` +
            `${succeeded} succeeded, ${failed} failed`,
        );
      } else {
        this.logger.info(
          `[PlayerWageScheduler] Birthday wage update queued for ${succeeded} players (game-day ${todayGameDay})`,
        );
      }
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `[PlayerWageScheduler] Failed to queue birthday wage updates: ${err.message}`,
        err.stack,
      );
    }
  }
}
