/**
 * MatchTimeline.tsx — horizontal match progress bar.
 *
 * Renders the 90-minute (or 90+, for extra time) match axis with three
 * overlaid layers:
 *
 *   1. **Track** — a filled progress portion from 0 → currentMinute,
 *      tinted with the home team's primary color. The remaining length
 *      is a subtle slate track. The fill animates smoothly so a live
 *      tick feels like a watch hand, not a jump.
 *   2. **Snapshot ticks** — small dots, one per snapshot, at the
 *      snapshot's minute position. Active tick scales up and picks up
 *      the primary color. Each tick is also clickable — clicking jumps
 *      the scrubber to that snapshot.
 *   3. **Event markers** — colored circles for goals (⚽, primary
 *      green), substitutions (🔄, sky blue), yellow cards (🟨, amber),
 *      red cards (🟥, red). Each marker is anchored above the track and
 *      clickable; the click commits the scrubber to the nearest
 *      snapshot at-or-before that minute.
 *
 * Above the track sits a small header strip: "X' — Snap N/M" on the
 * left, a legend on the right. Below the track, half-time (45') and
 * full-time (90', or timelineEnd) tick marks anchor the reader.
 *
 * The component owns the drag interaction. During drag we follow the
 * cursor with a "draft" position; on mouseup / touchend we commit a
 * single snapshot index to the parent (no mid-drag re-render of the
 * pitch).
 *
 * No data fetches — pure props in / props out.
 */

'use client';

