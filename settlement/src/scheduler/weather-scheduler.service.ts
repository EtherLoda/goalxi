import { Injectable, Logger, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { Cron } from '@nestjs/schedule';
import { GAME_SETTINGS } from '@goalxi/database';
import { WeatherService } from './weather.service';
import { CronLocked } from '../common/cron-lock/cron-lock.decorator';
import { CronLockService } from '../common/cron-lock/cron-lock.service';

@Injectable()
export class WeatherSchedulerService {
  @Inject(CronLockService)
  private readonly cronLock!: CronLockService;

  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    private readonly weatherService: WeatherService,
  ) {}

  // ===== SCHEDULER: Daily Weather Generation =====
  // Run at midnight (00:00) UTC every day
  //
  // TTL 15 min: daily cron, and the handler only touches one day's row,
  // so a 15-minute crash window is generous while still letting a
  // crashed tick be retried well before the next midnight.
  @Cron('0 0 0 * * *', { timeZone: GAME_SETTINGS.CRON_TIME_ZONE })
  @CronLocked('settlement.weather.daily', { ttlMs: 15 * 60_000 })
  async generateDailyWeather() {
    const now = new Date();
    this.logger.info(
      `[WeatherScheduler] Generating daily weather at ${now.toISOString()}`,
    );

    try {
      const weather = await this.weatherService.createOrUpdateTodayWeather();
      this.logger.info(
        `[WeatherScheduler] �?Generated weather for ${weather.date}: ${weather.actualWeather}`,
      );
      this.logger.info(
        `[WeatherScheduler] 📰 Tomorrow's forecast: ${JSON.stringify(weather.forecasts)}`,
      );
    } catch (error) {
      this.logger.error(
        `[WeatherScheduler] �?Failed to generate weather: ${(error as Error).message}`,
      );
    }
  }
}
