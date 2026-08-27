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
  /** Raw match minute — used for the player-facing label
   *  (`"45+1"` etc.) and for any per-minute tooltip that wants
   *  the engine value. The engine emits stoppage minutes with
   *  the stoppage-inclusive clock (e.g. `46` for the first 1H+1
   *  stoppage minute, 2H regulation also starts at 46), so the
   *  marker carries both the raw minute (for the label) and
   *  the visual position (for layout). */
  minute: number;
  /**
   * Visual position the marker should be rendered at, after the
   * 2H-shift (`visualMinute(engineMinute, period, N1)`). For
   *  1H events this equals `minute`; for 2H / 2H-injury /
   *  extra-time-2H events it's `minute + (N1 - 1)` so the 2H
   *  region abuts the 1H injury band rather than overlapping
   *  it. Set by `extractTimelineMarkers` from the same injury
   *  windows the engine writes on `half_time` / `full_time`.
   */
  visualMinute: number;
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
      // Visual position after the 2H-shift — 1H events stay at
      // their engine minute, 2H / 2H-injury / ET-2H events
      // move right by (N1 - 1) so the 2H region abuts the 1H
      // injury band. See `visualMinute` for the full rule.
      visualMinute: visualMinute(
        minute,
        (e.data as { period?: string } | undefined)?.period,
        firstHalfInjuryFromWindows(injuryWindows),
      ),
      // Player-facing label — e.g. "45+1" for a 1H+1 stoppage
      // event whose raw minute is 46. See `formatMatchMinute`
      // for the rule (strictly inside the stoppage window,
      // boundaries stay un-suffixed). The 2H kickoff is the
      // reason the third `period` arg matters: it lands at
      // engine minute 46 — same wire value as the first 1H
      // stoppage minute — and without the period filter the
      // formatter prints "45+1" for a 2H kickoff, which is
      // both wrong (it's 2H regulation, not 1H injury) and
      // earlier in the feed than the 1H whistle that prints
      // as "45+5".
      minuteLabel: formatMatchMinute(
        minute,
        injuryWindows,
        (e.data as { period?: string } | undefined)?.period,
      ),
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
 * (Forward-declared above as the post-shift version. The actual
 *  implementation lives near the bottom of this file so the
 *  helper functions it depends on (`firstHalfInjuryFromWindows`)
 *  are in scope.)
 */

// ============================================================================
// visualMinute
// ============================================================================

/**
 * Apply the "2H-shift" to an engine minute. The engine's wire
 * convention is that the second half's `minute` field starts at
 * `46` (the next game-clock slot after 1H's 1-45) regardless of
 * how much 1H injury was played — so for a match with 1H+3
 * stoppage, the 2H kickoff event lands at engine minute 46 even
 * though the actual on-field kickoff happens at clock 48.
 *
 * Visually, the user expects 1H injury (clock 45-48) to end
 * BEFORE 2H regulation starts — i.e. 2H should NOT be at the
 * same position as the 1H injury band, and there should be a
 * visible 1-minute "half-time break" between them. The shift
 * moves every 2H-period event right by `N1` (where N1 = first-
 * half injury duration), so for 1H+3:
 *   - 2H kickoff (engine 46) → visual 49 (= 46 + 3, one minute
 *     past the 1H whistle at visual 48)
 *   - 2H whistle  (engine 95) → visual 98 (= 95 + 3)
 *   - 1H whistle  (engine 48) → visual 48 (no shift — it's
 *     in the no-shift region)
 * The visual end (visual 98 = engine 95 + N1) lines up with
 * the 2H whistle at the right edge of the track.
 *
 * The 1-minute gap between visual 48 (1H whistle) and visual
 * 49 (2H kickoff) is the half-time break — rendered as empty
 * track (no fill) on the timeline so a reader can see the
 * boundary.
 *
 * Period `first_half*` events are NOT shifted — those are the
 * 1H region (0-45 regulation + 45-45+N1 injury), and the
 * 1H injury band already lives at visual 45-45+N1 with no
 * shift. Period `extra_time_first_half*` is also NOT shifted:
 * it's the "1H of extra time", and the half-time gap between
 * 2H whistle and ET 1H is preserved as visual space.
 *
 * Fallback for events WITHOUT `data.period` (e.g. the engine's
 * 2H `full_time` whistle, which is pushed with type, minute,
 * and stoppage count but no period field): use the minute
 * threshold. Once the wire minute is past the 1H injury band
 * (> 45 + N1), we're in the 2H / ET 2H region and the shift
 * applies.
 */
