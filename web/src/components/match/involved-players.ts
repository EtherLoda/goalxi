import type { MatchEvent } from '@/lib/api';

/**
 * Which players on the pitch an event is "about".
 *
 * Selecting a line in the commentary already tints that line; this module
 * answers the follow-up the eye asks next — *who*? It returns the ids the
 * pitch should light up:
 *
 * - a goal: the scorer (`playerId`) **and** the assister (`relatedPlayerId`);
 * - a card or an injury: the booked / hurt player (`playerId`);
 * - a substitution: the player coming on (`playerId`) and the one going off
 *   (`relatedPlayerId`);
 * - a `turnover` (an interception): the player who won the ball, which the
 *   engine stores in `relatedPlayerId` — the event has no `playerId` at all;
 * - anything else: whatever ids the row carries, which for most events is
 *   none and so lights nothing.
 *
 * Kept as a pure function over the wire shape rather than derived inside the
 * pitch for two reasons: it is the same rule the commentary speaks in ("Jun
 * Guo … assisted by Bin Zhu"), and it is testable without a roster — ids that
 * don't resolve to a player on the pitch are simply not drawn.
 */
export function involvedPlayerIds(event: MatchEvent | null | undefined): number[] {
  if (!event) return [];

  const ids: number[] = [];
  for (const raw of [event.playerId, event.relatedPlayerId]) {
    if (raw == null) continue;
    // WS events carry ids as JSON strings for historical reasons (see the
    // `playerId` note in `lib/api.ts`); coerce so both transports agree.
    const id = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isInteger(id) || id <= 0) continue;
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * The player ids to highlight for the currently selected commentary line.
 *
 * Takes the id rather than the event so callers can pass the same
 * `selectedEventId` state they already hand to the rail, the highlights
 * column and the feed — one selection, three places that read it.
 */
export function playerIdsToHighlight(
  events: readonly MatchEvent[],
  selectedEventId: string | null,
): ReadonlySet<number> {
  if (!selectedEventId) return EMPTY;
  const event = events.find((e) => e.id === selectedEventId);
  return new Set(involvedPlayerIds(event));
}

const EMPTY: ReadonlySet<number> = new Set<number>();
