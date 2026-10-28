'use client';

/**
 * MatchProgressRail — the live page's read-only progress strip.
 *
 * Five-minute cells across the ninety: a cell with one event shows that
 * event's glyph, a cell with several shows a row of dots whose popover lists
 * them. Cells already played are lit, cells not yet reached are dim, so the
 * strip answers "how much is left" and "what already happened" at once.
 *
 * It is deliberately not draggable. A slider implies the viewer can control
 * the match, which they cannot: the engine pre-simulates the fixture and this
 * page replays it. The strip is a progressbar; clicking a cell looks at that
 * five-minute snapshot and the next event brings the playhead back.
 *
 * Stoppage-time markers are filed into the last cell of their half (40–45 and
 * 85–90) instead of being squeezed onto 45' or 90' — the engine varies added
 * time per match, and a goal in the 90+4 would otherwise have nowhere to sit.
 *
 * Cell glyphs come from `eventIcon`, the same lookup the commentary feed and
 * the ticker use — a yellow card in the strip is the exact card drawn next to
 * the sentence describing it. The clock on the right shows the playhead, not
 * the match's end, so a finished fixture opens at 0' with the kickoff eleven
 * on the pitch and every cell still lit.
 */

import { createElement, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { eventIcon } from './commentary-icons';
import type { MatchEvent } from '@/lib/api';
import {
  extractInjuryWindows,
  extractTimelineMarkers,
  type TimelineEventType,
  type TimelineMarker,
} from './match-timeline';
import {
  CELL_MINUTES,
  CELLS_PER_HALF,
  cellKeyAt,
  cellSeekMinute,
} from './progress-cells';

export interface MatchProgressRailProps {
  events: MatchEvent[];
  currentMinute: number;
  onSelectMinute?: (minute: number) => void;
  /** Minute currently on the pitch. Its bucket carries the selected ring. */
  selectedMinute?: number;
  /**
   * Reports the event behind a clicked glyph. Selecting a cell already moves
   * the playhead; this is what lets the commentary feed highlight the exact
   * sentence describing that duck — otherwise a 14px glyph jumps the pitch
   * and the reader still has to find the 55th line of the transcript.
   */
  onSelectEvent?: (eventId: string) => void;
  /** Event picked in the feed or the key-events column, ringed here too. */
  selectedEventId?: string | null;
  className?: string;
}

interface Bucket {
  key: string;
  start: number;
  end: number;
  stoppage: boolean;
  /** Tick label under the strip, only on the quarter hours. */
  tick?: string;
}
function buildBuckets(): Bucket[] {
  const buckets: Bucket[] = [];
  for (let i = 1; i <= CELLS_PER_HALF; i += 1) {
    const start = (i - 1) * CELL_MINUTES;
    const end = i * CELL_MINUTES;
    buckets.push({
      key: `h1-${i}`,
      start,
      end,
      stoppage: false,
      tick: start % 15 === 0 ? `${start}'` : undefined,
    });
  }
  for (let i = 1; i <= CELLS_PER_HALF; i += 1) {
    const start = 45 + (i - 1) * CELL_MINUTES;
    const end = 45 + i * CELL_MINUTES;
    buckets.push({
      key: `h2-${i}`,
      start,
      end,
      stoppage: false,
      tick: start % 15 === 0 ? `${start}'` : undefined,
    });
  }
  return buckets;
}

/** Which cell a marker belongs to. Stoppage markers key off their label. */
function bucketKeyOf(marker: TimelineMarker): string {
  if (marker.minuteLabel.includes('+')) {
    // 1H stoppage labels read "45+N", 2H ones read "90+N".
    return marker.minuteLabel.startsWith('45') ? 'h1-' + CELLS_PER_HALF : 'h2-' + CELLS_PER_HALF;
  }
  return cellKeyAt(marker.minute);
}

export function MatchProgressRail({
  events,
  currentMinute,
  onSelectMinute,
  selectedMinute,
  onSelectEvent,
  selectedEventId,
  className,
}: MatchProgressRailProps) {
  const t = useTranslations('matches.spine');

  const { buckets, byBucket } = useMemo(() => {
    const windows = extractInjuryWindows(events);
    const markers = extractTimelineMarkers(events, windows);

    const grouped = new Map<string, TimelineMarker[]>();
    for (const marker of markers) {
      const key = bucketKeyOf(marker);
      const list = grouped.get(key);
      if (list) list.push(marker);
      else grouped.set(key, [marker]);
    }

    return {
      buckets: buildBuckets(),
      byBucket: grouped,
    };
  }, [events]);

  // Two different minutes are in play. `currentMinute` is how far the match
  // has actually run — it decides which cells are lit, so a finished game
  // still reads as "all of this happened". `selectedMinute` is where the
  // playhead sits — it decides which cell is ringed and what the clock reads.
  // A finished match opens on the kickoff snapshot, so the strip starts on
  // the first cell instead of parking on the last one.
  const playhead = Math.max(0, selectedMinute ?? currentMinute);
  const playheadKey = cellKeyAt(playhead);

  return (
    <GlassPanel className={`p-3 ${className ?? ''}`} data-testid="match-progress-rail">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="font-headline text-kicker uppercase tracking-[0.3em] text-on-surface-variant/70">
          {t('title')}
        </span>
        <span className="font-mono text-label tabular-nums text-on-surface">
          {Math.round(playhead)}&apos;
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={Math.max(90, currentMinute)}
        aria-valuenow={Math.round(playhead)}
        aria-label={t('title')}
        className="flex items-stretch gap-[2px]"
      >
        {buckets.map((bucket) => {
          const items = byBucket.get(bucket.key) ?? [];
          const played = bucket.stoppage
            ? currentMinute >= bucket.start
            : currentMinute >= bucket.end;

          return (
            <div key={bucket.key} className="flex min-w-0 flex-1 items-stretch gap-[2px]">
              <BucketCell
                bucket={bucket}
                items={items}
                played={played}
                active={bucket.key === playheadKey}
                selectedEventId={selectedEventId ?? null}
                onSelect={onSelectMinute}
                onSelectEvent={onSelectEvent}
                emptyLabel={t('empty')}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-1 flex gap-[2px] font-headline text-kicker tabular-nums text-on-surface-variant/40">
        {buckets.map((bucket) => (
          <span key={`tick-${bucket.key}`} className="min-w-0 flex-1 text-center">
            {bucket.tick ?? ''}
          </span>
        ))}
      </div>
    </GlassPanel>
  );
}

function BucketCell({
  bucket,
  items,
  played,
  active,
  selectedEventId,
  onSelect,
  onSelectEvent,
  emptyLabel,
}: {
  bucket: Bucket;
  items: TimelineMarker[];
  played: boolean;
  active: boolean;
  selectedEventId: string | null;
  onSelect?: (minute: number) => void;
  onSelectEvent?: (eventId: string) => void;
  emptyLabel: string;
}) {
  const multiple = items.length > 1;
  const single = items.length === 1 ? items[0] : null;
  const target = cellSeekMinute(bucket.start, items);

  return (
    <div className="group relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => {
          onSelect?.(target);
          if (single?.eventId) onSelectEvent?.(single.eventId);
        }}
        aria-label={
          items.length === 0
            ? `${bucket.start}-${bucket.end}: ${emptyLabel}`
            : `${bucket.start}-${bucket.end}: ${items
                .map((item) => `${item.minuteLabel}' ${item.playerName ?? ''}`.trim())
                .join(', ')}`
        }
        className={`flex h-7 w-full items-center justify-center gap-[1px] rounded-sm border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${
          active
            ? 'border-primary bg-primary/20 ring-2 ring-primary'
            : played
              ? 'border-transparent bg-surface-container-high/70'
              : 'border-transparent bg-surface-container/40'
        } cursor-pointer hover:border-primary/40`}
      >
        {single ? <EventGlyph type={single.type} data={single.data} size={14} /> : null}
        {multiple ? (
          <span aria-hidden className="flex items-center gap-[2px]">
            <span className="size-[3px] rounded-full bg-on-surface-variant" />
            <span className="size-[3px] rounded-full bg-on-surface-variant" />
            <span className="size-[3px] rounded-full bg-on-surface-variant" />
          </span>
        ) : null}
      </button>

      {multiple ? (
        <div
          role="tooltip"
          className="absolute bottom-full left-1/2 z-20 mb-1 hidden -translate-x-1/2 flex-col gap-0.5 whitespace-nowrap rounded-md border border-outline-variant/30 bg-surface-container-highest/95 px-1 py-1 shadow-lg backdrop-blur-sm group-hover:flex group-focus-within:flex"
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                onSelect?.(item.minute);
                if (item.eventId) onSelectEvent?.(item.eventId);
              }}
              className={`flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-left text-kicker transition-colors hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${
                item.eventId && item.eventId === selectedEventId
                  ? 'bg-primary/10 text-primary'
                  : 'text-on-surface'
              }`}
            >
              <EventGlyph type={item.type} data={item.data} size={14} />
              <span className="font-mono tabular-nums text-on-surface-variant">
                {item.minuteLabel}&apos;
              </span>
              <span className="max-w-[140px] truncate">{item.playerName ?? ''}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EventGlyph({
  type,
  data,
  size = 16,
}: {
  type: TimelineEventType;
  data?: Record<string, unknown> | null;
  size?: number;
}) {
  // Same glyph set as the commentary feed and the ticker: `eventIcon` is the
  // single mapping for match events, so the strip cannot drift from the
  // sentences that describe the same moments. `createElement` (rather than
  // rendering `<Icon />`) matches the other two call sites and keeps the
  // hooks lint rule from mistaking the lookup for an inline component.
  // `data` is forwarded because some glyphs are payload-dependent — a
  // weather cell must draw the announced sky, not a generic cloud.
  const Icon = eventIcon(type, data);
  return createElement(Icon, { size });
}