export function visualMinute(
  engineMinute: number,
  period: string | undefined,
  firstHalfInjury: number,
): number {
  if (firstHalfInjury <= 0) return engineMinute;
  if (
    period === 'second_half' ||
    period === 'second_half_injury' ||
    period === 'extra_time_second_half' ||
    period === 'extra_time_second_half_injury'
  ) {
    return engineMinute + firstHalfInjury;
  }
  if (period === undefined && engineMinute > 45 + firstHalfInjury) {
    return engineMinute + firstHalfInjury;
  }
  return engineMinute;
}

/** Read the 1H injury duration off the windows array (0 if no 1H stoppage). */
function firstHalfInjuryFromWindows(windows: InjuryWindow[]): number {
  return windows.find((w) => w.label === '1H')?.addedMinutes ?? 0;
}

// ============================================================================
// minuteToPercent
// ============================================================================

/**
 * Map a match minute to a [0, 1] position along the timeline track.
 * Pure: clamping happens here so the renderer can stay focused on layout.
 *
 * `injuryWindows` (default `[]`) optionally applies the 2H-shift via
 * `visualMinute` so 1H injury and 2H regulation don't overlap on the
 * track. When `[]`, the function is byte-identical to the pre-shift
 * behaviour (no visual transform) — backwards compatible with
 * existing callers / tests that don't have the windows handy.
 */
export function minuteToPercent(
  minute: number,
  end: number,
  injuryWindows: InjuryWindow[] = [],
): number {
  if (end <= 0) return 0;
  const n1 = firstHalfInjuryFromWindows(injuryWindows);
  const visual = visualMinute(minute, undefined, n1);
  return Math.max(0, Math.min(1, visual / end));
}

// ============================================================================
// timelineEnd
// ============================================================================

/**
 * Total length of the timeline track. Default 90, grows to fit the
 * latest event minute if past 90. With `injuryWindows` supplied,
 * the returned length is the VISUAL end (engine end + N1 - 1) so
 * the 2H-shift compresses the timeline correctly: a 1H+3 / 2H+5
 * match has engine end 95 but visual end 97 (the 2H regulation
 * shifts right by 2 to abut the 1H injury band). Default `[]`
 * keeps the legacy behaviour (engine end).
 */
export function timelineEnd(
  events: MatchEvent[],
  currentMinute: number,
  injuryWindows: InjuryWindow[] = [],
): number {
  const maxEventMinute = events.reduce((max, e) => Math.max(max, e.minute), 0);
  const engineEnd = Math.max(90, maxEventMinute, currentMinute);
  // Cap the engine end at 120 — no real match goes beyond that
  // (extra time is 105-120). The renderer pads further if the
  // cap was too tight.
  const cappedEngineEnd = Math.min(120, engineEnd);
  const n1 = firstHalfInjuryFromWindows(injuryWindows);
  // N1 = 0 (no 1H stoppage): no shift. N1 > 0: shift by N1
  // so the 2H region sits 1 visual minute after the 1H whistle
  // (creating a "half-time break" gap in the timeline). The
  // 1-minute gap is purely visual — the engine emits 2H at
  // engine 46 regardless of N1.
  return cappedEngineEnd + n1;
}

// ============================================================================
// extractInjuryWindows
// ============================================================================

/**
 * Whitelist check for the period-transition event types we care
 * about (`half_time` / `full_time`). The wire shape has
 * `typeName` as the canonical name (RFC 0002 Phase 3 dropped
 * the legacy `type` int column — see
 * `libs/database/src/entities/match-event.entity.ts:44-47`).
 * The WS gateway also sets `type` to the same value
 * (`e.typeName`), so we accept either field for
 * backwards-compat with older / cached payloads. The legacy
 * int enum values (e.g. 32 for `half_time`) would NOT match —
 * they were the pre-Phase 3 wire format.
 */
