import { calculateMatchAttendance, FanEntity } from '@goalxi/database';
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
    // L4 fan cap — keeps the dynamic home-conversion curve at its
    // "low-ratio" end (50%) for all the existing small-base tests
    // so they exercise the new "core fans show up" bonus, not the
    // back-compat 20% floor.
    const l4Cap = 110_000;

    it('should return 0 for zero fans with random fluctuation', () => {
      // With 0 home and 0 away fans, total attendance is 0
      // Even with +/- 5% fluctuation, 0 * anything = 0
      const attendance = calculateMatchAttendance(
        0,
        0,
        50,
        50,
        capacity,
        4, // L4 cap = 110_000 (ratio uses FAN_HIDDEN_CAP[4])
      );
      expect(attendance).toBe(0);
    });

    it('should calculate attendance for small fan base', () => {
      // 1000 home fans, 0 away fans, 50 morale, ratio = 1000/110k ≈ 0.009
      // homeConv = 0.5 - 0.3 * 0.009 = 0.497
      // homeRate = 0.6 + (50/100) * 0.4 = 0.8
      // home = 1000 * 0.497 * 0.8 = 397.6 → 397
      // total = 397 (no away fans)
      const attendance = calculateMatchAttendance(
        1000,
        0,
        50,
        50,
        capacity,
        4, // L4 cap = 110_000 (ratio uses FAN_HIDDEN_CAP[4])
      );
      // With fluctuation 0.95 ~ 1.05, result is 377 ~ 417
      expect(attendance).toBeGreaterThanOrEqual(377);
      expect(attendance).toBeLessThanOrEqual(417);
    });

    it('should cap attendance at stadium capacity', () => {
      // Very large fan base (100k home, 100k away) hits capacity
      // ratio = 100k/110k ≈ 0.91, homeConv ≈ 0.227
      // home = 100000 * 0.227 * 1.0 = 22727
      // away = 100000 * 0.08 * 1.0 = 8000
      // total = 30727 — well past capacity 10000
      const attendance = calculateMatchAttendance(
        100_000,
        100_000,
        100,
        100,
        capacity,
        4, // L4 cap = 110_000 (ratio uses FAN_HIDDEN_CAP[4])
      );
      expect(attendance).toBe(capacity);
    });

    it('should consider home morale in home fan attendance', () => {
      const lowMorale = calculateMatchAttendance(
        10_000,
        0,
        20,
        50,
        capacity,
        4, // L4 cap = 110_000 (ratio uses FAN_HIDDEN_CAP[4])
      );
      const highMorale = calculateMatchAttendance(
        10_000,
        0,
        100,
        50,
        capacity,
        4, // L4 cap = 110_000 (ratio uses FAN_HIDDEN_CAP[4])
      );

      // High morale should result in more attendance
      expect(highMorale).toBeGreaterThan(lowMorale);
    });

    it('should consider away morale in away fan attendance', () => {
      const lowMorale = calculateMatchAttendance(
        0,
        10_000,
        50,
        20,
        capacity,
        4, // L4 cap = 110_000 (ratio uses FAN_HIDDEN_CAP[4])
      );
      const highMorale = calculateMatchAttendance(
        0,
        10_000,
        50,
        100,
        capacity,
        4, // L4 cap = 110_000 (ratio uses FAN_HIDDEN_CAP[4])
      );

      // High morale should result in more attendance
      expect(highMorale).toBeGreaterThan(lowMorale);
    });

    it('should handle only home fans', () => {
      // 10000 home fans, ratio = 10000/110000 ≈ 0.0909
      // homeConv = 0.5 - 0.3 * 0.0909 ≈ 0.4727
      // homeRate = 0.6 + 0.5 * 0.4 = 0.8
      // home = floor(10000 * 0.4727 * 0.8) = 3781
      const attendance = calculateMatchAttendance(
        10_000,
        0,
        50,
        50,
        capacity,
        4, // L4 cap = 110_000 (ratio uses FAN_HIDDEN_CAP[4])
      );
      // With fluctuation 0.95 ~ 1.05: floor(3781 * 0.95) ~ floor(3781 * 1.05)
      // = 3592 ~ 3970
      expect(attendance).toBeGreaterThanOrEqual(3592);
      expect(attendance).toBeLessThanOrEqual(3970);
    });

    it('should handle only away fans', () => {
      // away conversion is fixed at 0.08 (small-club bonus does NOT
      // apply to travelling supporters), independent of homeCap.
      // away = 10000 * 0.08 * 0.8 = 640
      const attendance = calculateMatchAttendance(
        0,
        10_000,
        50,
        50,
        capacity,
        4, // L4 cap = 110_000 (ratio uses FAN_HIDDEN_CAP[4])
      );
      // With fluctuation 0.95 ~ 1.05: 608 ~ 672
      expect(attendance).toBeGreaterThanOrEqual(608);
      expect(attendance).toBeLessThanOrEqual(672);
    });

    it('should combine all attendance sources', () => {
      // home = 10000 * 0.473 * 0.8 = 3782  (dynamic homeConv)
      // away = 5000  * 0.08  * 0.8 = 320   (fixed awayConv)
      // total = 4102
      const attendance = calculateMatchAttendance(
        10_000,
        5_000,
        50,
        50,
        capacity,
        4, // L4 cap = 110_000 (ratio uses FAN_HIDDEN_CAP[4])
      );
      // With fluctuation 0.95 ~ 1.05: 3897 ~ 4307
      expect(attendance).toBeGreaterThanOrEqual(3897);
      expect(attendance).toBeLessThanOrEqual(4307);
    });

    // ------------------------------------------------------------------
    // Dynamic home-conversion-rate tests (regression for the "small
    // club core fans show up" bonus). These pin the three meaningful
    // points on the homeConv = 0.5 - 0.3 * ratio curve.
    // ------------------------------------------------------------------

    it('home conversion rate is ~50% when ratio=0 (micro club)', () => {
      // 500 fans, cap 100000, ratio = 0.005, homeConv ≈ 0.499
      // homeRate = 0.8
      // home = 500 * 0.499 * 0.8 = 199.6 → 199
      // Expected ~ 189-209 after ±5% fluctuation
      const attendance = calculateMatchAttendance(
        500,
        0,
        50,
        50,
        capacity,
        100_000,
      );
      expect(attendance).toBeGreaterThanOrEqual(189);
      expect(attendance).toBeLessThanOrEqual(209);
    });

    it('home conversion rate is ~35% when ratio=0.5 (mid-tier club)', () => {
      // 50k fans, cap 100k, ratio = 0.5, homeConv = 0.35
      // home = 50000 * 0.35 * 0.8 = 14000 → capped at capacity 10000
      const attendance = calculateMatchAttendance(
        50_000,
        0,
        50,
        50,
        capacity,
        100_000,
      );
      // Hits the capacity ceiling — formula gives 14000 but min() clamps.
      expect(attendance).toBe(capacity);
      // Re-run with a stadium big enough to NOT cap, to actually see 14000
      const uncapped = calculateMatchAttendance(
        50_000,
        0,
        50,
        50,
        20_000,
        100_000,
      );
      // 14000 * 0.95 ~ 1.05 = 13300 ~ 14700
      expect(uncapped).toBeGreaterThanOrEqual(13_300);
      expect(uncapped).toBeLessThanOrEqual(14_700);
    });

    it('home conversion rate is 20% (back-compat floor) when ratio=1 (saturated)', () => {
      // 100k fans, cap 100k, ratio = 1, homeConv = 0.2
      // home = 100000 * 0.2 * 0.8 = 16000 → capped at capacity 10000
      const attendance = calculateMatchAttendance(
        100_000,
        0,
        50,
        50,
        capacity,
        100_000,
      );
      expect(attendance).toBe(capacity);
      // Uncapped: 16000 * 0.95 ~ 1.05 = 15200 ~ 16800 — exactly the
      // pre-change back-compat range (this is the regression pin).
      const uncapped = calculateMatchAttendance(
        100_000,
        0,
        50,
        50,
        20_000,
        100_000,
      );
      expect(uncapped).toBeGreaterThanOrEqual(15_200);
      expect(uncapped).toBeLessThanOrEqual(16_800);
    });

    it('away conversion stays 0.08 regardless of homeCap (no small-club bonus)', () => {
      // Regression for the dynamic homeConv change: the away
      // conversion rate (0.08) is fixed and must not inherit the
      // small-club bonus, because travelling supporters don't get
      // a "core fans show up" uplift. We pin this by calling with
      // away fans only under two wildly different homeCap values
      // and asserting the result is identical (within the ±5%
      // fluctuation band) to a third call with homeCap=1 (which
      // forces ratio=1, i.e. no home conversion bonus).
      const underL4 = calculateMatchAttendance(
        0,
        10_000,
        50,
        50,
        capacity,
        110_000, // L4 cap
      );
      const underL1 = calculateMatchAttendance(
        0,
        10_000,
        50,
        50,
        capacity,
        300_000, // L1 cap, very different from L4
      );
      const underExtreme = calculateMatchAttendance(
        0,
        10_000,
        50,
        50,
        capacity,
        10_000_000, // ratio = 0, would maximise homeConv if it leaked
      );
      // All three should land in the same away-only band:
      //   10000 * 0.08 * 0.8 = 640 → 608..672 after ±5% fluctuation
      for (const att of [underL4, underL1, underExtreme]) {
        expect(att).toBeGreaterThanOrEqual(608);
        expect(att).toBeLessThanOrEqual(672);
      }
    });
  });
});
