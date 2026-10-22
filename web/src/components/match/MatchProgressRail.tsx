'use client';

/**
 * MatchProgressRail — the live page's read-only progress track.
 *
 * Live needs "how much is left", not "read the whole match". So this is one
 * bar in three segments (first half / second half / stoppage) with goal pips
 * pinned on it, and it is deliberately NOT draggable: a slider would imply
 * the viewer can control the match, which they cannot — live is a replay that
 * happens to be running. `role="progressbar"`, not `role="slider"`.
 *
 * The report does not use this; it reads the vertical spine instead, so the
 * minute→position mapping exists in exactly one place.
 */

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { GlassPanel } from '@/components/ui/GlassPanel';
import type { MatchEvent } from '@/lib/api';
import {
  extractInjuryWindows,
  extractTimelineMarkers,
  minuteToPercent,
  resolveWhistleMinutes,
  timelineEnd,
} from './match-timeline';

export interface MatchProgressRailProps {
  events: MatchEvent[];
  currentMinute: number;
  onSelectMinute?: (minute: number) => void;
  className?: string;
}

export function MatchProgressRail({
  events,
  currentMinute,
  onSelectMinute,
  className,
}: MatchProgressRailProps) {
  const t = useTranslations('matches.spine');

  const { segments, goals, playhead, end } = useMemo(() => {
    const windows = extractInjuryWindows(events);
    const end = timelineEnd(events, currentMinute, windows);
    const whistle = resolveWhistleMinutes(events, currentMinute);
    const markers = extractTimelineMarkers(events, windows);

    const pct = (minute: number) => minuteToPercent(minute, end, windows) * 100;

    const halfTime = pct(whistle.halfTime);
    const fullTime = pct(whistle.fullTime);

    return {
      end,
      playhead: pct(currentMinute),
      segments: [
        { key: 'half1', label: t('chapter.half1'), from: 0, to: halfTime },
        { key: 'half2', label: t('chapter.half2'), from: halfTime, to: fullTime },
        {
          key: 'stoppage',
          label: t('chapter.stoppage'),
          from: fullTime,
          to: 100,
        },
      ],
      goals: markers
        .filter((marker) => marker.type === 'GOAL')
        .map((marker) => ({
          key: marker.key,
          minute: marker.minute,
          label: marker.playerName ?? '',
          isHome: marker.isHome !== false,
          left: pct(marker.minute),
        })),
    };
  }, [events, currentMinute, t]);

  return (
    <GlassPanel className={`p-3 ${className ?? ''}`} data-testid="match-progress-rail">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="font-headline text-kicker uppercase tracking-[0.3em] text-on-surface-variant/70">
          {t('title')}
        </span>
        <span className="font-mono text-label tabular-nums text-on-surface">
          {Math.round((playhead / 100) * end)}&apos;
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={Math.round(end)}
        aria-valuenow={Math.round(currentMinute)}
        aria-label={t('title')}
        className="relative h-2.5 w-full overflow-visible rounded-full bg-surface-container-high"
      >
        {segments.map((segment) => (
          <span
            key={segment.key}
            aria-hidden
            className="absolute inset-y-0 first:rounded-l-full last:rounded-r-full"
            style={{
              left: `${segment.from}%`,
              width: `${Math.max(0, segment.to - segment.from)}%`,
              background:
                segment.key === 'stoppage'
                  ? 'repeating-linear-gradient(45deg, rgba(255,255,255,0.28) 0 2px, transparent 2px 5px)'
                  : segment.key === 'half1'
                    ? 'rgba(255,255,255,0.10)'
                    : 'rgba(255,255,255,0.16)',
            }}
          />
        ))}

        {/* Elapsed fill, drawn under the pips. */}
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 rounded-full bg-primary/70"
          style={{ width: `${playhead}%` }}
        />

        <span
          aria-hidden
          className="absolute -top-1 bottom-[-4px] w-0.5 rounded-full bg-primary"
          style={{ left: `calc(${playhead}% - 1px)` }}
        />

        {goals.map((goal) => (
          <button
            key={goal.key}
            type="button"
            onClick={() => onSelectMinute?.(goal.minute)}
            title={goal.label ? `${goal.minute}' · ${goal.label}` : undefined}
            aria-label={
              goal.label ? `${goal.minute}' — ${goal.label}` : `${goal.minute}'`
            }
            className={`absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface-container transition-transform hover:scale-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
              goal.isHome ? 'bg-primary' : 'bg-on-surface-variant'
            }`}
            style={{ left: `${goal.left}%` }}
          />
        ))}
      </div>

      <div className="mt-1.5 flex justify-between font-headline text-kicker uppercase tracking-widest text-on-surface-variant/50">
        <span>{t('chapter.half1')}</span>
        <span>{t('chapter.half2')}</span>
        <span>{t('chapter.stoppage')}</span>
      </div>
    </GlassPanel>
  );
}