function isHalfTimeEvent(e: MatchEvent): boolean {
  return e.typeName === 'half_time' || e.type === 'half_time';
}
function isFullTimeEvent(e: MatchEvent): boolean {
  return e.typeName === 'full_time' || e.type === 'full_time';
}

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
      isHalfTimeEvent(e) &&
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
    (e) => isFullTimeEvent(e) && e.minute < 120,
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
      isHalfTimeEvent(e) &&
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
    (e) => isFullTimeEvent(e) && e.minute >= 120,
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
// resolveWhistleMinutes
// ============================================================================

/**
 * Find the actual stoppage-inclusive whistle minutes for the
 * 1H / 2H / ET 1H / ET 2H boundaries. The engine emits `half_time`
 * / `full_time` events with `minute: 45 + firstHalfInjuryTime`
 * etc., so the wire value is the actual time the ref blew the
 * whistle — the FE just needs to read it. Returns the regulation
 * boundary (45 / 90) as a fallback when the matching event
 * hasn't arrived yet (e.g. live match in the first 45 minutes,
 * the half_time event fires only when the whistle blows).
 *
 * The values drive the timeline's half-time / full-time tick
 * mark positions AND their labels (a 1H+2 stoppage reads as
 * "45+2'" — the wire value of the `half_time` event's `minute`).
 */
export interface WhistleMinutes {
  /** Actual 1H whistle minute. Defaults to 45 when no event yet. */
  halfTime: number;
  /**
   * Actual 2H whistle minute. Defaults to 90 when no event yet.
   * For an ET match this is the regulation full_time, not the
   * final whistle — use `endMinute` for the ET whistle, which
   * the timeline already exposes separately.
   */
  fullTime: number;
  /**
   * ET 1H whistle minute. `null` when the match has no ET 1H
   * half_time (i.e. regulation-only). Defaults to `null`.
   */
  etHalfTime: number | null;
  /**
   * Final whistle minute (the ET full_time if ET was played, or
   * the regulation full_time otherwise). Defaults to
   * `endMinute` when no event has arrived yet (live mid-match).
   */
  final: number;
}

