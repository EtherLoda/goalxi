import { cellIndexAt, cellKeyAt, cellSeekMinute } from './progress-cells';

/**
 * Clicking a cell must move the playhead into *that* cell. Both sides of that
 * promise live here: an empty cell seeks its own start minute, and both the
 * marker placement and the playhead derive their bucket from `cellKeyAt`.
 *
 * Regressions pinned:
 * - an empty cell used to seek `bucket.end`, so clicking 60–65 lit 65–70;
 * - 45' used to be filed as the 1H last cell, so clicking the 2H first cell
 *   (which starts at 45) lit the cell to its left.
 */
describe('cellSeekMinute', () => {
  it('seeks an empty cell to its own start', () => {
    expect(cellSeekMinute(0, [])).toBe(0);
    expect(cellSeekMinute(40, [])).toBe(40);
    expect(cellSeekMinute(45, [])).toBe(45);
    expect(cellSeekMinute(55, [])).toBe(55);
    expect(cellSeekMinute(60, [])).toBe(60);
    expect(cellSeekMinute(85, [])).toBe(85);
  });

  it('borrows the last event minute when the cell has events', () => {
    expect(cellSeekMinute(55, [{ minute: 55 }])).toBe(55);
    expect(cellSeekMinute(55, [{ minute: 55 }, { minute: 59 }])).toBe(59);
  });

  it('round-trips every cell start back into the same cell', () => {
    for (let i = 0; i < 9; i += 1) {
      // First half: 0, 5, … 40 → h1-1 … h1-9.
      const h1Start = i * 5;
      expect(cellKeyAt(cellSeekMinute(h1Start, []))).toBe(`h1-${i + 1}`);
      // Second half: 45, 50, … 85 → h2-1 … h2-9.
      const h2Start = 45 + i * 5;
      expect(cellKeyAt(cellSeekMinute(h2Start, []))).toBe(`h2-${i + 1}`);
    }
  });
});

describe('cellKeyAt', () => {
  it('files a minute into the cell that starts at it', () => {
    expect(cellKeyAt(0)).toBe('h1-1');
    expect(cellKeyAt(4)).toBe('h1-1');
    expect(cellKeyAt(5)).toBe('h1-2');
    expect(cellKeyAt(44)).toBe('h1-9');
    // 45' opens the second half — the cell under the "45'" tick.
    expect(cellKeyAt(45)).toBe('h2-1');
    expect(cellKeyAt(46)).toBe('h2-1');
    expect(cellKeyAt(55)).toBe('h2-3');
    expect(cellKeyAt(60)).toBe('h2-4');
    expect(cellKeyAt(90)).toBe('h2-9');
  });

  it('never exceeds nine cells per half', () => {
    expect(cellIndexAt(45)).toBe(1);
    expect(cellIndexAt(90)).toBe(9);
    expect(cellIndexAt(120)).toBe(9);
    expect(cellKeyAt(120)).toBe('h2-9');
  });
});
