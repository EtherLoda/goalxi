/**
 * The player rating ladder.
 *
 * What goes in: the engine's contribution score for one player at one
 * snapshot (`pc` in the snapshot payload) — "position-weighted skills ×
 * current condition". Its practical ceiling sits near 40: a sample of 8,630
 * player-snapshots from 43 matches ran 0–40 with a median of 24.8. The ladder
 * is written directly on that scale, so a median starter reads B+/A, a
 * 30-point game reads A+, and 40 is SSS+.
 *
 * History: the badge used to be handed `sr` (the same contribution divided by
 * five) and then divide it by four again before grading. Two unit conversions
 * stacked on each other pushed every player below the bottom rung, which is
 * why the whole pitch printed "F".
 *
 * Grades are two points wide, with an open bucket at each end: below 8 is F,
 * and 40+ is SSS+. Above 40 it stays SSS+ — the label describes rarity, not a
 * precise number, and the raw value is deliberately not shown to players.
 */
const LADDER: readonly { readonly min: number; readonly letter: string }[] = [
  { min: 40, letter: 'SSS+' },
  { min: 38, letter: 'SSS' },
  { min: 36, letter: 'SS+' },
  { min: 34, letter: 'SS' },
  { min: 32, letter: 'S+' },
  { min: 30, letter: 'S' },
  { min: 28, letter: 'A+' },
  { min: 26, letter: 'A' },
  { min: 24, letter: 'B+' },
  { min: 22, letter: 'B' },
  { min: 20, letter: 'C+' },
  { min: 18, letter: 'C' },
  { min: 16, letter: 'D+' },
  { min: 14, letter: 'D' },
  { min: 12, letter: 'E+' },
  { min: 10, letter: 'E' },
  { min: 8, letter: 'F+' },
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