export function resolveWhistleMinutes(
  events: MatchEvent[],
  endMinute: number,
): WhistleMinutes {
  // 1H whistle — `half_time` with `data.period === 'half_time'`.
  // This is the engine's pre-ET first-half whistle.
  const firstHalfHt = events.find(
    (e) =>
      isHalfTimeEvent(e) &&
      (e.data as { period?: string } | undefined)?.period === 'half_time',
  );
  // 2H (regulation) whistle — `full_time` with `minute < 120`.
  // The `minute < 120` guard avoids picking up the ET full_time
  // event (which lands at 120+stoppage) when ET is played.
  const regFt = events.find(
    (e) => isFullTimeEvent(e) && e.minute < 120,
  );
  // ET 1H whistle — `half_time` with `data.period ===
  // 'extra_time_half_time'`. `null` for regulation-only matches.
  const et1Ht = events.find(
    (e) =>
      isHalfTimeEvent(e) &&
      (e.data as { period?: string } | undefined)?.period ===
        'extra_time_half_time',
  );
  // Final whistle — the ET full_time (at 120+stoppage). If
  // there's no ET full_time, fall back to the regulation
  // full_time's minute; if neither has arrived, fall back to
  // `endMinute` (which the timeline's `timelineEnd` helper
  // already grows to fit the latest event).
  const etFt = events.find(
    (e) => isFullTimeEvent(e) && e.minute >= 120,
  );
  return {
    halfTime: firstHalfHt?.minute ?? 45,
    fullTime: regFt?.minute ?? 90,
    etHalfTime: et1Ht?.minute ?? null,
    final: etFt?.minute ?? regFt?.minute ?? endMinute,
  };
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
 * The optional `period` argument narrows the window search to the
 * half that owns the event. This is required to label the 2H
 * kickoff correctly: the engine emits the kickoff at engine minute
 * 46 (same wire value as the first 1H stoppage minute) with
 * `data.period = 'second_half'`. Without the period filter, the
 * helper matches the 1H window and prints "45+1'" — a 2H kickoff
 * appears in the live feed as 1H stoppage time, *earlier* than the
 * 1H whistle (which prints as "45+5'"). With `period = 'second_half'`
 * the helper looks only at the 2H/ET2H windows, sees that 46 is
 * not in the 2H stoppage range, and falls through to "46" — the
 * 2H kickoff renders at its real engine clock.
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
  period?: string,
): string {
  if (!injuryWindows || injuryWindows.length === 0) return String(minute);
  const windows = windowsForPeriod(injuryWindows, period);
  for (const w of windows) {
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

/**
 * Restrict the stoppage window set to the ones that own `period`.
 *
 * Mapping (the engine wire format):
 *   - 'first_half' / 'first_half_injury' / 'half_time'
 *       → 1H windows
 *   - 'second_half' / 'second_half_injury'
 *       → 2H windows
 *   - 'extra_time_first_half' / 'extra_time_first_half_injury' /
 *     'extra_time_half_time'
 *       → ET1H windows
 *   - 'extra_time_second_half' / 'extra_time_second_half_injury'
 *       → ET2H windows
 *   - undefined / unrecognised
 *       → all windows (back-compat with pre-period-aware callers)
 *
 * Returns the original `windows` array reference when `period` is
 * undefined so the back-compat path doesn't pay a copy.
 */
export function windowsForPeriod(
  windows: InjuryWindow[],
  period: string | undefined,
): InjuryWindow[] {
  if (!period) return windows;
  const allowedLabels = periodToWindowLabels(period);
  if (!allowedLabels) return windows;
  return windows.filter((w) => allowedLabels.has(w.label));
}

function periodToWindowLabels(
  period: string,
): Set<InjuryWindow['label']> | null {
  switch (period) {
    case 'first_half':
    case 'first_half_injury':
    case 'half_time':
      return new Set<InjuryWindow['label']>(['1H']);
    case 'second_half':
    case 'second_half_injury':
      return new Set<InjuryWindow['label']>(['2H']);
    case 'extra_time_first_half':
    case 'extra_time_first_half_injury':
    case 'extra_time_half_time':
      return new Set<InjuryWindow['label']>(['ET1H']);
    case 'extra_time_second_half':
    case 'extra_time_second_half_injury':
      return new Set<InjuryWindow['label']>(['ET2H']);
    default:
      return null;
  }
}

// ============================================================================
// deriveSnapshotPeriods
// ============================================================================

/**
 * Walk the events list and assign each SNAPSHOT a `data.period` so
 * the timeline can apply the 2H shift per-snapshot (without a `period`
 * field, a snapshot at engine minute 46 in 1H injury and the
 * corresponding 2H reg snapshot at the same minute are
 * indistinguishable).
 *
 * The list is sorted by `(minute, second, id)` per
 * `match-event.service.ts:131` — NOT by real-time chronological
 * order. Around the half-time boundary, the order is reversed:
 * the 2H kickoff (engine minute 46) sorts BEFORE the 1H injury
 * events at engine minutes 47-50 and BEFORE the 1H whistle at
 * engine minute 50. The walker has to recover real-time order
 * from the list-order + engine-minute combination.
 *
 * Algorithm (in order, first match wins):
 *   1. The engine may set `data.period` on some snapshot events
 *      (e.g. a 2H reg snapshot emitted after the kickoff). Use it.
 *   2. Snapshot at the same minute as the 2H kickoff, listed AFTER
 *      the 2H kickoff → 2H reg. (The 1H injury snapshot at the
 *      same minute would be listed BEFORE the kickoff, so this
 *      catches only the post-kickoff 2H reg snapshot.)
 *   3. Snapshot at the 1H whistle minute:
 *      - listed BEFORE the 1H whistle → 1H injury (the last 1H
 *        stoppage minute's snapshot, just before the ref blows)
 *      - listed AT/AFTER the 1H whistle → 2H (the first 2H reg
 *        snapshot at the same engine minute)
 *   4. Snapshot at engine minute < 1H whistle minute → 1H
 *      (regulation if minute ≤ 45, injury otherwise)
 *   5. Snapshot at engine minute > 1H whistle minute → 2H
 *      (regulation if minute < 90, injury otherwise)
 *   6. No 1H whistle in the events list → 1H (no 2H/ET distinction)
 *
 * ET matches follow the same shape with the 1H/2H thresholds
 * extended to the ET boundaries — the 1H whistle resolution
 * above naturally routes ET 1H/2H snapshots by minute, since
 * the engine emits the 1H/2H whistle and the ET 1H/2H whistle
 * at distinct engine minutes.
 *
 * Returns a string[] of `data.period` values, one per input
 * event. Indices that aren't snapshots are NOT in the returned
 * array (the caller filters SNAPSHOT events and zips the result
 * back to the snapshots prop).
 */
export function deriveSnapshotPeriods(events: MatchEvent[]): string[] {
  const periods: string[] = [];
  let halfTimeIdx = -1;
  let halfTimeMinute = -1;
  let secondHalfIdx = -1;
  let secondHalfMinute = -1;
  let fullTimeMinute = -1;

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const dp = (e.data as { period?: string } | undefined)?.period;
    if (halfTimeIdx === -1 && e.typeName === 'half_time' && dp === 'half_time') {
      halfTimeIdx = i;
      halfTimeMinute = e.minute;
    }
    if (
      secondHalfIdx === -1 &&
      e.typeName === 'second_half' &&
      dp === 'second_half'
    ) {
      secondHalfIdx = i;
      secondHalfMinute = e.minute;
    }
    if (fullTimeMinute === -1 && e.typeName === 'full_time') {
      fullTimeMinute = e.minute;
    }
  }

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.typeName !== 'snapshot') continue;
    const dp = (e.data as { period?: string } | undefined)?.period;
    if (dp) {
      periods.push(dp);
      continue;
    }
    // 2H kickoff at the same minute, listed after the kickoff → 2H reg.
    if (
      secondHalfIdx !== -1 &&
      e.minute === secondHalfMinute &&
      i > secondHalfIdx
    ) {
      periods.push('second_half');
      continue;
    }
    // 1H whistle at the same minute, listed before the whistle → 1H
    // injury; at or after → 2H.
    if (halfTimeIdx !== -1 && e.minute === halfTimeMinute) {
      if (i < halfTimeIdx) {
        periods.push('first_half_injury');
      } else {
        periods.push('second_half');
      }
      continue;
    }
    // Fall back to the minute threshold vs the 1H whistle minute.
    if (halfTimeMinute !== -1) {
      if (e.minute < halfTimeMinute) {
        periods.push(e.minute > 45 ? 'first_half_injury' : 'first_half');
        continue;
      }
      if (e.minute > halfTimeMinute) {
        periods.push(
          e.minute >= 90
            ? 'second_half_injury'
            : 'second_half',
        );
        continue;
      }
    }
    periods.push('first_half');
  }

  return periods;
}

