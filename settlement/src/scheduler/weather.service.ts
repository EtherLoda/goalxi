import {Injectable, Logger, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WeatherEntity, WeatherType, WeatherForecast } from '@goalxi/database';

/**
 * 天气生成权重（基础概率�? */
const BASE_WEATHER_WEIGHTS: Record<WeatherType, number> = {
  [WeatherType.SUNNY]: 25,
  [WeatherType.CLOUDY]: 30,
  [WeatherType.RAINY]: 20,
  [WeatherType.HEAVY_RAIN]: 5,
  [WeatherType.WINDY]: 10,
  [WeatherType.FOGGY]: 7,
  [WeatherType.SNOWY]: 3,
};

/**
 * 今日天气 �?明日天气预报的概率分布（马尔可夫链转移矩阵）
 */
const WEATHER_TRANSITION: Record<WeatherType, Record<WeatherType, number>> = {
  [WeatherType.SUNNY]: {
    [WeatherType.SUNNY]: 35,
    [WeatherType.CLOUDY]: 30,
    [WeatherType.RAINY]: 15,
    [WeatherType.HEAVY_RAIN]: 5,
    [WeatherType.WINDY]: 10,
    [WeatherType.FOGGY]: 3,
    [WeatherType.SNOWY]: 2,
  },
  [WeatherType.CLOUDY]: {
    [WeatherType.CLOUDY]: 30,
    [WeatherType.SUNNY]: 25,
    [WeatherType.RAINY]: 25,
    [WeatherType.HEAVY_RAIN]: 5,
    [WeatherType.WINDY]: 10,
    [WeatherType.FOGGY]: 3,
    [WeatherType.SNOWY]: 2,
  },
  [WeatherType.RAINY]: {
    [WeatherType.RAINY]: 30,
    [WeatherType.CLOUDY]: 25,
    [WeatherType.HEAVY_RAIN]: 15,
    [WeatherType.SUNNY]: 15,
    [WeatherType.WINDY]: 8,
    [WeatherType.FOGGY]: 5,
    [WeatherType.SNOWY]: 2,
  },
  [WeatherType.HEAVY_RAIN]: {
    [WeatherType.HEAVY_RAIN]: 35,
    [WeatherType.RAINY]: 30,
    [WeatherType.CLOUDY]: 20,
    [WeatherType.WINDY]: 8,
    [WeatherType.FOGGY]: 5,
    [WeatherType.SUNNY]: 1,
    [WeatherType.SNOWY]: 1,
  },
  [WeatherType.WINDY]: {
    [WeatherType.WINDY]: 30,
    [WeatherType.CLOUDY]: 25,
    [WeatherType.SUNNY]: 20,
    [WeatherType.RAINY]: 15,
    [WeatherType.HEAVY_RAIN]: 5,
    [WeatherType.FOGGY]: 3,
    [WeatherType.SNOWY]: 2,
  },
  [WeatherType.FOGGY]: {
    [WeatherType.FOGGY]: 35,
    [WeatherType.CLOUDY]: 30,
    [WeatherType.RAINY]: 20,
    [WeatherType.HEAVY_RAIN]: 5,
    [WeatherType.WINDY]: 5,
    [WeatherType.SUNNY]: 3,
    [WeatherType.SNOWY]: 2,
  },
  [WeatherType.SNOWY]: {
    [WeatherType.SNOWY]: 40,
    [WeatherType.FOGGY]: 25,
    [WeatherType.RAINY]: 15,
    [WeatherType.CLOUDY]: 10,
    [WeatherType.HEAVY_RAIN]: 5,
    [WeatherType.WINDY]: 3,
    [WeatherType.SUNNY]: 2,
  },
};

