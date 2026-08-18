/**
 * match-timeline.ts — pure helpers for the horizontal match timeline.
 *
 * Lives in `.ts` (not `.tsx`) so jest can resolve it without a jsdom
 * environment. Owns:
 *   - `TIMELINE_EVENT_TYPES` — the event types we render as markers on
 *     the timeline (everything else falls through to the snapshot ticks).
 *   - `extractTimelineMarkers(events)` — walks the event list, returns a
 *     deduplicated list of `{ type, minute, teamId, side }` markers
 *     suitable for laying out on the 0–90 minute axis.
 *   - `timelineEnd(events, currentMinute)` — total minutes the bar
 *     covers (90 by default; grows if an event falls past the 90th
 *     minute so extra-time events stay visible).
 *   - `closestSnapshotIndex(snapshots, minute)` — used when the user
 *     clicks a marker / the track itself: jump the scrubber to the
 *     nearest snapshot by minute (snapping backwards; we never jump
 *     past a moment the user hasn't "watched" yet).
 *
 * Pure functions — no React, no fetch. The page component owns the
 * `activeIndex` state and reads these helpers inside `useMemo`s.
 */

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
  /** Match minute — used for horizontal placement. */
  minute: number;
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
 * Pre-condition: events come from `api.matches.getEvents(matchId)` and
 * have already been typed by the API client. If the FE ever ingests a
 * pre-typed array, this filter is the only normalization needed.
 */
export function extractTimelineMarkers(events: MatchEvent[]): TimelineMarker[] {
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