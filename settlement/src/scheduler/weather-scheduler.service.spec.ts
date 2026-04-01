import { Test, TestingModule } from '@nestjs/testing';
import { WeatherSchedulerService } from './weather-scheduler.service';
import { WeatherService } from './weather.service';
import { WeatherEntity, WeatherType, WeatherForecast } from '@goalxi/database';

describe('WeatherSchedulerService', () => {
    let service: WeatherSchedulerService;
    let weatherService: jest.Mocked<WeatherService>;

    const mockWeatherService = {
        createOrUpdateTodayWeather: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                WeatherSchedulerService,
                {
                    provide: WeatherService,
                    useValue: mockWeatherService,
                },
            ],
        }).compile();

        service = module.get<WeatherSchedulerService>(WeatherSchedulerService);
        weatherService = module.get(WeatherService);

        jest.clearAllMocks();
    });

    describe('generateDailyWeather', () => {
        it('should call weatherService.createOrUpdateTodayWeather', async () => {
            const mockWeather = {
                id: '1',
                date: '2026-04-01',
                locationId: 'default',
                actualWeather: WeatherType.SUNNY,
                forecasts: [
                    { weather: WeatherType.CLOUDY, probability: 60 },
                    { weather: WeatherType.RAINY, probability: 40 },
                ] as WeatherForecast[],
            };
            mockWeatherService.createOrUpdateTodayWeather.mockResolvedValue(mockWeather as WeatherEntity);

            await service.generateDailyWeather();

            expect(mockWeatherService.createOrUpdateTodayWeather).toHaveBeenCalledTimes(1);
        });

        it('should log weather creation success', async () => {
            const mockWeather = {
                id: '1',
                date: '2026-04-01',
                locationId: 'default',
                actualWeather: WeatherType.RAINY,
                forecasts: [
                    { weather: WeatherType.CLOUDY, probability: 70 },
                    { weather: WeatherType.SUNNY, probability: 30 },
                ] as WeatherForecast[],
            };
            mockWeatherService.createOrUpdateTodayWeather.mockResolvedValue(mockWeather as WeatherEntity);

            const loggerSpy = jest.spyOn(service['logger'], 'log');

            await service.generateDailyWeather();

            expect(loggerSpy).toHaveBeenCalledWith(
                expect.stringContaining('Generated weather for 2026-04-01: rainy')
            );
        });

        it('should log forecast information', async () => {
            const forecasts: WeatherForecast[] = [
                { weather: WeatherType.CLOUDY, probability: 60 },
                { weather: WeatherType.RAINY, probability: 40 },
            ];
            const mockWeather = {
                id: '1',
                date: '2026-04-01',
                locationId: 'default',
                actualWeather: WeatherType.SUNNY,
                forecasts,
            };
            mockWeatherService.createOrUpdateTodayWeather.mockResolvedValue(mockWeather as WeatherEntity);

            const loggerSpy = jest.spyOn(service['logger'], 'log');

            await service.generateDailyWeather();

            expect(loggerSpy).toHaveBeenCalledWith(
                expect.stringContaining("Tomorrow's forecast:")
            );
        });

        it('should handle errors gracefully', async () => {
            const error = new Error('Database connection failed');
            mockWeatherService.createOrUpdateTodayWeather.mockRejectedValue(error);

            const loggerErrorSpy = jest.spyOn(service['logger'], 'error');

            await service.generateDailyWeather();

            expect(loggerErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Failed to generate weather: Database connection failed')
            );
        });

        it('should not throw when weather generation fails', async () => {
            mockWeatherService.createOrUpdateTodayWeather.mockRejectedValue(new Error('DB error'));

            await expect(service.generateDailyWeather()).resolves.not.toThrow();
        });
    });
});
