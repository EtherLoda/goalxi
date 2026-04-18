import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WeatherEntity, WeatherType } from '@goalxi/database';

/**
 * 天气生成权重（基础概率）
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

@Injectable()
export class WeatherGenerator {
  private readonly logger = new Logger(WeatherGenerator.name);
  private readonly DEFAULT_LOCATION = 'default';

  constructor(
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
   * 生成第一天的天气（后续由 WeatherScheduler 每日生成）
   */
  async generateInitialWeather(): Promise<void> {
    const today = this.formatDate(new Date());

    const existing = await this.weatherRepository.findOne({
      where: { date: today, locationId: this.DEFAULT_LOCATION },
    });

    if (existing) {
      this.logger.log(
        `[WeatherGenerator] Weather for ${today} already exists, skipping`,
      );
      return;
    }

    const weather = this.weatherRepository.create({
      date: today,
      locationId: this.DEFAULT_LOCATION,
      actualWeather: this.selectRandomWeather(),
    });

    await this.weatherRepository.save(weather);
    this.logger.log(
      `[WeatherGenerator] Generated initial weather for ${today}`,
    );
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
