/**
 * match-event-side.ts — derive an event's "team side" from a normalized
 * `WsMatchEvent` / `MatchEvent` payload.
 *
 * Why this is non-trivial: the simulator's gateway payload only ships
 * `teamId` on each event, NOT a `isHome` boolean. Older payloads DO carry
 * `isHome` (boolean), so consumers have to handle both:
 *   1. `isHome === true | false` → trust it (the canonical answer)
 *   2. `isHome` undefined + `teamId === homeTeamId` → home
 *   3. `isHome` undefined + `teamId === awayTeamId` → away
 *   4. `isHome` undefined + `teamId` known but matches neither → "neutral"
 *      (defensive: a teamId the caller doesn't recognise, e.g. weather
 *       announcements that have no team)
 *   5. `isHome` undefined + no `teamId` at all → "neutral" (truly meta events
 *      like KICKOFF, HALF_TIME, FULL_TIME)
 *
 * Pre-rule, two consumers (`MatchKeyEvents` and `EventBubble`) each had
 * their own copy of the same nested ternaries, and they diverged in
 * subtle ways (MatchKeyEvents fell back to 'home' on a non-match, while
 * EventBubble fell back to 'away'). Consolidating the rule here pins the
 * contract in one place and gives us a spec to lock it down.
 *
 * Pure: no React, no fetch. Safe to call inside any consumer or
 * useMemo. `WsMatchEvent` and `MatchEvent` are structurally compatible
 * on the fields we read, so we type the input loosely.
 */

export type EventSide = 'home' | 'away' | 'neutral';

interface EventWithSide {
  /** Backend-authoritative team side, if present. */
  isHome?: boolean;
  /** Team identifier (opaque string), if present. */
  teamId?: string;
}

export function resolveSide(
  event: EventWithSide,
  homeTeamId?: string | null,
  awayTeamId?: string | null,
): EventSide {
  // Rule 1: explicit boolean wins. Trust the canonical answer.
  if (event.isHome === true) return 'home';
  if (event.isHome === false) return 'away';

  // Rule 2 + 3: fall back to teamId comparison when isHome is missing.
  if (event.teamId) {
    if (homeTeamId && event.teamId === homeTeamId) return 'home';
    if (awayTeamId && event.teamId === awayTeamId) return 'away';
    // Rule 4: known teamId but matches neither side. Caller doesn't
    // recognise this team (e.g. youth-league placeholder, post-hoc
    // rebrand). Returning 'neutral' is the honest answer — the
    // previous "default to home" silently lied to the reader.
    return 'neutral';
  }

  // Rule 5: meta event with no team at all (KICKOFF / HALF_TIME / etc.).
  return 'neutral';
}
