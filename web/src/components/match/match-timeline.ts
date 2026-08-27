/**
 * match-timeline.ts — pure helpers + one React hook for the
 * horizontal match timeline.
 *
 * Lives in `.ts` (not `.tsx`) so jest can resolve it without a
 * jsdom environment. Owns:
 *   - `TIMELINE_EVENT_TYPES` — the event types we render as markers on
 *     the timeline (everything else falls through to the snapshot ticks).
 *   - `extractTimelineMarkers(events)` — walks the event list, returns a
 *     deduplicated list of `{ type, minute, teamId, side }` markers
 *     suitable for laying out on the 0–90 minute axis.
 *   - `timelineEnd(events, currentMinute)` — total minutes the bar
 *     covers (90 by default; grows if an event falls past the 90th
 *     minute so extra-time events stay visible).
 *   - `extractInjuryWindows(events)` — stoppage windows (1H/2H/ET1H/ET2H)
 *     derived from `data.injuryTime` on the half_time / full_time events.
 *   - `useInjuryWindows(events)` — React hook wrapper with memoisation.
 *   - `formatMatchMinute(minute, windows)` — renders raw engine minutes
 *     as "45+1" labels in stoppage windows (the engine's wire value
 *     is already stoppage-inclusive; this just surfaces the "+N" suffix).
 *   - `closestSnapshotIndex(snapshots, minute)` — used when the user
 *     clicks a marker / the track itself: jump the scrubber to the
 *     nearest snapshot by minute (snapping backwards; we never jump
 *     past a moment the user hasn't "watched" yet).
 *
 * Pure functions — no fetch, no DOM access. The `useInjuryWindows`
 * hook is the only React dependency; the rest are side-effect-free
 * and unit-testable in node.
 */

import { useMemo } from 'react';
import type { MatchEvent } from '@/lib/api';
import type { MatchSnapshot } from './match-pitch-data';
import { canonicalEventType } from '@/lib/commentary';

// ============================================================================
// TimelineEventType — which events get a marker
// ============================================================================

/**
 * The six event types we render as colored markers on the timeline.
 * Everything else (shots, corners, fouls, half-time, etc.) falls
 * back to the neutral snapshot ticks. We deliberately keep this list
 * small so the bar doesn't devolve into a crowded hairball when a
 * match has 30+ shots. Goals / subs / cards / injuries are the only
 * moments the reader genuinely wants to land on — INJURY is here
 * so a player going down (a frequent match-defining event) is
 * visible at a glance, not buried in the commentary feed.
 */
export const TIMELINE_EVENT_TYPES = [
  'GOAL',
  'SUBSTITUTION',
  'YELLOW_CARD',
  'SECOND_YELLOW',
  'RED_CARD',
  'INJURY',
] as const;

export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];

export interface TimelineMarker {
  /** Canonical uppercase type key (matches `TimelineEventType`). */
  type: TimelineEventType;
  /** Raw match minute — used for horizontal placement. The engine
   *  emits stoppage minutes with the stoppage-inclusive clock
   *  (e.g. `46` for the first 1H+1 stoppage minute), so the marker
   *  carries BOTH the raw number (for positioning) and the player-
   *  facing label (for tooltips / aria). */
  minute: number;
  /**
   * Player-facing minute label — the raw minute with a "+N"
   * suffix for stoppage-time events (e.g. "45+1" instead of "46").
   * Set by `extractTimelineMarkers` from the same stoppage windows
   * the engine writes on `half_time` / `full_time` events via
   * `data.injuryTime`. The renderer reads this verbatim rather
   * than re-deriving the format from `minute`.
   */
  minuteLabel: string;
  /** Team id, used by the marker to pick the home/away color side. */
  teamId?: string;
  /** Whether the event belongs to the home side (set when known). */
  isHome?: boolean;
  /**
   * Denormalised player name from the event payload. Optional
   * because legacy / pre-RFC events may not have it. The renderer
   * uses it for the `title` attribute so hovering a marker shows
   * who the event was about, without forcing the reader to click
   * through to the pitch view.
   */
  playerName?: string;
  /** Stable id for React keys — event id when present, else a hash. */
  key: string;
}

