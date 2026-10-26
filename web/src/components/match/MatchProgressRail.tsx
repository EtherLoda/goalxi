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
 * Stoppage time gets its own cell at the end of each half rather than being
 * squeezed into 45' or 90' — the engine varies it per match, and a goal in
 * the 90+4 would otherwise have nowhere to sit.
 */

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { AppIcon } from '@/components/icons/AppIcon';
import { GlassPanel } from '@/components/ui/GlassPanel';
import type { MatchEvent } from '@/lib/api';
import {
  extractInjuryWindows,
  extractTimelineMarkers,
  type TimelineEventType,
  type TimelineMarker,
} from './match-timeline';

export interface MatchProgressRailProps {
  events: MatchEvent[];
  currentMinute: number;
  onSelectMinute?: (minute: number) => void;
  /** Minute currently on the pitch. Its bucket carries the selected ring. */
  selectedMinute?: number;
  className?: string;
}

const CELL_MINUTES = 5;
const CELLS_PER_HALF = 9; // 45 / 5

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
  const minute = marker.minute;
  if (minute <= 45) {
    const index = Math.min(CELLS_PER_HALF, Math.max(1, Math.ceil(minute / CELL_MINUTES)));
    return `h1-${index}`;
  }
  const index = Math.min(
    CELLS_PER_HALF,
    Math.max(1, Math.ceil((minute - 45) / CELL_MINUTES)),
  );
  return `h2-${index}`;
}

export function MatchProgressRail({
  events,
  currentMinute,
  onSelectMinute,
  selectedMinute,
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

  return (
    <GlassPanel className={`p-3 ${className ?? ''}`} data-testid="match-progress-rail">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="font-headline text-kicker uppercase tracking-[0.3em] text-on-surface-variant/70">
          {t('title')}
        </span>
        <span className="font-mono text-label tabular-nums text-on-surface">
          {currentMinute}&apos;
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={Math.max(90, currentMinute)}
        aria-valuenow={Math.round(currentMinute)}
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
                active={
                  !bucket.stoppage &&
                  currentMinute > bucket.start &&
                  currentMinute <= bucket.end
                }
                onSelect={onSelectMinute}
                selected={
                  selectedMinute != null &&
                  selectedMinute > bucket.start &&
                  selectedMinute <=
                    (bucket.end === 45 || bucket.end === 90 ? bucket.end + 6 : bucket.end)
                }
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
  onSelect,
  emptyLabel,
}: {
  bucket: Bucket;
  items: TimelineMarker[];
  played: boolean;
  active: boolean;
  selected: boolean;
  onSelect?: (minute: number) => void;
  emptyLabel: string;
}) {
  const multiple = items.length > 1;
  const single = items.length === 1 ? items[0] : null;
  const target = items.length > 0 ? Math.max(...items.map((item) => item.minute)) : bucket.stoppage ? bucket.start : bucket.end;

  return (
    <div className="group relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => onSelect?.(target)}
        aria-label={
          items.length === 0
            ? `${bucket.start}-${bucket.end}: ${emptyLabel}`
            : `${bucket.start}-${bucket.end}: ${items
                .map((item) => `${item.minuteLabel}' ${item.playerName ?? ''}`.trim())
                .join(', ')}`
        }
        className={`flex h-7 w-full items-center justify-center gap-[1px] rounded-sm border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${
          active
            ? 'border-primary/60 bg-primary/15 ring-1 ring-primary'
            : played
              ? 'border-transparent bg-surface-container-high/70'
              : 'border-transparent bg-surface-container/40'
        } ${items.length > 0 ? 'cursor-pointer hover:border-primary/40' : 'cursor-default'}`}
      >
        {single ? <EventGlyph type={single.type} /> : null}
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
          className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden -translate-x-1/2 flex-col gap-1 whitespace-nowrap rounded-md border border-outline-variant/30 bg-surface-container-highest/95 px-2 py-1.5 shadow-lg backdrop-blur-sm group-hover:flex group-focus-within:flex"
        >
          {items.map((item) => (
            <span
              key={item.key}
              className="flex items-center gap-1.5 text-kicker text-on-surface"
            >
              <EventGlyph type={item.type} />
              <span className="font-mono tabular-nums text-on-surface-variant">
                {item.minuteLabel}&apos;
              </span>
              <span className="truncate">{item.playerName ?? ''}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EventGlyph({ type }: { type: TimelineEventType }) {
  if (type === 'GOAL') {
    return <AppIcon name="sports_soccer" className="text-[13px] text-primary" />;
  }
  if (type === 'SUBSTITUTION') {
    return <AppIcon name="swap_horiz" className="text-[13px] text-on-surface-variant" />;
  }
  if (type === 'INJURY') {
    return <AppIcon name="add" className="text-[13px] text-error" />;
  }
  if (type === 'RED_CARD') {
    return <span aria-hidden className="block h-[11px] w-[8px] rounded-[1px] bg-error" />;
  }
  // YELLOW_CARD / SECOND_YELLOW
  return (
    <span aria-hidden className="block h-[11px] w-[8px] rounded-[1px] bg-signal-amber" />
  );
}
