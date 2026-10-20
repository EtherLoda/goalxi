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

export interface BandEdges {
  min: number;
  max: number;
}

/**
 * Where the band lands when a THUMB is dragged to `desired`.
 *
 * A thumb first widens the band; once the band is as wide as the parameter
 * allows, the same drag slides the whole band instead. Without that second
 * half a thumb sitting at the span ceiling is simply frozen — which is exactly
 * the state a player is in right after setting a 5-point filter, so the only
 * control that still responded was the band itself.
 *
 * `startLo`/`startHi` are the edges captured at pointerdown rather than the
 * live ones, so the result is a pure function of the pointer position: a drag
 * that overshoots and comes back lands where the hand is, with no drift.
 */
export function dragEdge(
  which: "min" | "max",
  desired: number,
  startLo: number,
  startHi: number,
  scaleMin: number,
  scaleMax: number,
  minSpan: number,
  maxSpan: number,
): BandEdges {
  if (which === "max") {
    const span = Math.min(maxSpan, Math.max(minSpan, desired - startLo));
    // How far past the widest legal band the pointer has pushed.
    const push = Math.max(0, desired - (startLo + maxSpan));
    const lo = clampValue(startLo + push, scaleMin, scaleMax - span);
    return { min: lo, max: lo + span };
  }
  const span = Math.min(maxSpan, Math.max(minSpan, startHi - desired));
  const push = Math.max(0, startHi - maxSpan - desired);
  const hi = clampValue(startHi - push, scaleMin + span, scaleMax);
  return { min: hi - span, max: hi };
}
