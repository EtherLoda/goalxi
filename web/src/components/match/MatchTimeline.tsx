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

import { useCallback, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { MatchEvent } from '@/lib/api';
import { shouldCommitScrubber } from './snapshot-stats';
import {
  TIMELINE_EVENT_TYPES,
  type TimelineEventType,
  type TimelineMarker,
  closestSnapshotIndex,
  extractTimelineMarkers,
  minuteToPercent,
  timelineEnd,
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
}: MatchTimelineProps) {
  const t = useTranslations('matches.timeline');

  // Markers — memoized on the events list. extractTimelineMarkers is
  // pure, so calling it on every render would still be cheap, but
  // memoizing keeps the dedupe / sort from re-running on unrelated
  // re-renders (e.g. when `currentMinute` ticks by 1).
  const markers = useMemoMarkers(events);

  // endMinute — total length of the bar. Default 90, grows to fit the
  // latest event up to 120. Memoized on (events, currentMinute).
  const endMinute = useMemoEnd(events, currentMinute);

  // Snapshot ticks — derive minute positions from the snapshots prop.
  const snapshotTicks = snapshots.map((s, i) => ({ minute: s.minute, index: i }));

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
  };
  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (draftMinute === null) return;
    setDraftMinute(pointerToMinute(e.clientX));
  };
  const handlePointerUp = () => commitDraft();

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
  const playheadPercent = minuteToPercent(displayMinute, endMinute) * 100;
  const progressPercent = minuteToPercent(currentMinute, endMinute) * 100;

  // Half-time / full-time ticks — fixed minutes that help orient the
  // reader. 90' grows to endMinute if the match runs over (extra time).
  const halfTimeMin = 45;
  const fullTimeMin = endMinute >= 90 ? 90 : endMinute;

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
          {/* Fill — primary gradient from 0 to currentMinute */}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary/70 via-primary to-primary/90 shadow-[0_0_8px_rgba(0,228,121,0.35)] transition-[width] duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
            data-testid="match-timeline-fill"
          />
          {/* Half-time groove — vertical hairline at 45' */}
          <TickMark
            percent={minuteToPercent(halfTimeMin, endMinute) * 100}
            label="45'"
            align="top"
          />
          {/* Full-time groove — vertical hairline at 90' (or endMinute) */}
          <TickMark
            percent={minuteToPercent(fullTimeMin, endMinute) * 100}
            label={t('fullTimeTick', { minute: fullTimeMin })}
            align="top"
          />

          {/* Snapshot ticks — small dots sitting on the track */}
          {snapshotTicks.map((tick) => {
            const percent = minuteToPercent(tick.minute, endMinute) * 100;
            const isActive = tick.index === safeActiveIndex;
            return (
              <SnapshotTick
                key={`snap-${tick.index}-${tick.minute}`}
                percent={percent}
                isActive={isActive}
                minute={tick.minute}
                onClick={() => jumpToMinute(tick.minute)}
              />
            );
          })}

          {/* Playhead — the thumb. Anchored at the active minute, follows
              the draft while dragging. */}
          <Playhead percent={playheadPercent} minute={displayMinute} />
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
              percent={minuteToPercent(m.minute, endMinute) * 100}
              isHome={m.isHome}
              onClick={() => jumpToMinute(m.minute)}
            />
          ))}
        </div>

        {/* Minute scale labels — 0, 45, endMinute below the track */}
        <div className="absolute inset-x-6 -bottom-0.5 h-4 flex justify-between text-[9px] font-label uppercase tracking-widest text-outline pointer-events-none">
          <span data-testid="timeline-axis-start">0&apos;</span>
          <span data-testid="timeline-axis-mid">{halfTimeMin}&apos;</span>
          <span data-testid="timeline-axis-end">{endMinute}&apos;</span>
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
  minute,
  onClick,
}: {
  percent: number;
  isActive: boolean;
  minute: number;
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
      aria-label={`Snapshot at ${minute}'`}
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

function Playhead({ percent, minute }: { percent: number; minute: number }) {
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
        {minute}&apos;
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
      aria-label={`${marker.type} at ${marker.minute}'`}
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
// Local memoized helpers (kept in this file because they only matter
// for MatchTimeline; promote to a shared module if other components
// start consuming the same derivations).
// ============================================================================

import { useMemo } from 'react';

function useMemoMarkers(events: MatchEvent[]): TimelineMarker[] {
  return useMemo(() => extractTimelineMarkers(events), [events]);
}

function useMemoEnd(events: MatchEvent[], currentMinute: number): number {
  return useMemo(() => timelineEnd(events, currentMinute), [events, currentMinute]);
}