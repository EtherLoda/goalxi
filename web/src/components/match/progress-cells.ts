/**
 * The progress strip's minute↔cell arithmetic.
 *
 * Kept in a `.ts` module (no JSX, no `next-intl`) so the invariant — "an event
 * and the playhead that points at it land in the same cell" — can be unit
 * tested without spinning up a renderer.
 */

/** Width of one cell, in match minutes. */
export const CELL_MINUTES = 5;

/** Cells per half: 45 / 5. The strip is two rows of nine. */
export const CELLS_PER_HALF = 9;

/**
 * Which 1-based cell a minute falls in, within its half.
 *
 * Cells are keyed by the minute they *start*, so 55' belongs to the 55–60
 * cell — not the 50–55 one. `Math.floor(minute / 5) + 1` is that rule, and
 * both placements use it: an event is filed by its own minute, the playhead
 * by its own minute, so a cell's glyph and the ring can never disagree.
 * `Math.ceil` used to count exact multiples of five into the previous cell,
 * which is what put a 55' goal one cell left of the lit cell.
 */
export function cellIndexAt(minute: number): number {
  if (minute <= 0) return 1;
  if (minute <= 45) {
    return Math.min(CELLS_PER_HALF, Math.floor(minute / CELL_MINUTES) + 1);
  }
  return Math.min(CELLS_PER_HALF, Math.floor((minute - 45) / CELL_MINUTES) + 1);
}

/**
 * The minute a clicked cell seeks to.
 *
 * For a cell holding events, the last event wins: that is the minute the
 * glyph is about, and `cellIndexAt` maps it straight back to this same cell.
 * An empty cell has no event to borrow a minute from, so it seeks its own
 * **start** — cells are named by the minute they begin at, and using
 * `bucket.end` pushed the playhead one cell right (click 60–65, light 65–70).
 */
export function cellSeekMinute(
  start: number,
  items: ReadonlyArray<{ minute: number }>,
): number {
  if (items.length === 0) return start;
  return Math.max(...items.map((item) => item.minute));
}
