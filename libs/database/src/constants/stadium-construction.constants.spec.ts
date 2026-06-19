import {
  STADIUM_CONSTRUCTION_MAX_SEATS_PER_JOB,
  STADIUM_CONSTRUCTION_MIN_SEATS,
  STADIUM_DEMOLISH_SEATS_PER_WEEK,
  STADIUM_CONSTRUCTION_SEATS_PER_WEEK,
  computeConstructionWeeks,
  computeDemolishWeeks,
} from './stadium-construction.constants';

describe('stadium-construction.constants', () => {
  describe('computeConstructionWeeks', () => {
    it('rounds up partial weeks', () => {
      expect(computeConstructionWeeks(1)).toBe(1); // floor is MIN_WEEKS
      expect(computeConstructionWeeks(STADIUM_CONSTRUCTION_MIN_SEATS)).toBe(1);
      expect(computeConstructionWeeks(STADIUM_CONSTRUCTION_SEATS_PER_WEEK + 1)).toBe(2);
      expect(computeConstructionWeeks(10_000)).toBe(2);
      expect(computeConstructionWeeks(25_000)).toBe(5);
    });

    it('clamps to MIN_WEEKS even for very small inputs', () => {
      // Should never run instantly — even tiny queues take a week so the
      // user sees progress.
      expect(computeConstructionWeeks(STADIUM_CONSTRUCTION_MIN_SEATS)).toBe(1);
    });

    it('handles max-bound projects', () => {
      expect(computeConstructionWeeks(STADIUM_CONSTRUCTION_MAX_SEATS_PER_JOB))
        .toBe(Math.ceil(STADIUM_CONSTRUCTION_MAX_SEATS_PER_JOB / STADIUM_CONSTRUCTION_SEATS_PER_WEEK));
    });
  });

  describe('computeDemolishWeeks', () => {
    it('is faster than construction (10k seats = 1 week)', () => {
      expect(computeDemolishWeeks(10_000)).toBe(1);
    });

    it('scales linearly with the 10k/week rate', () => {
      expect(computeDemolishWeeks(20_000)).toBe(2);
      expect(computeDemolishWeeks(25_000)).toBe(3);
      expect(computeDemolishWeeks(100_000)).toBe(10);
    });

    it('clamps to MIN_WEEKS for small inputs', () => {
      expect(computeDemolishWeeks(STADIUM_CONSTRUCTION_MIN_SEATS)).toBe(1);
    });

    it('always ≤ computeConstructionWeeks for the same delta', () => {
      const deltas = [500, 1000, 5000, 10_000, 25_000, 100_000];
      for (const d of deltas) {
        expect(computeDemolishWeeks(d)).toBeLessThanOrEqual(computeConstructionWeeks(d));
      }
      // The demolish rate is 2x the construction rate, so equal deltas
      // should produce strictly fewer demolish weeks (or equal only at the
      // minimum).
      expect(STADIUM_DEMOLISH_SEATS_PER_WEEK).toBeGreaterThan(STADIUM_CONSTRUCTION_SEATS_PER_WEEK);
    });
  });
});