import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { WeatherService } from './weather.service';

@Injectable()
export class WeatherSchedulerService {
    private readonly logger = new Logger(WeatherSchedulerService.name);

    constructor(private readonly weatherService: WeatherService) {}

    // ===== SCHEDULER: Daily Weather Generation =====
    // Run at midnight (00:00) UTC every day
    @Cron('0 0 0 * * *')
    async generateDailyWeather() {
        const now = new Date();
        this.logger.log(`[WeatherScheduler] Generating daily weather at ${now.toISOString()}`);

        try {
            const weather = await this.weatherService.createOrUpdateTodayWeather();
            this.logger.log(
                `[WeatherScheduler] ✅ Generated weather for ${weather.date}: ${weather.actualWeather}`
            );
            this.logger.log(
                `[WeatherScheduler] 📰 Tomorrow's forecast: ${JSON.stringify(weather.forecasts)}`
            );
        } catch (error) {
            this.logger.error(
                `[WeatherScheduler] ❌ Failed to generate weather: ${(error as Error).message}`
            );
        }
    }
}