@Injectable()
export class WeatherService {
  private readonly DEFAULT_LOCATION = 'default';

  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    @InjectRepository(WeatherEntity)
    private readonly weatherRepository: Repository<WeatherEntity>,
  ) {}

  /**
   * 获取指定日期和地点的天气
   */
  async getWeatherByDate(
    date: string,
    locationId: string = this.DEFAULT_LOCATION,
  ): Promise<WeatherEntity | null> {
    return this.weatherRepository.findOne({
      where: { date, locationId },
    });
  }

  /**
   * 获取今天的实际天�?   */
  async getTodayWeather(
    locationId: string = this.DEFAULT_LOCATION,
  ): Promise<WeatherEntity | null> {
    const today = this.formatDate(new Date());
    return this.getWeatherByDate(today, locationId);
  }

  /**
   * 获取明天的天气预报（2-3个选项�?   */
  async getTomorrowForecast(
    locationId: string = this.DEFAULT_LOCATION,
  ): Promise<WeatherForecast[]> {
    const today = await this.getTodayWeather(locationId);
    if (!today || !today.forecasts) {
      return this.generateRandomForecasts();
    }
    return today.forecasts;
  }

  /**
   * 根据今日天气生成明日天气预报
   */
  generateForecastsFromToday(todayWeather: WeatherType): WeatherForecast[] {
    const transition = WEATHER_TRANSITION[todayWeather];
    const forecastCount = Math.random() < 0.5 ? 2 : 3;
    const forecasts: WeatherForecast[] = [];

    const weatherTypes = Object.keys(transition) as WeatherType[];
    const weightedList: WeatherType[] = [];

    for (const weather of weatherTypes) {
      const weight = transition[weather];
      for (let i = 0; i < weight; i++) {
        weightedList.push(weather);
      }
    }

    const selectedWeathers = new Set<WeatherType>();

    while (selectedWeathers.size < forecastCount) {
      const randomIndex = Math.floor(Math.random() * weightedList.length);
      selectedWeathers.add(weightedList[randomIndex]);
    }

    const selectedArray = Array.from(selectedWeathers);
    const totalWeight = selectedArray.reduce(
      (sum, w) => sum + transition[w],
      0,
    );

    const mainProbability = 40 + Math.floor(Math.random() * 31);
    let remainingProbability = 100 - mainProbability;

    const mainWeather =
      selectedArray[Math.floor(Math.random() * selectedArray.length)];
    forecasts.push({
      weather: mainWeather,
      probability: mainProbability,
    });
    selectedWeathers.delete(mainWeather);

    const remaining = Array.from(selectedWeathers);
    for (let i = 0; i < remaining.length; i++) {
      const weather = remaining[i];
      const baseWeight = transition[weather];
      let prob: number;

      if (i === remaining.length - 1) {
        prob = remainingProbability;
      } else {
        const maxAssign = Math.min(
          remainingProbability - (remaining.length - i - 1) * 10,
          40,
        );
        const minAssign = Math.max(10, remainingProbability - 50);
        prob =
          minAssign + Math.floor(Math.random() * (maxAssign - minAssign + 1));
      }

      prob = Math.max(5, Math.min(prob, remainingProbability));
      remainingProbability -= prob;

      forecasts.push({
        weather,
        probability: prob,
      });
    }

    forecasts.sort((a, b) => b.probability - a.probability);

    return forecasts;
  }

  /**
   * 随机生成天气预报（无历史数据时使用）
   */
  generateRandomForecasts(): WeatherForecast[] {
    const forecastCount = Math.random() < 0.5 ? 2 : 3;
    const forecasts: WeatherForecast[] = [];

    const weatherTypes = Object.keys(BASE_WEATHER_WEIGHTS) as WeatherType[];
    const weightedList: WeatherType[] = [];

    for (const weather of weatherTypes) {
      const weight = BASE_WEATHER_WEIGHTS[weather];
      for (let i = 0; i < weight; i++) {
        weightedList.push(weather);
      }
    }

    const selectedWeathers = new Set<WeatherType>();
    while (selectedWeathers.size < forecastCount) {
      const randomIndex = Math.floor(Math.random() * weightedList.length);
      selectedWeathers.add(weightedList[randomIndex]);
    }

    const mainProbability = 40 + Math.floor(Math.random() * 31);
    let remainingProbability = 100 - mainProbability;

    const selectedArray = Array.from(selectedWeathers);
    const mainWeather =
      selectedArray[Math.floor(Math.random() * selectedArray.length)];
    forecasts.push({
      weather: mainWeather,
      probability: mainProbability,
    });
    selectedWeathers.delete(mainWeather);

    const remaining = Array.from(selectedWeathers);
    for (let i = 0; i < remaining.length; i++) {
      let prob: number;
      if (i === remaining.length - 1) {
        prob = remainingProbability;
      } else {
        prob = 10 + Math.floor(Math.random() * 31);
      }
      remainingProbability -= prob;
      forecasts.push({
        weather: remaining[i],
        probability: prob,
      });
    }

    forecasts.sort((a, b) => b.probability - a.probability);
    return forecasts;
  }

  /**
   * 随机选择一种天气（基于基础权重�?   */
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
   * 创建或更新今日天气记�?   */
  async createOrUpdateTodayWeather(
    locationId: string = this.DEFAULT_LOCATION,
  ): Promise<WeatherEntity> {
    const today = this.formatDate(new Date());

    const yesterday = await this.getWeatherByDate(
      this.formatDate(this.addDays(new Date(), -1)),
      locationId,
    );

    let actualWeather: WeatherType;
    if (yesterday && yesterday.forecasts && yesterday.forecasts.length > 0) {
      actualWeather = yesterday.forecasts[0].weather;
    } else {
      actualWeather = this.selectRandomWeather();
    }

    const forecasts = this.generateForecastsFromToday(actualWeather);

    let weather = await this.getWeatherByDate(today, locationId);

    if (weather) {
      weather.actualWeather = actualWeather;
      weather.forecasts = forecasts;
    } else {
      weather = this.weatherRepository.create({
        date: today,
        locationId,
        actualWeather,
        forecasts,
      });
    }

    return this.weatherRepository.save(weather);
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }
}
