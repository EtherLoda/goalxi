import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WeatherService } from './weather.service';
import { WeatherEntity, WeatherType, WeatherForecast } from '@goalxi/database';

describe('WeatherService', () => {
  let service: WeatherService;
  let repository: jest.Mocked<Repository<WeatherEntity>>;

  const mockRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WeatherService,
        {
          provide: getRepositoryToken(WeatherEntity),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<WeatherService>(WeatherService);
    repository = module.get(getRepositoryToken(WeatherEntity));

    jest.clearAllMocks();
  });

  describe('selectRandomWeather', () => {
    it('should return a valid WeatherType', () => {
      const weather = service.selectRandomWeather();
      expect(Object.values(WeatherType)).toContain(weather);
    });

    it('should return different weather types on multiple calls', () => {
      const results = new Set<WeatherType>();
      for (let i = 0; i < 100; i++) {
        results.add(service.selectRandomWeather());
      }
      expect(results.size).toBeGreaterThan(1);
    });
  });

  describe('generateForecastsFromToday', () => {
    it('should return 2 or 3 forecasts', () => {
      const forecasts = service.generateForecastsFromToday(WeatherType.SUNNY);
      expect(forecasts.length).toBeGreaterThanOrEqual(2);
      expect(forecasts.length).toBeLessThanOrEqual(3);
    });

    it('should return forecasts with valid weather types', () => {
      const forecasts = service.generateForecastsFromToday(WeatherType.RAINY);
      for (const forecast of forecasts) {
        expect(Object.values(WeatherType)).toContain(forecast.weather);
      }
    });

    it('should have probabilities summing to 100', () => {
      const forecasts = service.generateForecastsFromToday(WeatherType.CLOUDY);
      const sum = forecasts.reduce((acc, f) => acc + f.probability, 0);
      expect(sum).toBe(100);
    });

    it('should have probabilities in valid range (0-100)', () => {
      const forecasts = service.generateForecastsFromToday(WeatherType.WINDY);
      for (const forecast of forecasts) {
        expect(forecast.probability).toBeGreaterThanOrEqual(0);
        expect(forecast.probability).toBeLessThanOrEqual(100);
      }
    });

    it('should have main probability between 40-70', () => {
      const forecasts = service.generateForecastsFromToday(WeatherType.SUNNY);
      const mainProb = forecasts[0].probability;
      expect(mainProb).toBeGreaterThanOrEqual(40);
      expect(mainProb).toBeLessThanOrEqual(70);
    });

    it('should be sorted by probability descending', () => {
      const forecasts = service.generateForecastsFromToday(WeatherType.FOGGY);
      for (let i = 1; i < forecasts.length; i++) {
        expect(forecasts[i - 1].probability).toBeGreaterThanOrEqual(
          forecasts[i].probability,
        );
      }
    });

    it('should handle all weather types without error', () => {
      for (const weather of Object.values(WeatherType)) {
        expect(() => service.generateForecastsFromToday(weather)).not.toThrow();
      }
    });
  });

  describe('generateRandomForecasts', () => {
    it('should return 2 or 3 forecasts', () => {
      const forecasts = service.generateRandomForecasts();
      expect(forecasts.length).toBeGreaterThanOrEqual(2);
      expect(forecasts.length).toBeLessThanOrEqual(3);
    });

    it('should return forecasts with valid weather types', () => {
      const forecasts = service.generateRandomForecasts();
      for (const forecast of forecasts) {
        expect(Object.values(WeatherType)).toContain(forecast.weather);
      }
    });

    it('should have probabilities summing to 100', () => {
      const forecasts = service.generateRandomForecasts();
      const sum = forecasts.reduce((acc, f) => acc + f.probability, 0);
      expect(sum).toBe(100);
    });

    it('should have main probability between 40-70', () => {
      const forecasts = service.generateRandomForecasts();
      const mainProb = forecasts[0].probability;
      expect(mainProb).toBeGreaterThanOrEqual(40);
      expect(mainProb).toBeLessThanOrEqual(70);
    });

    it('should be sorted by probability descending', () => {
      const forecasts = service.generateRandomForecasts();
      for (let i = 1; i < forecasts.length; i++) {
        expect(forecasts[i - 1].probability).toBeGreaterThanOrEqual(
          forecasts[i].probability,
        );
      }
    });

    it('should produce varied results across multiple calls', () => {
      const results: string[] = [];
      for (let i = 0; i < 20; i++) {
        const forecasts = service.generateRandomForecasts();
        results.push(
          forecasts.map((f) => `${f.weather}:${f.probability}`).join(','),
        );
      }
      const uniqueResults = new Set(results);
      expect(uniqueResults.size).toBeGreaterThan(1);
    });
  });

  describe('getWeatherByDate', () => {
    it('should call repository with correct parameters', async () => {
      const date = '2026-04-01';
      const locationId = 'default';
      await service.getWeatherByDate(date, locationId);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { date, locationId },
      });
    });

    it('should return weather entity when found', async () => {
      const mockWeather = {
        id: '1',
        date: '2026-04-01',
        locationId: 'default',
        actualWeather: WeatherType.SUNNY,
        forecasts: [] as any[],
      };
      repository.findOne.mockResolvedValue(
        mockWeather as unknown as WeatherEntity,
      );

      const result = await service.getWeatherByDate('2026-04-01');
      expect(result).toEqual(mockWeather);
    });

    it('should return null when not found', async () => {
      repository.findOne.mockResolvedValue(null);

      const result = await service.getWeatherByDate('2026-04-01');
      expect(result).toBeNull();
    });
  });

  describe('getTodayWeather', () => {
    it('should call getWeatherByDate with today date', async () => {
      const today = new Date().toISOString().split('T')[0];
      repository.findOne.mockResolvedValue(null);

      await service.getTodayWeather();
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { date: today, locationId: 'default' },
      });
    });
  });

  describe('getTomorrowForecast', () => {
    it('should return forecasts from today weather when available', async () => {
      const mockForecasts: WeatherForecast[] = [
        { weather: WeatherType.SUNNY, probability: 50 },
        { weather: WeatherType.CLOUDY, probability: 30 },
        { weather: WeatherType.RAINY, probability: 20 },
      ];
      const today = new Date().toISOString().split('T')[0];
      repository.findOne.mockResolvedValue({
        id: '1',
        date: today,
        locationId: 'default',
        actualWeather: WeatherType.SUNNY,
        forecasts: mockForecasts,
      } as unknown as WeatherEntity);

      const result = await service.getTomorrowForecast();
      expect(result).toEqual(mockForecasts);
    });

    it('should return random forecasts when no today weather', async () => {
      repository.findOne.mockResolvedValue(null);

      const result = await service.getTomorrowForecast();
      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result.length).toBeLessThanOrEqual(3);
    });
  });

  describe('createOrUpdateTodayWeather', () => {
    it('should create new weather when none exists', async () => {
      const today = new Date().toISOString().split('T')[0];
      repository.findOne.mockResolvedValue(null);

      const mockWeather = {
        id: '1',
        date: today,
        locationId: 'default',
        actualWeather: WeatherType.SUNNY,
        forecasts: [] as any[],
      };
      repository.create.mockReturnValue(
        mockWeather as unknown as WeatherEntity,
      );
      repository.save.mockResolvedValue(
        mockWeather as unknown as WeatherEntity,
      );

      const result = await service.createOrUpdateTodayWeather();

      expect(repository.create).toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalled();
      expect(result.actualWeather).toBeDefined();
      expect(result.forecasts).toBeDefined();
    });

    it('should update existing weather when found', async () => {
      const today = new Date().toISOString().split('T')[0];
      const existingWeather = {
        id: '1',
        date: today,
        locationId: 'default',
        actualWeather: WeatherType.CLOUDY,
        forecasts: [] as any[],
      };
      repository.findOne.mockResolvedValue(
        existingWeather as unknown as WeatherEntity,
      );
      repository.save.mockResolvedValue(
        existingWeather as unknown as WeatherEntity,
      );

      await service.createOrUpdateTodayWeather();

      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalled();
    });

    it('should use forecast prediction as actual weather when yesterday has forecasts', async () => {
      const today = new Date().toISOString().split('T')[0];
      const yesterdayDate = new Date();
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterdayDateStr = yesterdayDate.toISOString().split('T')[0];

      const mockYesterdayWeather = {
        id: '2',
        date: yesterdayDateStr,
        locationId: 'default',
        actualWeather: WeatherType.RAINY,
        forecasts: [
          { weather: WeatherType.CLOUDY, probability: 60 },
          { weather: WeatherType.SUNNY, probability: 40 },
        ],
      };

      // Use mockImplementation to handle calls based on date argument
      repository.findOne.mockImplementation(async (query: any) => {
        if (query.where.date === yesterdayDateStr) {
          return mockYesterdayWeather as unknown as WeatherEntity;
        }
        return null;
      });

      const mockNewWeather = {
        id: '1',
        date: today,
        locationId: 'default',
        actualWeather: WeatherType.CLOUDY,
        forecasts: [] as any[],
      };
      repository.create.mockReturnValue(
        mockNewWeather as unknown as WeatherEntity,
      );
      repository.save.mockImplementation((entity) =>
        Promise.resolve(entity as unknown as WeatherEntity),
      );

      const result = await service.createOrUpdateTodayWeather();

      // The actual weather should be from yesterday's first forecast
      expect(result.actualWeather).toBe(WeatherType.CLOUDY);
    });
  });

  describe('WeatherType enum coverage', () => {
    it('should have all expected weather types', () => {
      expect(WeatherType.SUNNY).toBe('sunny');
      expect(WeatherType.CLOUDY).toBe('cloudy');
      expect(WeatherType.RAINY).toBe('rainy');
      expect(WeatherType.HEAVY_RAIN).toBe('heavy_rain');
      expect(WeatherType.WINDY).toBe('windy');
      expect(WeatherType.FOGGY).toBe('foggy');
      expect(WeatherType.SNOWY).toBe('snowy');
    });

    it('should have 7 weather types', () => {
      expect(Object.keys(WeatherType)).toHaveLength(7);
    });
  });
});
