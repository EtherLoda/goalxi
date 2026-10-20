/**
 * condition-tone.ts — how a 0–6 condition value should read as text.
 *
 * 体能 and 状态 are both stored 0–5.99 and the UI shows them as `x/6` and `x/5`.
 * Two thresholds decide the colour: above `good` it is a strength, above `ok`
 * it is playable, below that it is a warning. Kept here rather than in a
 * component because the squad list, the squad detail pane and the full player
 * profile all need the same answer, and three slightly different thresholds
 * would make the same player look fit on one screen and tired on another.
 */
export function conditionToneClass(value: number, good: number, ok: number): string {
  if (value >= good) return 'text-primary';
  if (value >= ok) return 'text-tertiary';
  return 'text-error';
}

export type ConditionTier = 'high' | 'mid' | 'low';

/**
 * Condition as a word. The numbers move to a tooltip: `4/5` and `3/5` are a
 * one-point difference that nobody reads as "fresh" vs "played 70 minutes",
 * and the three condition values in the strip (体能 / 状态 / 经验) have to be
 * the same kind of thing or the row looks like it mixed units.
 */
export function conditionTier(value: number): ConditionTier {
  if (value >= 4) return 'high';
  if (value >= 2) return 'mid';
  return 'low';
}

