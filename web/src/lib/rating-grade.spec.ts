import { ratingGrade } from './rating-grade';

/**
 * The ladder is calibrated against the engine's 0–20+ power rating (`sr`),
 * which is `positionFit × multiplier / 5`, quarter-point stepped. These cases
 * pin the calibration that came out of the 5,000-player benchmark in
 * `d886104e`, so a future refactor cannot quietly shift the alphabet again.
 */
describe('ratingGrade', () => {
  it('reads an average starter as the middle of the alphabet', () => {
    // Bot-league sample: sr p50 5.75, p90 7.25, max 8.75.
    expect(ratingGrade(5.75).letter).toBe('E');
    expect(ratingGrade(7.25).letter).toBe('D');
    expect(ratingGrade(8.75).letter).toBe('D+');
  });

  it('walks one letter per rung from F+ upward', () => {
    expect(ratingGrade(4).letter).toBe('F+');
    expect(ratingGrade(5).letter).toBe('E');
    expect(ratingGrade(6).letter).toBe('E+');
    expect(ratingGrade(9).letter).toBe('C');
    expect(ratingGrade(13).letter).toBe('A');
    expect(ratingGrade(15).letter).toBe('S');
    expect(ratingGrade(17).letter).toBe('SS');
    expect(ratingGrade(19).letter).toBe('SSS');
    expect(ratingGrade(20).letter).toBe('SSS+');
  });

  it('keeps everything below 4 at F and above 20 at SSS+', () => {
    expect(ratingGrade(3.9).letter).toBe('F');
    expect(ratingGrade(0).letter).toBe('F');
    expect(ratingGrade(21.5).letter).toBe('SSS+');
    expect(ratingGrade(30).letter).toBe('SSS+');
  });

  it('survives junk input', () => {
    expect(ratingGrade(Number.NaN).letter).toBe('F');
    expect(ratingGrade(undefined as unknown as number).letter).toBe('F');
  });

  it('maps every grade to a tone class', () => {
    for (const points of [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]) {
      expect(ratingGrade(points).tone).toMatch(/^text-/);
    }
  });
});
