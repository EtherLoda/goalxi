import { formatRecoveryWeeks } from './format-recovery-weeks';

describe('formatRecoveryWeeks', () => {
  it('returns 1 week for 1 day', () => {
    expect(formatRecoveryWeeks(1)).toBe(1);
  });

  it('returns 1 week for 5 days (user contract)', () => {
    expect(formatRecoveryWeeks(5)).toBe(1);
  });

  it('returns 1 week for 7 days', () => {
    expect(formatRecoveryWeeks(7)).toBe(1);
  });

  it('returns 1 week for 4 days (rounds down)', () => {
    expect(formatRecoveryWeeks(4)).toBe(1);
  });

  it('returns 2 weeks for 11 days (rounds up)', () => {
    expect(formatRecoveryWeeks(11)).toBe(2);
  });

  it('returns 2 weeks for 13 days (user contract)', () => {
    expect(formatRecoveryWeeks(13)).toBe(2);
  });

  it('returns 3 weeks for 21 days', () => {
    expect(formatRecoveryWeeks(21)).toBe(3);
  });

  it('treats 0 days as 1 week (defensive fallback)', () => {
    expect(formatRecoveryWeeks(0)).toBe(1);
  });

  it('treats negative values as 1 week', () => {
    expect(formatRecoveryWeeks(-3)).toBe(1);
  });

  it('treats NaN as 1 week', () => {
    expect(formatRecoveryWeeks(NaN)).toBe(1);
  });

  it('treats Infinity as 1 week', () => {
    expect(formatRecoveryWeeks(Number.POSITIVE_INFINITY)).toBe(1);
  });
});
