import { Injectable, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WeatherEntity, WeatherType } from '@goalxi/database';

/**
 * 天气生成权重（基础概率）
 */
const BASE_WEATHER_WEIGHTS: Record<WeatherType, number> = {
  [WeatherType.SUNNY]: 25,
  [WeatherType.CLOUDY]: 35,
  [WeatherType.RAINY]: 20,
  [WeatherType.WINDY]: 10,
  [WeatherType.FOGGY]: 7,
  [WeatherType.SNOWY]: 3,
};

/**
 * How many days of forecast to seed during init. Sized to
 * cover the first matchday weekend + a 4-day buffer so the
 * match scheduler always finds a `weather` row when
 * preprocessing a Week 1 fixture. The settlement's daily
 * cron (`WeatherScheduler`) extends this rolling window
 * indefinitely after init.
 */
const FORECAST_DAYS = 7;

@Injectable()
export class WeatherGenerator {
  private readonly DEFAULT_LOCATION = 'default';

  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    @InjectRepository(WeatherEntity)
    private readonly weatherRepository: Repository<WeatherEntity>,
  ) {}

  /**
   * 随机选择一种天气（基于基础权重）
   */
  selectRandomWeather(): WeatherType {
    const weatherTypes = Object.keys(BASE_WEATHER_WEIGHTS) as WeatherType[];
    const weightedList: WeatherType[] = [];

    for (const weather of weatherTypes) {
      const weight = BASE_WEATHER_WEIGHTS[weather];
      for (let i = 0; i < weight; i++) {
        weightedList.push(weather);
      }
    }

    const randomIndex = Math.floor(Math.random() * weightedList.length);
    return weightedList[randomIndex];
  }

  /**
   * Seed a 7-day rolling forecast starting at `initDate`'s
   * calendar day. Idempotent — rows whose (date, location)
   * already exists are skipped, so re-running init (or
   * the daily cron, which calls a similar upsert) doesn't
   * stomp on existing data.
   *
   * `initDate` is the date the init script was anchored
   * to. The forecast covers that day + 6 days forward, so
   * the first senior matchday (next-Monday 00:00 UTC) is
   * always inside the window.
   */
  async generateInitialWeather(initDate: Date): Promise<void> {
    const start = new Date(
      Date.UTC(
        initDate.getUTCFullYear(),
        initDate.getUTCMonth(),
        initDate.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );

    let created = 0;
    let skipped = 0;
    for (let i = 0; i < FORECAST_DAYS; i++) {
      const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = this.formatDate(d);
      const existing = await this.weatherRepository.findOne({
        where: { date: dateStr, locationId: this.DEFAULT_LOCATION },
      });
      if (existing) {
        skipped++;
        continue;
      }
      const weather = this.weatherRepository.create({
        date: dateStr,
        locationId: this.DEFAULT_LOCATION,
        actualWeather: this.selectRandomWeather(),
      });
      await this.weatherRepository.save(weather);
      created++;
    }

    this.logger.info(
      `[WeatherGenerator] Forecast window: created=${created}, skipped=${skipped}, days=${FORECAST_DAYS}`,
    );
  }

  /**
   * Format a `Date` as `YYYY-MM-DD`. The dates above are
   * constructed in UTC (`Date.UTC(year, month, day, 0, 0, 0, 0)`),
   * so the formatter must also be UTC-anchored — using local
   * `getFullYear()` / `getMonth()` / `getDate()` was a silent
   * timezone bug: in `UTC-12` (Baker Island, no DST) midnight
   * UTC is noon local on the *previous* calendar day, so the
   * resulting YYYY-MM-DD string was off by one day and the
   * row's date didn't match what every other code path (which
   * uses `Date.toISOString().slice(0, 10)` on the same instant)
   * expected. In `UTC+8` (CN) the bug didn't fire because
   * midnight UTC = 08:00 local = same day, but the code was
   * wrong by design.
   */
  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