// ============================================================================
// extractTimelineMarkers
// ============================================================================

/**
 * Walk `events` and return a deduplicated list of timeline markers in
 * chronological order. Two events with the same (type, minute, teamId)
 * collapse to one — prevents duplicate dots when the simulator emits
 * both a `GOAL` and a `PENALTY_GOAL` for the same kick (the alias map
 * folds `PENALTY_GOAL` to `GOAL`, but defensive dedup is cheap).
 *
 * `injuryWindows` is the result of `extractInjuryWindows(events)` —
 * passed in (rather than re-derived here) so the caller can memo
 * the windows once and feed them to both `extractInjuryWindows`
 * consumers (timeline + sidebar + commentary feed) without re-
 * walking the events. Defaults to `[]` for tests / one-off call
 * sites that don't have the windows handy; the marker falls back
 * to the raw minute in that case.
 *
 * Pre-condition: events come from `api.matches.getEvents(matchId)` and
 * have already been typed by the API client. If the FE ever ingests a
 * pre-typed array, this filter is the only normalization needed.
 */
export function extractTimelineMarkers(
  events: MatchEvent[],
  injuryWindows: InjuryWindow[] = [],
): TimelineMarker[] {
  const out: TimelineMarker[] = [];
  const seen = new Set<string>();
  for (const e of events) {
    const canonical = canonicalEventType(e.typeName ?? e.type);
    if (!TIMELINE_EVENT_TYPES.includes(canonical as TimelineEventType)) continue;
    const minute = e.minute;
    const dedupeKey = `${canonical}-${minute}-${e.teamId ?? ''}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push({
      type: canonical as TimelineEventType,
      minute,
      // Player-facing label — e.g. "45+1" for a 1H+1 stoppage
      // event whose raw minute is 46. See `formatMatchMinute`
      // for the rule (strictly inside the stoppage window,
      // boundaries stay un-suffixed).
      minuteLabel: formatMatchMinute(minute, injuryWindows),
      teamId: e.teamId,
      isHome: e.isHome,
      // Pull `playerName` from the event's data payload — same source
      // `formatInjuryCommentary` and the GOAL/SUBSTITUTION formatters
      // use, so a hover tooltip on the marker will agree with the
      // text the commentary feed shows for the same event.
      playerName: (e.data as { playerName?: string } | undefined)?.playerName,
      key: e.id ?? dedupeKey,
    });
  }
  out.sort((a, b) => a.minute - b.minute);
  return out;
}

// ============================================================================
// timelineEnd
// ============================================================================

/**
 * Total minutes the timeline track should cover. Always at least 90
 * (a normal match); grows to whatever the latest event minute is so
 * extra-time / stoppage-time markers don't get clipped off the right
 * edge. Capped at 120 since no real match goes beyond that — extra
 * padding is added by the renderer.
 */
export function timelineEnd(
  events: MatchEvent[],
  currentMinute: number,
): number {
  let maxMinute = 90;
  for (const e of events) {
    if (e.minute > maxMinute) maxMinute = e.minute;
  }
  if (currentMinute > maxMinute) maxMinute = currentMinute;
  return Math.max(90, Math.min(120, maxMinute));
}

// ============================================================================
// minuteToPercent
// ============================================================================

/**
 * Map a match minute to a [0, 1] position along the timeline track.
 * Pure: clamping happens here so the renderer can stay focused on layout.
 */
export function minuteToPercent(minute: number, end: number): number {
  if (end <= 0) return 0;
  return Math.max(0, Math.min(1, minute / end));
}

// ============================================================================
// extractInjuryWindows
// ============================================================================

/**
 * Visual marker for a stoppage-time window. The timeline surfaces
 * these as a tinted band stretching from the regulation-half
 * boundary (e.g. 45) to the actual whistle minute (e.g. 48), so
 * the reader can see at a glance "this 3-minute gap is added time,
 * not a slow regulation half". Without the band, a 0-3 half
 * score reads as "the match was slow" rather than "3 minutes of
 * injury time were played".
 *
 * Driven by the `data.injuryTime` field the engine writes on the
 * `half_time` / `full_time` events. We only emit a window for
 * `addedMinutes > 0` — a clean half has no band.
 */
export interface InjuryWindow {
  /** Regulation-half end. 45 (1H), 90 (2H), 105 (ET 1H), 120 (ET 2H). */
  startMinute: number;
  /**
   * Actual whistle minute. `startMinute + addedMinutes`. Matches
   * the `minute` field on the corresponding `half_time` /
   * `full_time` event.
   */
  endMinute: number;
  /** The number of added stoppage minutes (the "+N" value). */
  addedMinutes: number;
  /**
   * Compact half-name for the aria / debug. `1H` is the regular
   * first half, `2H` the second half, `ET1H` / `ET2H` are the
   * extra-time halves.
   */
  label: '1H' | '2H' | 'ET1H' | 'ET2H';
}

/**
 * Walk `events` and return the 0-4 stoppage windows in
 * chronological order. Each window corresponds to a whistle
 * (half-time, full-time, or ET 1H half-time) whose `data.injuryTime`
 * is > 0. ET 2H is derived by subtracting ET 1H's stoppage from
 * the ET full-time's combined `data.injuryTime` value (the engine
 * writes the sum on the ET `full_time` event, so we split it
 * back out here).
 *
 * Pure / defensive: returns [] for empty input, ignores
 * `half_time` / `full_time` events with non-numeric or
 * `injuryTime: 0` data, and never throws on missing fields.
 */
export function extractInjuryWindows(events: MatchEvent[]): InjuryWindow[] {
  const out: InjuryWindow[] = [];

  const firstHalfHt = events.find(
    (e) =>
      e.type === 'half_time' &&
      (e.data as { period?: string } | undefined)?.period === 'half_time',
  );
  if (firstHalfHt) {
    const n1 = (firstHalfHt.data as { injuryTime?: number } | undefined)
      ?.injuryTime;
    if (typeof n1 === 'number' && n1 > 0) {
      out.push({
        startMinute: 45,
        endMinute: 45 + n1,
        addedMinutes: n1,
        label: '1H',
      });
    }
  }

  // 2H injury: the first `full_time` event is the regulation
  // 90+M whistle. The ET `full_time` (at 120+M2) is filtered out
  // by the `e.minute < 120` check below. (For a non-ET match
  // the engine emits exactly one `full_time` at minute 90+M.)
  const regFt = events.find(
    (e) => e.type === 'full_time' && e.minute < 120,
  );
  if (regFt) {
    const m = (regFt.data as { injuryTime?: number } | undefined)
      ?.injuryTime;
    if (typeof m === 'number' && m > 0) {
      out.push({
        startMinute: 90,
        endMinute: 90 + m,
        addedMinutes: m,
        label: '2H',
      });
    }
  }

  // ET 1H injury: the `half_time` with `period:
  // 'extra_time_half_time'` (the engine emits this between
  // ET 1H and ET 2H, with `data.injuryTime = N2`).
  const et1Ht = events.find(
    (e) =>
      e.type === 'half_time' &&
      (e.data as { period?: string } | undefined)?.period ===
        'extra_time_half_time',
  );
  if (et1Ht) {
    const n2 = (et1Ht.data as { injuryTime?: number } | undefined)
      ?.injuryTime;
    if (typeof n2 === 'number' && n2 > 0) {
      out.push({
        startMinute: 105,
        endMinute: 105 + n2,
        addedMinutes: n2,
        label: 'ET1H',
      });
    }
  }

  // ET 2H injury: derived from the ET `full_time` (at
  // 120+M2) whose `data.injuryTime` is the sum `N2 + M2`. We
  // subtract the ET 1H contribution (already captured above
  // when the ET 1H `half_time` was present) to isolate M2.
  const etFt = events.find(
    (e) => e.type === 'full_time' && e.minute >= 120,
  );
  if (etFt) {
    const total = (etFt.data as { injuryTime?: number } | undefined)
      ?.injuryTime;
    if (typeof total === 'number' && total > 0) {
      const n2 = (et1Ht?.data as { injuryTime?: number } | undefined)
        ?.injuryTime ?? 0;
      const m2 = total - n2;
      if (m2 > 0) {
        out.push({
          startMinute: 120,
          endMinute: 120 + m2,
          addedMinutes: m2,
          label: 'ET2H',
        });
      }
    }
  }

  return out;
}

// ============================================================================
// useInjuryWindows
// ============================================================================

/**
 * React hook wrapper around `extractInjuryWindows` with memoisation
 * keyed on the events array reference. Use this in any component
 * that needs the stoppage windows for the same `events` list across
 * multiple render sites (e.g. `LiveCommentary` derives them once and
 * passes to `EventBubble` / `TickerStrip` so each consumer doesn't
 * re-walk the events). Empty / undefined input returns [] (matches
 * `extractInjuryWindows`'s contract — never throws).
 */
export function useInjuryWindows(events: MatchEvent[] | undefined | null): InjuryWindow[] {
  return useMemo(
    () => (events ? extractInjuryWindows(events) : []),
    [events],
  );
}

// ============================================================================
// closestSnapshotIndex
// ============================================================================

/**
 * Return the index of the snapshot closest to `minute` without going
 * past it (snaps backwards). If `minute` is before the first snapshot,
 * returns 0; if past the last, returns the last index.
 *
 * Used when the user clicks a marker / drags the track — the timeline
 * drives the same `activeIndex` the scrubber does, so the pitch and
 * zone panel stay in sync.
 */
export function closestSnapshotIndex(
  snapshots: MatchSnapshot[],
  minute: number,
): number {
  if (snapshots.length === 0) return 0;
  let chosen = 0;
  for (let i = 0; i < snapshots.length; i++) {
    if (snapshots[i].minute <= minute) chosen = i;
    else break;
  }
  return chosen;
}

// ============================================================================
// formatMatchMinute
// ============================================================================

/**
 * Render a raw event minute as a "45+1"-style display string.
 *
 * The engine emits stoppage-time events with the stoppage-inclusive
 * minute (a 1H +3 event lands at `minute: 48`, the `half_time` whistle
 * at `minute: 48`, etc.) and surfaces the per-half stoppage count via
 * `data.injuryTime` on the `half_time` / `full_time` events. This
 * helper is the consumer-facing formatter: pass the raw minute + the
 * already-resolved `InjuryWindow[]`, and it returns the player-facing
 * label.
 *
 * Rules (driven by the four stoppage windows the engine writes):
 *   - minute in `(window.startMinute, window.endMinute]` — render as
 *     `${startMinute}+${minute - startMinute}` (the +N offset into
 *     that stoppage window)
 *   - minute outside any stoppage window — render as the raw minute
 *   - minute is exactly `window.startMinute` (e.g. minute 45 with
 *     a 1H+3 stoppage) — render as the raw minute (not "45+0").
 *     45 is the regulation-half end, not a stoppage minute. The
 *     half_time event at minute 48 is the "+3" boundary, and
 *     events strictly between 45 and 48 are the stoppage minutes.
 *   - injuryWindows is empty / undefined (e.g. old rows without
 *     `data.injuryTime`) — fall back to the raw minute so the
 *     pre-fix behaviour is preserved.
 *
 * Pre-fix code rendered the raw number everywhere (e.g. "46'" for
 * a 45+1 event), which is wrong: the engine's wire value 46 is the
 * STOPPAGE-INCLUSIVE clock, not the regulation minute. A reader
 * looking at the live feed would see "46'" and not know if the
 * event was in regulation 46 or in the 1H +3 window. This helper
 * surfaces the "+N" suffix the wire data is already carrying.
 */
export function formatMatchMinute(
  minute: number,
  injuryWindows: InjuryWindow[],
): string {
  if (!injuryWindows || injuryWindows.length === 0) return String(minute);
  for (const w of injuryWindows) {
    // Strictly inside the stoppage window: (start, end]. The start
    // minute itself (e.g. 45 for 1H) is the regulation-half end,
    // not a stoppage minute, so it's excluded.
    if (minute > w.startMinute && minute <= w.endMinute) {
      const offset = minute - w.startMinute;
      return `${w.startMinute}+${offset}`;
    }
  }
  return String(minute);
}