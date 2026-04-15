import { FanEntity } from '@goalxi/database';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FanService } from './fan.service';

describe('FanService', () => {
  let service: FanService;
  let fanRepository: Repository<FanEntity>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FanService,
        {
          provide: getRepositoryToken(FanEntity),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<FanService>(FanService);
    fanRepository = module.get<Repository<FanEntity>>(
      getRepositoryToken(FanEntity),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateAttendance', () => {
    const capacity = 10000;

    it('should return 0 for zero fans with random fluctuation', () => {
      // With 0 home and 0 away fans, total attendance is 0
      // Even with +/- 5% fluctuation, 0 * anything = 0
      const attendance = service.calculateAttendance(0, 0, 50, 50, capacity);
      expect(attendance).toBe(0);
    });

    it('should calculate attendance for small fan base', () => {
      // 1000 home fans, 0 away fans, 50 morale
      // homeRate = 0.6 + (50/100) * 0.4 = 0.8
      // home = 1000 * 0.2 * 0.8 = 160
      // total = 160 (no neutral fans in new formula)
      const attendance = service.calculateAttendance(1000, 0, 50, 50, capacity);
      // With fluctuation 0.95 ~ 1.05, result is 152 ~ 168
      expect(attendance).toBeGreaterThanOrEqual(152);
      expect(attendance).toBeLessThanOrEqual(168);
    });

    it('should cap attendance at stadium capacity', () => {
      // Very large fan base should hit capacity
      const attendance = service.calculateAttendance(
        100000,
        100000,
        100,
        100,
        capacity,
      );
      expect(attendance).toBeLessThanOrEqual(capacity);
    });

    it('should consider home morale in home fan attendance', () => {
      const lowMorale = service.calculateAttendance(10000, 0, 20, 50, capacity);
      const highMorale = service.calculateAttendance(
        10000,
        0,
        100,
        50,
        capacity,
      );

      // High morale should result in more attendance
      expect(highMorale).toBeGreaterThan(lowMorale);
    });

    it('should consider away morale in away fan attendance', () => {
      const lowMorale = service.calculateAttendance(0, 10000, 50, 20, capacity);
      const highMorale = service.calculateAttendance(
        0,
        10000,
        50,
        100,
        capacity,
      );

      // High morale should result in more attendance
      expect(highMorale).toBeGreaterThan(lowMorale);
    });

    it('should handle only home fans', () => {
      const attendance = service.calculateAttendance(
        10000,
        0,
        50,
        50,
        capacity,
      );
      // homeRate = 0.6 + (50/100) * 0.4 = 0.8
      // home = 10000 * 0.2 * 0.8 = 1600
      // With fluctuation 0.95 ~ 1.05: 1520 ~ 1680
      expect(attendance).toBeGreaterThanOrEqual(1520);
      expect(attendance).toBeLessThanOrEqual(1680);
    });

    it('should handle only away fans', () => {
      const attendance = service.calculateAttendance(
        0,
        10000,
        50,
        50,
        capacity,
      );
      // awayRate = 0.6 + (50/100) * 0.4 = 0.8
      // away = 10000 * 0.08 * 0.8 = 640
      // With fluctuation 0.95 ~ 1.05: 608 ~ 672
      expect(attendance).toBeGreaterThanOrEqual(608);
      expect(attendance).toBeLessThanOrEqual(672);
    });

    it('should combine all attendance sources', () => {
      const attendance = service.calculateAttendance(
        10000,
        5000,
        50,
        50,
        capacity,
      );
      // homeRate = 0.8, awayRate = 0.8
      // home = 10000 * 0.2 * 0.8 = 1600
      // away = 5000 * 0.08 * 0.8 = 320
      // total = 1920
      // With fluctuation 0.95 ~ 1.05: 1824 ~ 2016
      expect(attendance).toBeGreaterThanOrEqual(1824);
      expect(attendance).toBeLessThanOrEqual(2016);
    });
  });
});