import { useCallback, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { MatchEvent } from '@/lib/api';
import { shouldCommitScrubber } from './snapshot-stats';
import {
  TIMELINE_EVENT_TYPES,
  type TimelineEventType,
  type TimelineMarker,
  type InjuryWindow,
  closestSnapshotIndex,
  deriveSnapshotPeriods,
  extractInjuryWindows,
  extractTimelineMarkers,
  formatMatchMinute,
  minuteToPercent,
  resolveWhistleMinutes,
  timelineEnd,
  visualMinute,
} from './match-timeline';
import type { MatchSnapshot } from './match-pitch-data';

// ============================================================================
// Public types
// ============================================================================

export interface MatchTimelineProps {
  /** All events for the match (snapshot + goals + cards + subs + ...). */
  events: MatchEvent[];
  /** Snapshots in chronological order — used for tick layout + jumping. */
  snapshots: MatchSnapshot[];
  /** Current match minute (drives the progress fill + active-marker position). */
  currentMinute: number;
  /** Index of the snapshot the scrubber is showing. */
  activeIndex: number;
  /** Called when the user settles on a new snapshot. */
  onChange: (index: number) => void;
  /**
   * Fires when the user starts a drag (pointerdown on the track).
   * Parent uses this to suspend auto-snap-to-latest while the user is
   * actively scrubbing — without it, an incoming snapshot during a drag
   * yanks the playhead back to the latest tick (B1).
   *
   * Optional: live report pages that don't auto-snap can ignore it.
   */
  onScrubStart?: () => void;
  /**
   * Fires when the drag ends (pointerup / pointercancel). Parent
   * re-arms auto-snap. Marking a single marker click as "scrubbing"
   * would over-lock the timeline (see B1 in the review), so this
   * callback is intentionally restricted to true drag interactions.
   */
  onScrubEnd?: () => void;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Visual style for each event type. Centralized so a designer can swap
 * the palette in one place.
 *
 * NOTE on icons: Material Symbols has icons like `sports_score` and
 * `swap_horiz`, but no canonical "yellow card" / "red card" glyph —
 * existing commentary uses the unicode dots 🟨🟥 for those. We do the
 * same here: emoji-based markers survive any icon-font load failure
 * and read clearly at any size.
 */
const EVENT_VISUAL: Record<
  TimelineEventType,
  { glyph: string; ringClass: string; bgClass: string; labelClass: string }
> = {
  GOAL: {
    glyph: '⚽',
    ringClass: 'ring-primary/40',
    bgClass: 'bg-primary',
    labelClass: 'text-on-primary',
  },
  SUBSTITUTION: {
    glyph: '⇄',
    ringClass: 'ring-sky-400/50',
    bgClass: 'bg-sky-500',
    labelClass: 'text-white',
  },
  YELLOW_CARD: {
    glyph: '🟨',
    ringClass: 'ring-amber-400/50',
    bgClass: 'bg-amber-400',
    labelClass: 'text-amber-950',
  },
  SECOND_YELLOW: {
    glyph: '🟨',
    ringClass: 'ring-amber-400/50',
    bgClass: 'bg-amber-400',
    labelClass: 'text-amber-950',
  },
  RED_CARD: {
    glyph: '🟥',
    ringClass: 'ring-red-500/50',
    bgClass: 'bg-red-500',
    labelClass: 'text-white',
  },
  INJURY: {
    // Material Symbols has a `medical_services` icon, but using the
    // same emoji-as-glyph convention as the other markers (🟨/🟥)
    // keeps the visual weight consistent and survives icon-font
    // load failures. The red cross-on-white reads at any size.
    glyph: '🚑',
    ringClass: 'ring-rose-500/50',
    bgClass: 'bg-rose-500',
    labelClass: 'text-white',
  },
};

// ============================================================================
// MatchTimeline
// ============================================================================

export function MatchTimeline({
  events,
  snapshots,
  currentMinute,
  activeIndex,
  onChange,
  onScrubStart,
  onScrubEnd,
}: MatchTimelineProps) {
  const t = useTranslations('matches.timeline');

  // Markers — memoized on the events list. extractTimelineMarkers
  // is pure, so calling it on every render would still be cheap,
  // but memoizing keeps the dedupe / sort from re-running on
  // unrelated re-renders (e.g. when `currentMinute` ticks by 1).
  // `injuryWindows` is passed so each marker carries its
  // pre-formatted "+N" label for stoppage-time events.
  const injuryWindows = useMemoInjuryWindows(events);
  const markers = useMemoMarkers(events, injuryWindows);

  // Stoppage-time windows (1H / 2H / ET 1H / ET 2H). Memoized
  // alongside `markers` so both recompute on the same event-list
  // changes. (Hoisted above the markers line so the markers can
  // also receive the windows for the "+N" label format.) Used to
  // render the amber-tinted band + "+N" label so a reader can
  // see the stoppage window as a distinct region of the timeline.
  //
  // (Removed — `injuryWindows` is declared above alongside
  // `markers` so the hook call is hoisted to share memo state.)
  //
  // endMinute — total length of the bar. Default 90, grows to fit the
  // latest event up to 120. Memoized on (events, currentMinute).
  // Declared BEFORE `useMemoWhistleMinutes` because the whistle
  // helper needs the end-minute as a fallback for matches that
  // haven't reached the final whistle yet (live mid-match).
  // The `injuryWindows` argument triggers the 2H-shift so the
  // visual end is engine end + N1 - 1 (e.g. 1H+3 / 2H+5 →
  // engine end 95 → visual end 97, so the 2H regulation has
  // visual space to abut the 1H injury band rather than
  // overlapping it).
  const endMinute = useMemoEnd(events, currentMinute, injuryWindows);

  // Whistle minutes for the 1H / 2H / ET tick marks. The engine
  // emits `half_time` / `full_time` events with the stoppage-
  // inclusive minute (e.g. `45 + firstHalfInjuryTime`), so we
  // read those and surface the actual whistle time on the tick
  // labels (a 1H+2 stoppage reads as "45+2'" — the wire value).
  const whistleMinutes = useMemoWhistleMinutes(events, endMinute);

  // Snapshot ticks — derive minute positions from the snapshots prop.
  const snapshotTicks = snapshots.map((s, i) => ({ minute: s.minute, index: i }));
  // Per-snapshot period — used to apply the 2H shift to dots that
  // belong to 2H regulation / injury snapshots. Without this, a
  // snapshot at engine minute 46 (2H kickoff) sits at visual
  // 46 inside the 1H injury band instead of at visual 51 just
  // past the half-time gap. The `events` list is sorted by
  // `(minute, second, id)`, so the API order at the half-time
  // boundary is reversed vs real-time — the helper uses both
  // the list position and the engine minute to recover the
  // real period. See `deriveSnapshotPeriods` for the full rule.
  const snapshotPeriods = useMemoSnapshotPeriods(events);

  // Active snapshot, clamped defensively against an out-of-range index
  // (the parent should never pass one, but timeline rendering must
  // still survive the case).
  const safeActiveIndex = Math.min(
    Math.max(activeIndex, 0),
    Math.max(snapshots.length - 1, 0),
  );
  const activeMinute =
    snapshots[safeActiveIndex]?.minute ?? Math.min(currentMinute, endMinute);

  // -------------------------------------------------------------------------
  // Drag state — same draft/commit pattern as the old scrubber. During
  // drag we follow the cursor; commit on pointer release.
  // -------------------------------------------------------------------------

  const trackRef = useRef<HTMLDivElement | null>(null);
  const [draftMinute, setDraftMinute] = useState<number | null>(null);

  // The position to render the playhead at. Draft (while dragging)
  // wins over active; falls back to active when the user releases.
  const displayMinute = draftMinute ?? activeMinute;

  // Pointer-to-minute — converts the cursor's x-coordinate to a match
  // minute using the track's bounding rect. Clamped to [0, endMinute].
  const pointerToMinute = useCallback(
    (clientX: number): number => {
      const el = trackRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return 0;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.round(ratio * endMinute);
    },
    [endMinute],
  );

  // Commit the current draft to the parent. Uses the same helper the
  // old scrubber did so "click without move" stays a no-op (no pitch
  // re-render unless the user actually moved).
  const commitDraft = useCallback(() => {
    if (draftMinute === null) return;
    const targetIndex = closestSnapshotIndex(snapshots, draftMinute);
    const next = shouldCommitScrubber(targetIndex, safeActiveIndex);
    if (next !== null) onChange(next);
    setDraftMinute(null);
  }, [draftMinute, snapshots, safeActiveIndex, onChange]);

  // Pointer down — start a drag. We listen on pointerdown so mouse,
  // touch, and pen all share one path. setPointerCapture keeps the
  // events flowing even if the cursor leaves the track during drag.
  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (snapshots.length === 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraftMinute(pointerToMinute(e.clientX));
    onScrubStart?.();
  };
  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (draftMinute === null) return;
    setDraftMinute(pointerToMinute(e.clientX));
  };
  const handlePointerUp = () => {
    commitDraft();
    onScrubEnd?.();
  };

  // Click on a marker / tick — commit to that minute's nearest snapshot.
  // We compute the click directly off the marker's minute, bypassing the
  // pointer math so the click is rock-solid even when the marker has
  // been translated by its own padding.
  const jumpToMinute = (minute: number) => {
    if (snapshots.length === 0) return;
    const targetIndex = closestSnapshotIndex(snapshots, minute);
    const next = shouldCommitScrubber(targetIndex, safeActiveIndex);
    if (next !== null) onChange(next);
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  // Playhead position (% of track). Active minute first, then draft.
  // `displayMinute` is the engine minute; we need its visual
  // equivalent for placement on the track (2H events shift
  // right by N1-1 so the 2H region abuts the 1H injury band).
  // The display minute on the chip stays engine-formatted
  // (e.g. "90+5'") — the shift is layout-only.
  const firstHalfInjury =
    injuryWindows.find((w) => w.label === '1H')?.addedMinutes ?? 0;
  // Apply the 2H-shift on display minute only when it's actually
  // in the 2H region. The 1H region (0-45+N1) doesn't shift.
  const playheadVisual = visualMinute(
    displayMinute,
    // The engine's current minute <= 45+N1 means we're still in
    // the 1H region (no shift). For 2H the period in
    // `currentPeriod` (from the WS payload) would be more
    // authoritative, but the engine convention is that any
    // engine minute > 45+N1 is in 2H or beyond, and the helper
    // already keys off the threshold, so we pass `undefined`
    // and let `visualMinute` shift based on the threshold.
    undefined,
    firstHalfInjury,
  );
  const playheadPercent = minuteToPercent(playheadVisual, endMinute) * 100;
  const progressPercent =
    minuteToPercent(
      visualMinute(currentMinute, undefined, firstHalfInjury),
      endMinute,
    ) * 100;

  // Fill split: the 1H fill covers the 1H regulation half
  // (visual 0-45), the 2H fill starts at the 2H kickoff
  // (visual 45+N1+1, one minute after the 1H whistle for the
  // half-time break) and runs to the visual end. Both widths
  // are clamped to the playhead position so the 1H fill caps
  // at 45 even if the playhead is well into the 2H, and the 2H
  // fill is 0 if the playhead is still in 1H.
  const firstHalfFillEndVisual = 45;
  const secondHalfFillStartVisual = 45 + firstHalfInjury + 1;
  const currentVisual = visualMinute(
    currentMinute,
    undefined,
    firstHalfInjury,
  );
  const firstHalfWidthPercent = Math.max(
    0,
    Math.min(currentVisual, firstHalfFillEndVisual) / endMinute * 100,
  );
  const secondHalfWidthPercent = currentVisual <= secondHalfFillStartVisual
    ? 0
    : (Math.min(currentVisual, endMinute) - secondHalfFillStartVisual) /
        endMinute *
      100;
  const secondHalfLeftPercent =
    (secondHalfFillStartVisual / endMinute) * 100;

  // Half-time / full-time ticks — the actual whistle minutes the
  // engine wrote on the `half_time` / `full_time` events
  // (stoppage-inclusive). The band already shows the stoppage
  // region; the tick position now lands on the right edge of
  // each band (the whistle), and the label uses the "+N" form
  // so a reader can read "45+2'" / "90+3'" at a glance.
  const halfTimeMin = whistleMinutes.halfTime;
  const fullTimeMin = whistleMinutes.fullTime;

  return (
    <div
      className="rounded-2xl border border-surface-container-high bg-surface-container-low overflow-hidden"
      data-testid="match-timeline"
    >
      {/* Header — title left, legend right */}
      <TimelineHeader
        activeMinute={activeMinute}
        snapshotIndex={safeActiveIndex}
        totalSnapshots={snapshots.length}
        currentMinute={currentMinute}
      />

      {/* Track + markers. 28px vertical breathing room so event markers
          can sit above the track without colliding with the header. */}
      <div className="relative px-6 pt-6 pb-7 select-none">
        {/* Track container — owns pointer interaction */}
        <div
          ref={trackRef}
          role="slider"
          aria-label={t('ariaLabel')}
          aria-valuemin={0}
          aria-valuemax={endMinute}
          aria-valuenow={displayMinute}
          aria-valuetext={`${displayMinute}'`}
          tabIndex={0}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="relative h-3 rounded-full bg-surface-container-high cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          data-testid="match-timeline-track"
        >
          {/* Fill — split into two strips so the 1H injury band
              region (45-45+N1) and the 1-minute "half-time break"
              (45+N1 to 45+N1+1) sit on the track background, NOT
              under the primary gradient. The pre-fix single fill
              was a continuous 0-currentMinute gradient that ran
              THROUGH the 1H injury band, so the band's amber
              tint mixed with the primary green into a muddy
              olive — readers couldn't tell where 1H injury ended
              and 2H started. The 1H fill covers the 1H
              regulation half (0-45); the 2H fill starts at the
              2H kickoff visual position (45+N1+1) and runs to
              the end of the track. Both strips share the same
              primary gradient so the colour stays consistent
              across the half-time break. The gap is exactly the
              1H injury duration plus one visual minute for the
              half-time break. */}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary/70 via-primary to-primary/90 shadow-[0_0_8px_rgba(0,228,121,0.35)] transition-[width] duration-300 ease-out"
            style={{ width: `${firstHalfWidthPercent}%` }}
            data-testid="match-timeline-fill-1h"
            aria-label="first half progress"
          />
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary/70 via-primary to-primary/90 shadow-[0_0_8px_rgba(0,228,121,0.35)] transition-[width] duration-300 ease-out"
            style={{ left: `${secondHalfLeftPercent}%`, width: `${secondHalfWidthPercent}%` }}
            data-testid="match-timeline-fill-2h"
            aria-label="second half progress"
          />
          {/* Injury-time bands — amber-tinted strip that visually
              distinguishes the stoppage window from the regulation
              half. Renders AFTER the fill (not before) so the band
              stays visible once the playhead passes it. The
              pre-fix ordering put the band behind the fill, which
              made the 1H stoppage window (45-48) invisible the
              moment the playhead crossed 48’ — leaving only the
              2H band visible, so the reader couldn’t tell how much
              stoppage was played in the 1H after the fact. The 15%
              amber tint sits cleanly on top of the primary gradient. */}
          {injuryWindows.map((w) => (
            <InjuryBand
              key={`injury-${w.label}-${w.startMinute}`}
              window={w}
              endMinute={endMinute}
              firstHalfInjury={firstHalfInjury}
            />
          ))}
          {/* Half-time groove — vertical hairline at the actual 1H
              whistle minute. The 1H whistle lives in the no-shift
              region (period 'half_time' is excluded by visualMinute's
              period check), so the tick sits at its engine position
              (visual 45+N1 for 1H+N1). Position and label are both
              driven by the engine's `half_time` event minute. */}
          <TickMark
            percent={
              minuteToPercent(
                visualMinute(halfTimeMin, 'half_time', firstHalfInjury),
                endMinute,
              ) * 100
            }
            label={`${formatMatchMinute(halfTimeMin, injuryWindows)}'`}
            align="top"
          />
          {/* Full-time groove — same as half-time but for the
              regulation full_time event. The 2H whistle lives in
              the shift region (engine 90+N2, no `data.period` set
              by the engine, so visualMinute falls back to the
              minute threshold), so the tick lands at the visual
              2H end (engine 90+N2 + N1-1 = 89+N1+N2 for a
              regulation match). The label stays engine-formatted
              ("90+5'") so the reader sees the actual whistle
              time, not the layout position. */}
          <TickMark
            percent={
              minuteToPercent(
                visualMinute(fullTimeMin, undefined, firstHalfInjury),
                endMinute,
              ) * 100
            }
            label={`${formatMatchMinute(fullTimeMin, injuryWindows)}'`}
            align="top"
          />

          {/* Snapshot ticks — small dots sitting on the track.
              Each dot's visual position comes from
              `visualMinute(engineMinute, period, N1)` so a 2H
              reg snapshot at engine minute 46 (the same wire
              value as the 2H kickoff) lands at visual 51,
              abutting the 1H injury band's right edge with
              the half-time gap, instead of at visual 46
              inside the band. Pre-fix this map used the
              engine minute directly without the period, so
              2H dots lagged their 2H event markers by N1
              visual minutes. */}
          {snapshotTicks.map((tick, i) => {
            const period = snapshotPeriods[i];
            const visual = visualMinute(
              tick.minute,
              period,
              firstHalfInjury,
            );
            const percent = minuteToPercent(visual, endMinute) * 100;
            const isActive = tick.index === safeActiveIndex;
            return (
              <SnapshotTick
                key={`snap-${tick.index}-${tick.minute}`}
                percent={percent}
                isActive={isActive}
                minuteLabel={formatMatchMinute(tick.minute, injuryWindows, period)}
                onClick={() => jumpToMinute(tick.minute)}
              />
            );
          })}

          {/* Playhead — the thumb. Anchored at the active minute, follows
              the draft while dragging. */}
          <Playhead
            percent={playheadPercent}
            minuteLabel={formatMatchMinute(displayMinute, injuryWindows)}
          />
        </div>

        {/* Event markers — positioned above the track. Rendered outside
            the track container so pointer events on them don't compete
            with the track's pointer handlers (the marker is itself
            pointer-events-auto so it captures clicks on its own dot). */}
        <div className="absolute inset-x-6 top-0 h-6 pointer-events-none">
          {markers.map((m) => (
            <EventMarker
              key={m.key}
              marker={m}
              // Use `m.visualMinute` (pre-shifted via the marker's
              // own `data.period`) with a plain 2-arg
              // `minuteToPercent` (no re-shift). `extractTimelineMarkers`
              // computes `visualMinute` from the event's
              // `data.period`, which the engine sets for 2H events
              // at engine minute 46 — so a 2H reg goal at engine
              // m=46 lands at visual m=N1+1, not at m=46 inside
              // the 1H injury band. The pre-fix layout fed
              // `m.visualMinute` into a 3-arg `minuteToPercent`,
              // which re-applied the shift (visual 60+5+5 = 70
              // for an event at engine 60 with N1=5) — markers
              // lagged 5 visual minutes past the 2H region start.
              percent={minuteToPercent(m.visualMinute, endMinute) * 100}
              isHome={m.isHome}
              onClick={() => jumpToMinute(m.minute)}
            />
          ))}
        </div>

        {/* Minute scale labels — 0, half-time, endMinute below the
            track. The half-time label mirrors the tick mark above
            (stoppage-inclusive, e.g. "45+2'") so a reader can read
            the half boundary off either the tick or the axis. */}
        <div className="absolute inset-x-6 -bottom-0.5 h-4 flex justify-between text-[9px] font-label uppercase tracking-widest text-outline pointer-events-none">
          <span data-testid="timeline-axis-start">0&apos;</span>
          <span data-testid="timeline-axis-mid">{formatMatchMinute(halfTimeMin, injuryWindows)}&apos;</span>
          <span data-testid="timeline-axis-end">{formatMatchMinute(fullTimeMin, injuryWindows)}&apos;</span>
        </div>
      </div>

      {/* Legend — bottom strip. Shows a sample marker for each event type
          with a label so the reader knows what the colors mean. */}
      <Legend />
    </div>
  );
}

// ============================================================================
// TimelineHeader
// ============================================================================

function TimelineHeader({
  activeMinute,
  snapshotIndex,
  totalSnapshots,
  currentMinute,
}: {
  activeMinute: number;
  snapshotIndex: number;
  totalSnapshots: number;
  currentMinute: number;
}) {
  const t = useTranslations('matches.timeline');
  return (
    <div className="flex items-center justify-between px-5 py-3 border-b border-surface-container-high">
      <h3 className="font-headline font-bold text-xs uppercase tracking-widest text-primary flex items-center gap-1.5">
        <span className="material-symbols-outlined text-sm text-primary">timeline</span>
        {t('title')}
      </h3>
      <div className="flex items-center gap-3 text-[10px] font-headline uppercase tracking-widest text-on-surface-variant tabular-nums">
        {totalSnapshots > 0 && (
          <span data-testid="timeline-snap-label">
            {t('snapLabel', {
              index: snapshotIndex + 1,
              total: totalSnapshots,
              minute: activeMinute,
            })}
          </span>
        )}
        <span className="font-mono font-black text-sm text-primary" data-testid="timeline-now">
          {currentMinute}&apos;
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// TickMark — vertical hairline at a known minute
// ============================================================================

function TickMark({
  percent,
  label,
  align,
}: {
  percent: number;
  label: string;
  align: 'top' | 'bottom';
}) {
  return (
    <div
      className="absolute inset-y-0 w-px bg-outline-variant/40 pointer-events-none"
      style={{ left: `${percent}%` }}
      aria-hidden="true"
    >
      <span
        className={`absolute left-1/2 -translate-x-1/2 font-label text-[8px] uppercase tracking-widest text-outline ${
          align === 'top' ? '-top-3.5' : '-bottom-3.5'
        }`}
      >
        {label}
      </span>
    </div>
  );
}

// ============================================================================
// SnapshotTick
// ============================================================================

function SnapshotTick({
  percent,
  isActive,
  minuteLabel,
  onClick,
}: {
  percent: number;
  isActive: boolean;
  /** Player-facing minute label (e.g. "45+1" for a 1H+1 stoppage tick). */
  minuteLabel: string;
  onClick: () => void;
}) {
  // Active tick scales up and uses primary. Inactive stays a muted ring.
  return (
    <button
      type="button"
      onClick={(e: MouseEvent) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={`Snapshot at ${minuteLabel}'`}
      className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all ${
        isActive
          ? 'w-3 h-3 bg-primary ring-2 ring-primary/30 shadow-[0_0_6px_rgba(0,228,121,0.5)]'
          : 'w-1.5 h-1.5 bg-outline-variant/70 hover:bg-on-surface-variant hover:scale-125'
      }`}
      style={{ left: `${percent}%` }}
      data-testid={isActive ? 'timeline-tick-active' : 'timeline-tick'}
    />
  );
}

// ============================================================================
// Playhead
// ============================================================================

function Playhead({
  percent,
  minuteLabel,
}: {
  percent: number;
  /** Player-facing minute label (e.g. "45+1" for a 1H+1 stoppage
   *  scrubber position). */
  minuteLabel: string;
}) {
  return (
    <div
      className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
      style={{ left: `${percent}%` }}
      data-testid="timeline-playhead"
    >
      {/* Vertical line — connects the thumb to a tooltip-like minute chip
          floating just above the track. */}
      <div className="absolute left-1/2 -translate-x-1/2 -top-7 h-7 w-px bg-primary/60" />
      {/* Thumb — the round knob on the track */}
      <div className="w-4 h-4 rounded-full bg-primary ring-2 ring-primary/30 shadow-[0_0_10px_rgba(0,228,121,0.45)]" />
      {/* Minute chip — small label above the thumb showing the current
          scrubbed minute. Always visible so the reader doesn't have to
          hunt. */}
      <div className="absolute left-1/2 -translate-x-1/2 -top-9 px-1.5 py-0.5 rounded-md bg-primary text-on-primary font-mono font-black text-[10px] tabular-nums">
        {minuteLabel}&apos;
      </div>
    </div>
  );
}

// ============================================================================
// EventMarker
// ============================================================================

function EventMarker({
  marker,
  percent,
  onClick,
}: {
  marker: TimelineMarker;
  percent: number;
  isHome?: boolean;
  onClick: () => void;
}) {
  const visual = EVENT_VISUAL[marker.type];
  // Anchor — slightly higher for away events so home/away markers
  // don't sit on the same horizontal line and overlap when they fire
  // in the same minute. Pure visual sugar; the marker still occupies
  // the same minute position.
  const topOffset = marker.isHome === false ? 'top-1' : 'top-0';

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      // Tooltip: when the event payload carries a player name
      // (goals / subs / injuries do; legacy / pre-RFC events may
      // not), surface it on hover so a reader can tell the three
      // ⚽ markers apart without click-through. Falls back to the
      // type label so the title is never blank.
      title={
        marker.playerName
          ? `${marker.playerName} — ${marker.type} ${marker.minuteLabel}'`
          : `${marker.type} at ${marker.minuteLabel}'`
      }
      aria-label={
        marker.playerName
          ? `${marker.playerName} — ${marker.type} at ${marker.minuteLabel}'`
          : `${marker.type} at ${marker.minuteLabel}'`
      }
      className={`absolute ${topOffset} -translate-x-1/2 w-5 h-5 rounded-full ring-2 ${visual.ringClass} ${visual.bgClass} flex items-center justify-center pointer-events-auto cursor-pointer hover:scale-125 hover:ring-4 transition-all shadow-md`}
      style={{ left: `${percent}%` }}
      data-testid={`timeline-marker-${marker.type.toLowerCase()}`}
    >
      <span
        className={`leading-none ${visual.labelClass}`}
        style={{ fontSize: '11px' }}
      >
        {visual.glyph}
      </span>
    </button>
  );
}

// ============================================================================
// Legend
// ============================================================================

function Legend() {
  const t = useTranslations('matches.timeline');
  // Mini marker + label per event type. Re-uses EVENT_VISUAL so a
  // change to the marker palette flows through the legend too.
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2.5 border-t border-surface-container-high bg-surface-container-lowest/30">
      {TIMELINE_EVENT_TYPES.map((type) => {
        const visual = EVENT_VISUAL[type];
        // Dedup second-yellow from the legend (it's still a yellow card
        // visually; the second-yellow upgrade to red happens at the
        // event-level, not the marker-level).
        if (type === 'SECOND_YELLOW') return null;
        return (
          <span
            key={type}
            className="inline-flex items-center gap-1.5 text-[9px] font-headline uppercase tracking-widest text-on-surface-variant"
            data-testid={`timeline-legend-${type.toLowerCase()}`}
          >
            <span
              className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-full ${visual.bgClass} ring-1 ${visual.ringClass}`}
            >
              <span
                className={`leading-none ${visual.labelClass}`}
                style={{ fontSize: '9px' }}
              >
                {visual.glyph}
              </span>
            </span>
            {t(`legend.${type.toLowerCase()}`)}
          </span>
        );
      })}
    </div>
  );
}

// ============================================================================
// InjuryBand — amber-tinted strip marking a stoppage-time window.
// ============================================================================

function InjuryBand({
  window: w,
  endMinute,
  firstHalfInjury,
}: {
  window: InjuryWindow;
  endMinute: number;
  /** First-half injury duration (N1). 2H / ET2H bands shift
   *  right by N1 (one minute past the 1H whistle, the same
   *  offset `visualMinute` applies to 2H events); 1H / ET1H
   *  bands stay at their engine positions. The pre-fix
   *  N1-1 offset left the 2H band 1 visual minute too far
   *  left for the 2H whistle — e.g. 2H +5 stoppage on a
   *  100-minute track sat at 94-99% instead of 95-100%,
   *  and the 2H whistle tick at 100% no longer aligned
   *  with the band's right edge. */
  firstHalfInjury: number;
}) {
  const t = useTranslations('matches.timeline');
  // The band stretches from the regulation boundary to the
  // whistle minute. For 2H / ET2H bands, shift both endpoints
  // right by N1 (matching the 2H event shift in `visualMinute`)
  // so the band lands at the right visual position. For 1H /
  // ET1H, the band sits at its engine position (1H injury is
  // at 45-45+N1, which is the END of the 1H region — no
  // shift needed).
  const isShiftedBand = w.label === '2H' || w.label === 'ET2H';
  const shift = isShiftedBand ? firstHalfInjury : 0;
  const left = minuteToPercent(w.startMinute + shift, endMinute) * 100;
  const right = minuteToPercent(w.endMinute + shift, endMinute) * 100;
  const width = Math.max(0, right - left);
  return (
    <div
      // 35% amber tint + 1px top/bottom border in solid amber.
      // The pre-fix 15% tint was visually lost over the primary
      // green fill — a 1H+3 stoppage on a 95-minute track is
      // ~3% wide, and 15% amber on full-opacity green reads as
      // a barely-different shade. 35% + a hard 1px edge gives
      // the band a clear "this region is stoppage" outline
      // without overpowering the progress fill.
      className="absolute inset-y-0 rounded-sm border-y border-amber-500/80 dark:border-amber-400/80 bg-amber-500/35 dark:bg-amber-400/35 pointer-events-none"
      style={{ left: `${left}%`, width: `${width}%` }}
      data-testid={`timeline-injury-band-${w.label.toLowerCase()}`}
      aria-hidden="true"
    >
      {/* "+N" label — sits centered in the band, just below the
          track. Pre-fix threshold was `width > 4` (4% of the
          track), which excluded 1H+3 on any normal-length match
          (a 1H+3 stoppage on a 95-minute track is 3.16%).
          Lowered to 2.5 so even 1H+3 gets a label. */}
      {width > 2.5 && (
        <span
          className="absolute left-1/2 top-full mt-0.5 -translate-x-1/2 font-mono font-bold text-[8px] tabular-nums text-amber-700 dark:text-amber-300 leading-none"
          title={t('injuryBandTitle', {
            half: t(`injuryHalf.${w.label}`),
            minutes: w.addedMinutes,
          })}
        >
          {t('injuryTimePlus', { minutes: w.addedMinutes })}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// Local memoized helpers (kept in this file because they only matter
// for MatchTimeline; promote to a shared module if other components
// start consuming the same derivations).
// ============================================================================

function useMemoMarkers(
  events: MatchEvent[],
  injuryWindows: InjuryWindow[],
): TimelineMarker[] {
  return useMemo(
    () => extractTimelineMarkers(events, injuryWindows),
    [events, injuryWindows],
  );
}

function useMemoInjuryWindows(events: MatchEvent[]): InjuryWindow[] {
  return useMemo(() => extractInjuryWindows(events), [events]);
}

function useMemoWhistleMinutes(
  events: MatchEvent[],
  endMinute: number,
): { halfTime: number; fullTime: number; etHalfTime: number | null; final: number } {
  return useMemo(
    () => resolveWhistleMinutes(events, endMinute),
    [events, endMinute],
  );
}

function useMemoEnd(
  events: MatchEvent[],
  currentMinute: number,
  injuryWindows: InjuryWindow[],
): number {
  // Pass `injuryWindows` so the visual end includes the 2H-shift
  // (engine end + N1 - 1). Without the windows the timeline
  // collapses back to the engine end (90 by default).
  return useMemo(
    () => timelineEnd(events, currentMinute, injuryWindows),
    [events, currentMinute, injuryWindows],
  );
}

function useMemoSnapshotPeriods(events: MatchEvent[]): string[] {
  // One-pass walk; events are usually ≤ a few hundred rows so the
  // raw allocation is fine. Memoised on the events reference so a
  // re-render that doesn't change the events list reuses the
  // result (the parent passes the same array down).
  return useMemo(() => deriveSnapshotPeriods(events), [events]);
}