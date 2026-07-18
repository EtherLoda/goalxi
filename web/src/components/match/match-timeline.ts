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
 * The five event types we render as colored markers on the timeline.
 * Everything else (shots, corners, fouls, injuries, half-time, etc.)
 * falls back to the neutral snapshot ticks. We deliberately keep this
 * list small so the bar doesn't devolve into a crowded hairball when a
 * match has 30+ shots. Goals / subs / cards are the only moments the
 * reader genuinely wants to land on.
 */
export const TIMELINE_EVENT_TYPES = [
  'GOAL',
  'SUBSTITUTION',
  'YELLOW_CARD',
  'SECOND_YELLOW',
  'RED_CARD',
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