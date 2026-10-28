import { ratingGrade } from './rating-grade';

/**
 * The ladder is calibrated against real snapshots (median contribution 24.8,
 * p99 34, ceiling ~40). These cases pin the calibration so a future "let's
 * rescale the stars" refactor cannot quietly push the whole pitch back to F.
 */
describe('ratingGrade', () => {
  it('grades the median player in the B range, not F', () => {
    expect(ratingGrade(24.8).letter).toBe('B+');
    expect(ratingGrade(22).letter).toBe('B');
  });

  it('walks the top of the ladder', () => {
    expect(ratingGrade(30).letter).toBe('S');
    expect(ratingGrade(34).letter).toBe('SS');
    expect(ratingGrade(38).letter).toBe('SSS');
    expect(ratingGrade(40).letter).toBe('SSS+');
    expect(ratingGrade(47).letter).toBe('SSS+');
  });

  it('keeps a weak game visible instead of collapsing to F', () => {
    expect(ratingGrade(20).letter).toBe('C+');
    expect(ratingGrade(14).letter).toBe('D');
    expect(ratingGrade(8).letter).toBe('F+');
    expect(ratingGrade(4).letter).toBe('F');
    expect(ratingGrade(0).letter).toBe('F');
  });

  it('survives junk input', () => {
    expect(ratingGrade(Number.NaN).letter).toBe('F');
    expect(ratingGrade(undefined as unknown as number).letter).toBe('F');
  });

  it('maps every grade to a tone class', () => {
    for (const points of [8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40]) {
      expect(ratingGrade(points).tone).toMatch(/^text-/);
    }
  });
});
