import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { WeatherEntity, WeatherType } from '@goalxi/database';
import { MAX_FORECAST_DAYS, WeatherService } from './weather.service';

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

    it('returns the persisted forecast for the requested date (not +1 day)', async () => {
      // Persisted row at 2026-08-04 carries the forecast for 2026-08-05.
      // The caller asks for 2026-08-05 directly, so we should read the
      // 2026-08-04 row and return its forecasts as-is.
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

      const result = await service.getForecast('2026-08-05', 'default');

      expect(result.date).toBe('2026-08-05'); // the requested target, not +1
      expect(result.locationId).toBe('default');
      expect(result.source).toBe('persisted');
      expect(result.forecasts).toHaveLength(3);
      expect(result.forecasts[0].weather).toBe(WeatherType.SUNNY);
      expect(result.forecasts[0].probability).toBe(55);
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { date: '2026-08-04', locationId: 'default' },
      });
    });

    it('falls back to generated forecasts when no row exists', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const result = await service.getForecast('2026-08-05', 'default');

      expect(result.source).toBe('generated');
      expect(result.date).toBe('2026-08-05'); // still the requested target
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

      const result = await service.getForecast('2026-08-05', 'default');

      expect(result.source).toBe('generated');
      expect(result.forecasts.length).toBeGreaterThan(0);
    });

    it('uses default location when none is provided', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const result = await service.getForecast('2026-08-05');

      expect(result.locationId).toBe('default');
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { date: '2026-08-04', locationId: 'default' },
      });
    });

    it('returns source=out_of_range when target is beyond MAX_FORECAST_DAYS', async () => {
      // Build a date MAX_FORECAST_DAYS + 1 ahead of "today" in the test's
      // own clock so the test is deterministic regardless of when it runs.
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const farFuture = new Date(today);
      farFuture.setUTCDate(today.getUTCDate() + MAX_FORECAST_DAYS + 1);
      const farFutureYmd = farFuture.toISOString().slice(0, 10);

      const result = await service.getForecast(farFutureYmd, 'default');

      expect(result.source).toBe('out_of_range');
      expect(result.forecasts).toEqual([]);
      expect(result.date).toBe(farFutureYmd);
      // We must not even hit the database for out-of-range requests.
      expect(repo.findOne).not.toHaveBeenCalled();
    });

    it('still returns a forecast for the day right at the window edge', async () => {
      // Exactly MAX_FORECAST_DAYS ahead should NOT be out of range (> is
      // the cutoff, >= is in range).
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const atEdge = new Date(today);
      atEdge.setUTCDate(today.getUTCDate() + MAX_FORECAST_DAYS);
      const atEdgeYmd = atEdge.toISOString().slice(0, 10);

      mockRepo.findOne.mockResolvedValue(null);

      const result = await service.getForecast(atEdgeYmd, 'default');

      expect(result.source).not.toBe('out_of_range');
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
          // Probability can be 0 for the last entry when prior items
          // consumed all 100; otherwise it's in (0, 100].
          expect(entry.probability).toBeGreaterThanOrEqual(0);
          expect(entry.probability).toBeLessThanOrEqual(100);
        }
      }
    });
  });
});
