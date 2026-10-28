import type { MatchEvent } from '@/lib/api';
import { canonicalEventType } from '@/lib/commentary';

/**
 * How long a freshly arrived event keeps the "typing" role.
 *
 * The typewriter itself needs ~2.4s at most (`useTypedText` paces its interval
 * by text length), then the pitch spotlight holds for a moment so the reader
 * can connect the sentence to the player before it fades.
 */
export const LIVE_TYPING_WINDOW_MS = 3800;

/**
 * The event the live feed should type out: the last one that has something to
 * say.
 *
 * Scanned backwards because WS events arrive in order, and snapshots are
 * streamed on the same channel — they carry no sentence and nobody to
 * spotlight, so the newest *snapshot* must never steal the typing window from
 * the event before it.
 */
export function newestTypedEventId(events: readonly MatchEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (!e.id) continue;
    if (canonicalEventType(e.typeName ?? e.type) === 'SNAPSHOT') continue;
    return e.id;
  }
  return null;
}
