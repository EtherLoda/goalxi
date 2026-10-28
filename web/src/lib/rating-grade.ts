/**
 * The player rating ladder.
 *
 * What goes in: the engine's contribution score for one player at one
 * snapshot (`pc` in the snapshot payload) — position-fit strength × current
 * condition (stamina, form, experience). Its practical range sits near 0–40:
 * a sample of 8,630 player-snapshots from 43 matches ran p10 20.2 / median
 * 24.8 / p90 29.8 / p99 34, and the ladder is written on that scale with an
 * average game anchored at C+ — the middle of the alphabet, not the top.
 *
 * Anchor points: median 24.8 → C+, p90 29.8 → B+, p99 34 → S, 40 → SSS+.
 * A weak game (20) reads D+, a great one (34+) starts at S. Grades are two
 * points wide; below 12 is F and 40+ stays SSS+ (the label describes rarity,
 * not a precise number, so the raw value is never shown to players).
 *
 * History: the badge used to be handed `sr` (this same value divided by five)
 * and then divided by four again before grading — two unit conversions
 * stacked, which is why the whole pitch once printed "F". The first fix then
 * anchored the median at B+/A, which made an entire bot league read A..SSS.
 */
const LADDER: readonly { readonly min: number; readonly letter: string }[] = [
  { min: 40, letter: 'SSS+' },
  { min: 39, letter: 'SSS' },
  { min: 38, letter: 'SS+' },
  { min: 37, letter: 'SS' },
  { min: 36, letter: 'S+' },
  { min: 34, letter: 'S' },
  { min: 32, letter: 'A+' },
  { min: 30, letter: 'A' },
  { min: 28, letter: 'B+' },
  { min: 26, letter: 'B' },
  { min: 24, letter: 'C+' },
  { min: 22, letter: 'C' },
  { min: 20, letter: 'D+' },
  { min: 18, letter: 'D' },
  { min: 16, letter: 'E+' },
  { min: 14, letter: 'E' },
  { min: 12, letter: 'F+' },
];

/**
 * Tailwind classes per grade. Static strings so the JIT can see them; the
 * ramp runs neutral → green → gold so a glance sorts the eleven players
 * without reading a single letter.
 */
const TONE: Readonly<Record<string, string>> = {
  'SSS+': 'text-amber-300',
  SSS: 'text-amber-300',
  'SS+': 'text-amber-200',
  SS: 'text-amber-200',
  'S+': 'text-primary',
  S: 'text-primary',
  'A+': 'text-primary/80',
  A: 'text-primary/80',
  'B+': 'text-on-surface/80',
  B: 'text-on-surface/80',
  'C+': 'text-on-surface/60',
  C: 'text-on-surface/60',
  'D+': 'text-on-surface/50',
  D: 'text-on-surface/50',
  'E+': 'text-on-surface/40',
  E: 'text-on-surface/40',
  'F+': 'text-on-surface/30',
  F: 'text-on-surface/30',
};

export interface RatingGrade {
  /** The letter shown to players. */
  readonly letter: string;
  /** Tailwind text colour for the letter. */
  readonly tone: string;
}

/**
 * Grade a raw contribution score against the ladder described above.
 */
export function ratingGrade(contribution: number): RatingGrade {
  const value = Number.isFinite(contribution) ? contribution : 0;
  for (const rung of LADDER) {
    if (value >= rung.min) return { letter: rung.letter, tone: TONE[rung.letter] };
  }
  return { letter: 'F', tone: TONE.F };
}