/**
 * Look up the period of a single engine minute, by walking the
 * same boundary events as `deriveSnapshotPeriods`. Used for the
 * live cursor in `LiveCommentary` (no list index, just an engine
 * minute + the surrounding events).
 *
 * The interesting case is engine minute 46 right after the 2H
 * kickoff — the engine emits the kickoff at minute 46 (same wire
 * value as the first 1H stoppage minute), so a naive threshold
 * (currentMinute > 45 + N1) misses it. The helper checks
 * `secondHalfIdx !== -1` first: if the 2H kickoff has been seen,
 * any currentMinute at or past the kickoff's engine minute is in
 * 2H.
 */
export function derivePeriodForMinute(
  events: MatchEvent[],
  currentMinute: number,
): string {
  let halfTimeMinute = -1;
  let secondHalfIdx = -1;
  let fullTimeMinute = -1;
  for (const e of events) {
    const dp = (e.data as { period?: string } | undefined)?.period;
    if (
      halfTimeMinute === -1 &&
      e.typeName === 'half_time' &&
      dp === 'half_time'
    ) {
      halfTimeMinute = e.minute;
    }
    if (
      secondHalfIdx === -1 &&
      e.typeName === 'second_half' &&
      dp === 'second_half'
    ) {
      secondHalfIdx = 1; // truthy marker — we only need "seen or not"
    }
    if (fullTimeMinute === -1 && e.typeName === 'full_time') {
      fullTimeMinute = e.minute;
    }
  }
  // Live cursor at or after the 2H kickoff → 2H. (Use 46 as the
  // kickoff's engine minute, since the engine always emits the
  // kickoff at minute 46 regardless of N1.)
  if (secondHalfIdx !== -1 && currentMinute >= 46) {
    if (currentMinute > 45 && currentMinute < (halfTimeMinute === -1 ? 46 : halfTimeMinute)) {
      // Past the kickoff but still in the 1H injury minute range
      // — shouldn't happen in real-time, but the threshold is safe.
      return 'first_half_injury';
    }
    return currentMinute >= 90 ? 'second_half_injury' : 'second_half';
  }
  if (halfTimeMinute !== -1) {
    if (currentMinute < halfTimeMinute) {
      return currentMinute > 45 ? 'first_half_injury' : 'first_half';
    }
    if (currentMinute > halfTimeMinute) {
      return currentMinute >= 90 ? 'second_half_injury' : 'second_half';
    }
    return 'first_half_injury';
  }
  if (fullTimeMinute !== -1 && currentMinute >= 90) {
    return 'second_half_injury';
  }
  return currentMinute > 45 ? 'first_half_injury' : 'first_half';
}

