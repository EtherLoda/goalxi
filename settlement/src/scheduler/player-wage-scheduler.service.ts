import { InjectQueue } from '@nestjs/bullmq';
import { Cron } from '@nestjs/schedule';
import { Injectable, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  GAME_SETTINGS,
  PlayerEntity,
} from '@goalxi/database';

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

/**
 * How many past game-days the birthday scan also covers.
 *
 * The scan trigger used to be an exact modulus
 * (`MOD(today - created_day, 112) = 0`) and `@Cron` has no retry
 * mechanism, so one DB blip at 00:00 meant that game-day's birthdays
 * were **permanently** missed — the condition would not hold again for
 * 112 game-days, and the thrown error was caught and only logged.
 *
 * Scanning a window of recent game-days turns that silent permanent
 * loss into a bounded, self-healing one. Safe because the processor's
 * write is an absolute assignment from a deterministic pure function
 * (`player.currentWage = calculatePlayerWage(...)`), not a delta, and
 * the processor skips the save entirely when the value is unchanged.
 *
 * 3 days gives room for a weekend plus one retry day without
 * meaningfully re-scanning players.
 */
const CATCHUP_DAYS = 3;

import { CronLocked } from '../common/cron-lock/cron-lock.decorator';
import { CronLockService } from '../common/cron-lock/cron-lock.service';

@Injectable()
export class PlayerWageSchedulerService {
  @Inject(CronLockService)
  private readonly cronLock!: CronLockService;

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
   *
   * The suffix is the *birthday* game-day, not `today`, so a
   * catch-up run (see `CATCHUP_DAYS`) produces the same jobId the
   * original run would have emitted and BullMQ dedupes it.
   */
  @Cron('0 0 0 * * *', { timeZone: GAME_SETTINGS.CRON_TIME_ZONE }) // Every day at midnight
  @CronLocked('settlement.player-wage.birthday', { ttlMs: 15 * 60_000 })
  async processBirthdayWageUpdates() {
    const todayGameDay = computeTodayGameDay();

    this.logger.info(
      '[PlayerWageScheduler] Checking for birthday wage updates...',
    );

    // [C2] "Birthday today" check uses the game-day clock:
    // a player's game-birthday is every 112 game-days starting
    // from their `createdDay`. PostgreSQL `MOD` always returns
    // a non-negative remainder, so the same query catches
    // players whose birthday is today regardless of how long
    // ago they were created.
    //
    // The window (`BETWEEN 0 AND :catchup`) is what makes a missed
    // cron self-healing — see `CATCHUP_DAYS`.
    //
    // The BOT filter is applied HERE as well as in the processor. The
    // enqueue side previously only checked `is_youth = false`, so with
    // ~70% of the pyramid being BOT, roughly 70% of every daily enqueue
    // was a dead job. Team-less free agents are deliberately kept: their
    // wage matters if they are later signed, and this matches the
    // processor's own pass-through.
    const rows = await this.playerRepo
      .createQueryBuilder('player')
      .leftJoin('team', 'team.id = player.team_id')
      .where('MOD(:today - player.created_day, 112) BETWEEN 0 AND :catchup', {
        today: todayGameDay,
        catchup: CATCHUP_DAYS - 1,
      })
      .andWhere('player.is_youth = false')
      .andWhere('(team.id IS NULL OR team.is_bot = false)')
      // The game-day the birthday actually falls on (= today - age).
      // Used as the jobId suffix so a catch-up dedupes against the
      // original run instead of queueing a second job.
      .addSelect(
        '(:today - MOD(:today - player.created_day, 112))',
        'birthdayGameDay',
      )
      .getRawAndEntities();

    const playersWithBirthday = rows.entities;
    if (playersWithBirthday.length === 0) {
      this.logger.info('[PlayerWageScheduler] No birthday wage updates due');
      return;
    }

    const birthdayGameDayByPlayerId = new Map<number, number>();
    for (const raw of rows.raw as {
      player_id: number;
      birthdayGameDay: number;
    }[]) {
      birthdayGameDayByPlayerId.set(
        Number(raw.player_id),
        Number(raw.birthdayGameDay),
      );
    }

    const catchupCount =
      playersWithBirthday.length -
      [...birthdayGameDayByPlayerId.values()].filter(
        (d) => d === todayGameDay,
      ).length;
    if (catchupCount > 0) {
      this.logger.info(
        `[PlayerWageScheduler] Catch-up: ${catchupCount} birthday wage ` +
          `update(s) due from previous game-days (window=${CATCHUP_DAYS})`,
      );
    }

    // Enqueue all in parallel. Each jobId is per-player +
    // per-birthday-day, so the queue dedupes both intra-day and
    // cross-day retries.
    const enqueueResults = await Promise.allSettled(
      playersWithBirthday.map((player) =>
        this.playerWageQueue.add(
          'birthday-wage-update',
          { playerId: player.id },
          {
            jobId:
              `birthday-wage-${player.id}-` +
              (birthdayGameDayByPlayerId.get(player.id) ?? todayGameDay),
            attempts: 3,
            backoff: { type: 'exponential', delay: 30_000 },
            removeOnComplete: { age: 24 * 3600, count: 100 },
            removeOnFail: { age: 7 * 24 * 3600 },
          },
        ),
      ),
    );

    const succeeded = enqueueResults.filter((r) => r.status === 'fulfilled')
      .length;
    const failed = enqueueResults.length - succeeded;

    if (failed > 0) {
      // `error`, not `warn`: these players' wages are stale until the
      // catch-up window picks them up, and the old code reported a
      // partial failure as a warning with no recovery story at all.
      this.logger.error(
        `[PlayerWageScheduler] Partial enqueue for game-day ${todayGameDay}: ` +
          `${succeeded} succeeded, ${failed} failed. The ${CATCHUP_DAYS}-game-day ` +
          `catch-up window will pick up the misses.`,
      );
    } else {
      this.logger.info(
        `[PlayerWageScheduler] Birthday wage update queued for ${succeeded} players (game-day ${todayGameDay})`,
      );
    }
  }
}
