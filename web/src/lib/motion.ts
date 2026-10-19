/**
 * Motion tokens — the JS mirror of the CSS ladder in `app/globals.css`.
 *
 * The stylesheet defines `duration-instant|quick|base|slow|deliberate` and
 * four `--ease-*` curves. Motion components cannot read those custom
 * properties, so they are duplicated here instead of being invented ad hoc
 * per animation. Keep the two in sync: if a duration is added to the CSS
 * ladder it belongs here too, and vice versa.
 *
 * Why seconds and not milliseconds: Framer's `transition.duration` is in
 * seconds, and mixing units is how a 300ms animation becomes 300s.
 */

/** Seconds. Mirrors `@utility duration-*` in `app/globals.css`. */
export const DURATION = {
  /** A state flips on something already on screen. */
  instant: 0.1,
  /** Hover and press: colour, opacity, ring. */
  quick: 0.15,
  /** Cards, dropdowns, disclosure, tabs. */
  base: 0.2,
  /** Larger surfaces: sheets, drawers, modals. */
  slow: 0.3,
  /** Continuous physical motion: progress fills, stamina bars. */
  deliberate: 0.5,
} as const;

/**
 * Cubic-bezier control points, as tuples so they satisfy the transition
 * `ease` type without a cast.
 */
export const EASE = {
  standard: [0.2, 0, 0, 1] as [number, number, number, number],
  entrance: [0.05, 0.7, 0.1, 1] as [number, number, number, number],
  exit: [0.4, 0, 1, 1] as [number, number, number, number],
  spring: [0.34, 1.56, 0.64, 1] as [number, number, number, number],
} as const;

export type DurationToken = keyof typeof DURATION;
export type EaseToken = keyof typeof EASE;