/**
 * Return the real-time chronological phase of a single event as a
 * small integer suitable for `Array.sort` comparison. Used by
 * the commentary feed (and the ticker) to break the half-time
 * tie: the engine emits the 2H kickoff at engine minute 46 and
 * the 1H whistle at engine minute 45+N1, but the API sort is by
 * `(minute, second, id)`, which puts the 2H kickoff *before* the
 * 1H whistle in the list — even though the kickoff happens
 * after the whistle in real time. Without a phase-aware sort,
 * the feed renders "46' 下半场开始" *before* "45+5' 半场结束",
 * which a reader reads as a time paradox.
 *
 * Phase values:
 *   0 = 1H (regulation, injury, whistle)
 *   1 = 2H (regulation, injury, whistle)
 *   2 = ET 1H
 *   3 = ET 2H
 *
 * For events with `data.period` set, the engine's own
 * classification wins (1H events tagged `first_half_injury`
 * always sort before 2H events tagged `second_half`, even when
 * the engine minutes are equal). For unperioded events we
 * fall back to the engine minute + the 1H whistle minute: an
 * event at engine minute < halfTimeMinute is 1H, and at engine
 * minute > halfTimeMinute is 2H. At the halfTimeMinute itself
 * (the rare case of a regular match event at the same engine
 * minute as the 1H whistle), the default is 1H — the engine
 * emits 1H injury events before the whistle event, and any
 * post-whistle 2H event at the same engine minute would carry
 * `data.period = 'second_half'` and route via the period-aware
 * branch above.
 */
export function phaseOfEvent(event: MatchEvent, events: MatchEvent[]): number {
  const dp = (event.data as { period?: string } | undefined)?.period;
  if (dp) {
    if (dp.startsWith('first_half') || dp === 'half_time') return 0;
    if (dp.startsWith('second_half') || dp === 'full_time') return 1;
    if (dp.startsWith('extra_time_first_half') || dp === 'extra_time_half_time') return 2;
    if (dp.startsWith('extra_time_second_half')) return 3;
  }
  const halfTime = events.find(
    (e) =>
      e.typeName === 'half_time' &&
      (e.data as { period?: string } | undefined)?.period === 'half_time',
  );
  const halfTimeMinute = halfTime?.minute ?? -1;
  if (halfTimeMinute === -1) return 0;
  if (event.minute < halfTimeMinute) return 0;
  if (event.minute > halfTimeMinute) return 1;
  return 0;
}