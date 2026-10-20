/**
 * Pure helpers behind `AttributeRangeSlider`'s band panning.
 *
 * Kept out of the component because `web/` has no DOM test environment: the
 * maths that decides where the band lands is the part worth pinning, and it
 * cannot be tested inside a `.tsx` file.
 */

/** Width of the band, forced into the allowed span window. */
export function bandSpan(
  lo: number,
  hi: number,
  minSpan: number,
  maxSpan: number,
): number {
  return Math.min(Math.max(hi - lo, minSpan), maxSpan);
}

/**
 * New left edge after dragging the band by `delta` units.
 *
 * The band keeps its width, so the whole travel range is
 * `[scaleMin, scaleMax - span]`; at either end the band STOPS rather than
 * squashing, which is what makes the drag feel like moving a window.
 */
export function panBand(
  startMin: number,
  span: number,
  delta: number,
  scaleMin: number,
  scaleMax: number,
): number {
  const lowest = scaleMin;
  const highest = scaleMax - span;
  if (highest <= lowest) return lowest;
  const next = Math.round(startMin + delta);
  return Math.min(highest, Math.max(lowest, next));
}

/** Clamp a thumb value into the track domain. */
export function clampValue(
  value: number,
  scaleMin: number,
  scaleMax: number,
): number {
  return Math.min(scaleMax, Math.max(scaleMin, value));
}
