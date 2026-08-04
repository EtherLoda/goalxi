import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { WeatherEntity, WeatherType } from '@goalxi/database';
import { WeatherService } from './weather.service';

describe('WeatherService', () => {
  let service: WeatherService;
  let repo: Repository<WeatherEntity>;

  const mockRepo = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WeatherService,
        {
          provide: getRepositoryToken(WeatherEntity),
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<WeatherService>(WeatherService);
    repo = module.get<Repository<WeatherEntity>>(getRepositoryToken(WeatherEntity));
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getForecast', () => {
    it('throws NotFoundException for an invalid date string', async () => {
      await expect(service.getForecast('not-a-date')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns persisted forecasts shifted +1 day when a row exists', async () => {
      mockRepo.findOne.mockResolvedValue({
        date: '2026-08-04',
        locationId: 'default',
        actualWeather: WeatherType.SUNNY,
        forecasts: [
          { weather: WeatherType.SUNNY, probability: 55 },
          { weather: WeatherType.CLOUDY, probability: 30 },
          { weather: WeatherType.RAINY, probability: 15 },
        ],
      } as WeatherEntity);

      const result = await service.getForecast('2026-08-04', 'default');

      expect(result.date).toBe('2026-08-05'); // +1 day target
      expect(result.locationId).toBe('default');
      expect(result.source).toBe('persisted');
      expect(result.forecasts).toHaveLength(3);
      expect(result.forecasts[0].weather).toBe(WeatherType.SUNNY);
      expect(result.forecasts[0].probability).toBe(55);
    });

    it('falls back to generated forecasts when no row exists', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const result = await service.getForecast('2026-08-04', 'default');

      expect(result.source).toBe('generated');
      expect(result.date).toBe('2026-08-05');
      expect(result.forecasts.length).toBeGreaterThanOrEqual(2);
      expect(result.forecasts.length).toBeLessThanOrEqual(3);
      const total = result.forecasts.reduce((s, f) => s + f.probability, 0);
      expect(total).toBe(100);
    });

    it('falls back when a row exists but has no forecasts payload', async () => {
      mockRepo.findOne.mockResolvedValue({
        date: '2026-08-04',
        locationId: 'default',
        actualWeather: WeatherType.SUNNY,
        forecasts: undefined,
      } as WeatherEntity);

      const result = await service.getForecast('2026-08-04', 'default');

      expect(result.source).toBe('generated');
      expect(result.forecasts.length).toBeGreaterThan(0);
    });

    it('uses default location when none is provided', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const result = await service.getForecast('2026-08-04');

      expect(result.locationId).toBe('default');
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { date: '2026-08-04', locationId: 'default' },
      });
    });
  });

  describe('generateRandomForecasts', () => {
    it('returns 2-3 entries that sum to 100 and are sorted desc', () => {
      const forecasts = service.generateRandomForecasts();
      expect(forecasts.length).toBeGreaterThanOrEqual(2);
      expect(forecasts.length).toBeLessThanOrEqual(3);
      const sum = forecasts.reduce((s, f) => s + f.probability, 0);
      expect(sum).toBe(100);
      for (let i = 1; i < forecasts.length; i++) {
        expect(forecasts[i - 1].probability).toBeGreaterThanOrEqual(
          forecasts[i].probability,
        );
      }
    });

    it('only emits valid WeatherType values', () => {
      const valid = new Set(Object.values(WeatherType));
      for (let i = 0; i < 20; i++) {
        const f = service.generateRandomForecasts();
        for (const entry of f) {
          expect(valid.has(entry.weather)).toBe(true);
          expect(entry.probability).toBeGreaterThan(0);
          expect(entry.probability).toBeLessThanOrEqual(100);
        }
      }
    });
  });
});
