import { coachLevelColorClass, coachLevelLabel } from './coach-level';

describe('coachLevelLabel', () => {
  it('maps engine levels 1-5 to S/A/B/C/D from high to low', () => {
    expect(coachLevelLabel(5)).toBe('S');
    expect(coachLevelLabel(4)).toBe('A');
    expect(coachLevelLabel(3)).toBe('B');
    expect(coachLevelLabel(2)).toBe('C');
    expect(coachLevelLabel(1)).toBe('D');
  });

  it('falls back to D for out-of-range levels (defensive)', () => {
    expect(coachLevelLabel(0)).toBe('D');
    expect(coachLevelLabel(6)).toBe('D');
    expect(coachLevelLabel(-1)).toBe('D');
    expect(coachLevelLabel(99)).toBe('D');
  });
});

describe('coachLevelColorClass', () => {
  it('returns the colour matching the grade', () => {
    expect(coachLevelColorClass(5)).toBe('text-orange-400');
    expect(coachLevelColorClass(4)).toBe('text-purple-400');
    expect(coachLevelColorClass(3)).toBe('text-blue-400');
    expect(coachLevelColorClass(2)).toBe('text-green-400');
    expect(coachLevelColorClass(1)).toBe('text-white');
  });

  it('falls back to the D colour for out-of-range levels', () => {
    expect(coachLevelColorClass(0)).toBe('text-white');
    expect(coachLevelColorClass(99)).toBe('text-white');
  });
});
