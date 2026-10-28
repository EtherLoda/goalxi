import { cellIndexAt, cellSeekMinute } from './progress-cells';

/**
 * Clicking a cell must move the playhead into *that* cell. Both sides of that
 * promise are tested here: an empty cell seeks its own start minute, and that
 * minute maps back to the same 1-based index within the half.
 *
 * Regression: an empty cell used to seek `bucket.end`, so clicking the 60–65
 * cell lit the 65–70 one.
 */
describe('cellSeekMinute', () => {
  it('seeks an empty cell to its own start', () => {
    expect(cellSeekMinute(0, [])).toBe(0);
    expect(cellSeekMinute(55, [])).toBe(55);
    expect(cellSeekMinute(60, [])).toBe(60);
    expect(cellSeekMinute(85, [])).toBe(85);
  });

  it('borrows the last event minute when the cell has events', () => {
    expect(cellSeekMinute(55, [{ minute: 55 }])).toBe(55);
    expect(cellSeekMinute(55, [{ minute: 55 }, { minute: 59 }])).toBe(59);
  });

  it('keeps the seek inside the clicked cell', () => {
    // 1H: (index - 1) * 5; 2H: 45 + (index - 1) * 5, both 1-based.
    const indexOf = (minute: number): number =>
      minute <= 45 ? Math.floor(minute / 5) + 1 : Math.floor((minute - 45) / 5) + 1;

    for (const start of [0, 5, 40, 45, 50, 60, 85]) {
      const seek = cellSeekMinute(start, []);
      expect(indexOf(seek)).toBe(indexOf(start));
    }
  });
});

describe('cellIndexAt', () => {
  it('files a minute into the cell that starts at it', () => {
    expect(cellIndexAt(0)).toBe(1);
    expect(cellIndexAt(4)).toBe(1);
    expect(cellIndexAt(5)).toBe(2);
    expect(cellIndexAt(45)).toBe(9);
    expect(cellIndexAt(46)).toBe(1);
    expect(cellIndexAt(55)).toBe(3);
    expect(cellIndexAt(60)).toBe(4);
    expect(cellIndexAt(90)).toBe(9);
  });
});
