import { WeatherEntity, WeatherForecast, WeatherType } from '@goalxi/database';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WeatherForecastResDto } from './dto/weather-forecast.res.dto';

/**
 * Base probability weights (no Markov chain) — used as a fallback when the
 * caller wants a forecast for a date with no historical weather data.
 */
const BASE_WEATHER_WEIGHTS: Record<WeatherType, number> = {
  [WeatherType.SUNNY]: 25,
  [WeatherType.CLOUDY]: 30,
  [WeatherType.RAINY]: 20,
  [WeatherType.HEAVY_RAIN]: 5,
  [WeatherType.WINDY]: 10,
  [WeatherType.FOGGY]: 7,
  [WeatherType.SNOWY]: 3,
};

const DEFAULT_LOCATION = 'default';

/**
 * Public-facing forecast window. Anything beyond this returns
 * `source: 'out_of_range'` with an empty forecast array — we cap at
 * 3 days because predictions lose confidence quickly and we want to be
 * honest with the UI rather than shipping made-up forecasts.
 */
export const MAX_FORECAST_DAYS = 3;

@Injectable()
export class WeatherService {
  constructor(
    @InjectRepository(WeatherEntity)
    private readonly weatherRepository: Repository<WeatherEntity>,
  ) {}

  /**
   * Returns the weather forecast **for** the requested date. The persisted
   * `weather` table stores tomorrow's prediction on each row (settlement
   * convention: row dated X has `forecasts` for X+1), so to get the
   * forecast for `date` we read the row dated `date - 1`.
   *
   * Behaviour:
   *  - `source: 'persisted'`  → row found with forecasts
   *  - `source: 'generated'`  → no row, we synthesise from base weights
   *  - `source: 'out_of_range'` → date is more than `MAX_FORECAST_DAYS`
   *    ahead of today; `forecasts` is empty and the UI should render
   *    "out of range" rather than fake a prediction.
   */
  async getForecast(
    date: string,
    locationId: string = DEFAULT_LOCATION,
  ): Promise<WeatherForecastResDto> {
    if (!this.isValidDate(date)) {
      throw new NotFoundException(`Invalid date: ${date}`);
    }

    const today = this.formatDate(new Date());
    const daysAhead = this.daysBetween(today, date);

    if (daysAhead > MAX_FORECAST_DAYS) {
      return {
        date,
        locationId,
        forecasts: [],
        source: 'out_of_range',
      };
    }

    // Look up the row that holds the forecast for `date`. The convention is
    // "row X carries the forecast for X+1", so we read X = date - 1.
    const previousDate = this.addDays(date, -1);
    const row = await this.weatherRepository.findOne({
      where: { date: previousDate, locationId },
    });

    if (row?.forecasts && row.forecasts.length > 0) {
      return {
        date,
        locationId,
        forecasts: row.forecasts,
        source: 'persisted',
      };
    }

    return {
      date,
      locationId,
      forecasts: this.generateRandomForecasts(),
      source: 'generated',
    };
  }

  /**
   * Generates a 2-3 option forecast without persistence. Exposed for unit
   * tests and for callers that want a deterministic-ish preview.
   */
  generateRandomForecasts(): WeatherForecast[] {
    const forecastCount = Math.random() < 0.5 ? 2 : 3;
    const weatherTypes = Object.keys(BASE_WEATHER_WEIGHTS) as WeatherType[];

    const weightedList: WeatherType[] = [];
    for (const weather of weatherTypes) {
      const weight = BASE_WEATHER_WEIGHTS[weather];
      for (let i = 0; i < weight; i++) weightedList.push(weather);
    }

    const selectedWeathers = new Set<WeatherType>();
    while (selectedWeathers.size < forecastCount) {
      const idx = Math.floor(Math.random() * weightedList.length);
      selectedWeathers.add(weightedList[idx]);
    }

    const selectedArray = Array.from(selectedWeathers);
    const mainProbability = 40 + Math.floor(Math.random() * 31);
    let remainingProbability = 100 - mainProbability;

    const mainWeather =
      selectedArray[Math.floor(Math.random() * selectedArray.length)];
    const forecasts: WeatherForecast[] = [
      { weather: mainWeather, probability: mainProbability },
    ];
    selectedWeathers.delete(mainWeather);

    const remaining = Array.from(selectedWeathers);
    for (let i = 0; i < remaining.length; i++) {
      let prob: number;
      if (i === remaining.length - 1) {
        // Last item gets whatever's left, no clamp. Without this the sum
        // can drift (e.g. 3-option case where the prior non-last item
        // consumed all remaining probability — clamping to 5 would push
        // the total above 100).
        prob = remainingProbability;
      } else {
        const random = 10 + Math.floor(Math.random() * 31);
        prob = Math.max(5, Math.min(random, remainingProbability));
      }
      remainingProbability -= prob;
      forecasts.push({ weather: remaining[i], probability: prob });
    }

    forecasts.sort((a, b) => b.probability - a.probability);
    return forecasts;
  }

  private isValidDate(s: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(s + 'T00:00:00Z');
    return !Number.isNaN(d.getTime());
  }

  private addDays(date: string, days: number): string {
    const d = new Date(date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  /** Whole-day diff in UTC, ignoring DST. */
  private daysBetween(fromYmd: string, toYmd: string): number {
    const from = Date.UTC(
      Number(fromYmd.slice(0, 4)),
      Number(fromYmd.slice(5, 7)) - 1,
      Number(fromYmd.slice(8, 10)),
    );
    const to = Date.UTC(
      Number(toYmd.slice(0, 4)),
      Number(toYmd.slice(5, 7)) - 1,
      Number(toYmd.slice(8, 10)),
    );
    return Math.round((to - from) / (24 * 60 * 60 * 1000));
  }
}
