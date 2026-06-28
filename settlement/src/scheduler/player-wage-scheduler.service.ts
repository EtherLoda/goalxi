import { InjectQueue } from '@nestjs/bullmq';
import { Cron } from '@nestjs/schedule';
import { Injectable, Logger, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlayerEntity } from '@goalxi/database';

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
   * and update their wages accordingly
   */
  @Cron('0 0 0 * * *') // Every day at midnight
  async processBirthdayWageUpdates() {
    this.logger.info(
      '[PlayerWageScheduler] Checking for birthday wage updates...',
    );

    try {
      const today = new Date();
      const month = today.getMonth() + 1; // 1-12
      const day = today.getDate(); // 1-31

      // Find players whose birthday is today
      const playersWithBirthday = await this.playerRepo
        .createQueryBuilder('player')
        .where('EXTRACT(MONTH FROM player.birthday) = :month', { month })
        .andWhere('EXTRACT(DAY FROM player.birthday) = :day', { day })
        .andWhere('player.is_youth = false') // Only adult players
        .getMany();

      if (playersWithBirthday.length === 0) {
        this.logger.info(
          '[PlayerWageScheduler] No birthday wage updates today',
        );
        return;
      }

      for (const player of playersWithBirthday) {
        await this.playerWageQueue.add(
          'birthday-wage-update',
          { playerId: player.id },
          { jobId: `birthday-wage-${player.id}-${Date.now()}` },
        );
      }

      this.logger.info(
        `[PlayerWageScheduler] Birthday wage update queued for ${playersWithBirthday.length} players`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `[PlayerWageScheduler] Failed to queue birthday wage updates: ${err.message}`,
        err.stack,
      );
    }
  }
}
