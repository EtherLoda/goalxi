import type { MatchEvent } from '@/lib/api';

/**
 * One definition of "this event was a shot attempt", shared by the
 * chances card and the match-stats card.
 *
 * They used to disagree — the chances card counted every set-piece
 * *event*, the stats card counted the persisted `shots` column, which
 * the processor derived from `goals + misses + saves` — and a 1-3 match
 * ended up showing "7 : 8" in one card and "3 : 8" in the other.
 *
 * Three shapes exist in the wild:
 *
 * - Open play (persisted): `data.sequence.shot` next to the attack push.
 * - Open play (engine, in memory): `data.shot`.
 * - Set pieces: no shot object at all, just `data.setPieceType` plus a
 *   `data.result` — a corner event *is* the header attempt.
 *
 * A blocked push never produced a shot object but still reached the box,
 * so `ffinalResult === 'blocked'` counts as an attempt with no on-target.
 */

export type ShotOutcome = 'goal' | 'save' | 'blocked' | 'miss';

const OUTCOMES = new Set<string>(['goal', 'save', 'blocked', 'miss']);

function normalize(value: unknown): ShotOutcome | null {
  return typeof value === 'string' && OUTCOMES.has(value)
    ? (value as ShotOutcome)
    : null;
}

/** Returns the shot outcome, or `null` when the event was no attempt. */
export function shotOutcome(event: MatchEvent): ShotOutcome | null {
  const data = event.data;
  if (!data) return null;

  if (typeof data.setPieceType === 'string' && data.setPieceType.length > 0) {
    return normalize(data.result) ?? 'miss';
  }

  const shot = data.shot ?? data.sequence?.shot;
  if (shot) {
    return normalize(shot.result) ?? normalize(data.ffinalResult) ?? 'miss';
  }

  if (data.ffinalResult === 'blocked') return 'blocked';

  return null;
}

export function isShotAttempt(event: MatchEvent): boolean {
  return shotOutcome(event) !== null;
}

/** On target = the keeper had to make it, or it went in. */
export function isOnTarget(event: MatchEvent): boolean {
  const outcome = shotOutcome(event);
  return outcome === 'goal' || outcome === 'save';
}
