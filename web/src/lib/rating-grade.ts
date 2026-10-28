/**
 * The player rating ladder.
 *
 * The engine's `power` is a 0–20+ composite of the player's position-weighted
 * skills, his current condition and his experience — it has NO upper clamp, so
 * a genuinely exceptional player can sit above 20 (20 is meant to be hard to
 * reach, not a wall).
 *
 * Grades are one unit wide from 4 upward, with an open bucket at each end:
 * below 4 everything is F, and 20+ is SSS+. When the engine value exceeds 20
 * it stays SSS+ — the label describes rarity, not a precise number, and the
 * raw value is deliberately not shown to players.
 */
const LADDER: readonly { readonly min: number; readonly letter: string }[] = [
  { min: 20, letter: 'SSS+' },
  { min: 19, letter: 'SSS' },
  { min: 18, letter: 'SS+' },
  { min: 17, letter: 'SS' },
  { min: 16, letter: 'S+' },
  { min: 15, letter: 'S' },
  { min: 14, letter: 'A+' },
  { min: 13, letter: 'A' },
  { min: 12, letter: 'B+' },
  { min: 11, letter: 'B' },
  { min: 10, letter: 'C+' },
  { min: 9, letter: 'C' },
  { min: 8, letter: 'D+' },
  { min: 7, letter: 'D' },
  { min: 6, letter: 'E+' },
  { min: 5, letter: 'E' },
  { min: 4, letter: 'F+' },
];

/**
 * Tailwind classes per grade. Static strings so the JIT can see them.
 *
 * The ramp is four families wide: grey brightens from F to D, green owns the
 * solid C/B band, pink marks A, violet marks S, and the two golds are the
 * rare air of SS and SSS. Adjacent letters never share a hue, so a glance at
 * the pitch sorts the eleven without reading a single letter.
 */
const TONE: Readonly<Record<string, string>> = {
  'SSS+': 'text-amber-300',
  SSS: 'text-amber-300',
  'SS+': 'text-amber-200',
  SS: 'text-amber-200',
  'S+': 'text-violet-300',
  S: 'text-violet-300',
  'A+': 'text-pink-300',
  A: 'text-pink-300',
  'B+': 'text-primary',
  B: 'text-primary',
  'C+': 'text-primary/70',
  C: 'text-primary/70',
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

/** Grade a 0–20+ player rating. Values above 20 all land on SSS+. */
export function ratingGrade(power: number): RatingGrade {
  const value = Number.isFinite(power) ? power : 0;
  for (const rung of LADDER) {
    if (value >= rung.min) return { letter: rung.letter, tone: TONE[rung.letter] };
  }
  return { letter: 'F', tone: TONE.F };
}
