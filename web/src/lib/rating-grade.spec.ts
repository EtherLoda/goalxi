import { ratingGrade } from './rating-grade';

/**
 * The ladder is calibrated against real snapshots (p10 20.2 / median 24.8 /
 * p90 29.8 / p99 34, ceiling ~40) with an average game anchored at C+ — the
 * middle of the alphabet. These cases pin the calibration so a future
 * "let's rescale the stars" refactor cannot quietly shift the whole pitch
 * up into A..SSS (or back down into F).
 */
describe('ratingGrade', () => {
  it('reads an average game as C+, not B+ or A', () => {
    expect(ratingGrade(24.8).letter).toBe('C+');
    expect(ratingGrade(24).letter).toBe('C+');
    expect(ratingGrade(22).letter).toBe('C');
  });

  it('only climbs into the letters at the top of the distribution', () => {
    expect(ratingGrade(29.8).letter).toBe('B+');
    expect(ratingGrade(32).letter).toBe('A+');
    expect(ratingGrade(34).letter).toBe('S');
    expect(ratingGrade(36).letter).toBe('S+');
    expect(ratingGrade(38).letter).toBe('SS+');
    expect(ratingGrade(40).letter).toBe('SSS+');
    expect(ratingGrade(47).letter).toBe('SSS+');
  });

  it('keeps a weak game visible instead of collapsing to F', () => {
    expect(ratingGrade(20).letter).toBe('D+');
    expect(ratingGrade(16).letter).toBe('E+');
    expect(ratingGrade(12).letter).toBe('F+');
    expect(ratingGrade(11).letter).toBe('F');
    expect(ratingGrade(0).letter).toBe('F');
  });

  it('survives junk input', () => {
    expect(ratingGrade(Number.NaN).letter).toBe('F');
    expect(ratingGrade(undefined as unknown as number).letter).toBe('F');
  });

  it('maps every grade to a tone class', () => {
    for (const points of [12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 37, 38, 39, 40]) {
      expect(ratingGrade(points).tone).toMatch(/^text-/);
    }
  });
});
