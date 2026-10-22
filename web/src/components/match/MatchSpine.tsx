'use client';

/**
 * MatchSpine — the report's vertical event spine.
 *
 * Order, not position: every event is a row, grouped into chapters, with the
 * minute in a fixed-width column. Stoppage time is an ordinary row whose
 * label happens to read `45+2'`, so it needs no band, no second fill and no
 * "visual minute" mapping — which is what made the old horizontal track bend
 * its geometry to fit variable injury time.
 */

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { AppIcon } from '@/components/icons/AppIcon';
import { GlassPanel } from '@/components/ui/GlassPanel';
import type { MatchEvent } from '@/lib/api';
import {
  extractTimelineMarkers,
  extractInjuryWindows,
  type TimelineEventType,
  type TimelineMarker,
} from './match-timeline';

export interface MatchSpineProps {
  events: MatchEvent[];
  homeTeamName: string;
  awayTeamName: string;
  /** Minute currently reflected by the pitch snapshot, if any. */
  activeMinute?: number;
  onSelectMinute?: (minute: number) => void;
  className?: string;
}

type Chapter = 'half1' | 'half1Stoppage' | 'half2' | 'stoppage';

const CHAPTER_ORDER: Chapter[] = ['half1', 'half1Stoppage', 'half2', 'stoppage'];

function chapterOf(marker: TimelineMarker): Chapter {
  const { minute, minuteLabel } = marker;
  const inStoppage = minuteLabel.includes('+');
  if (minute < 45 || (minute === 45 && !inStoppage)) {
    return inStoppage ? 'half1Stoppage' : 'half1';
  }
  if (minute < 90) return 'half2';
  return 'stoppage';
}

export function MatchSpine({
  events,
  homeTeamName,
  awayTeamName,
  activeMinute,
  onSelectMinute,
  className,
}: MatchSpineProps) {
  const t = useTranslations('matches.spine');

  const { chapters, finalScore } = useMemo(() => {
    const windows = extractInjuryWindows(events);
    const markers = extractTimelineMarkers(events, windows);

    // Running score, computed without reassignment so the value stays a
    // pure function of `events` (the react-hooks/immutability rule treats a
    // let-counter mutated inside a render-scope `map` as a side effect).
    const scored = markers.reduce<{
      home: number;
      away: number;
      rows: { score: string | null }[];
    }>(
      (acc, marker) => {
        if (marker.type !== 'GOAL') {
          return { ...acc, rows: [...acc.rows, { score: null }] };
        }
        const home = marker.isHome === false ? acc.home : acc.home + 1;
        const away = marker.isHome === false ? acc.away + 1 : acc.away;
        return { home, away, rows: [...acc.rows, { score: `${home}–${away}` }] };
      },
      { home: 0, away: 0, rows: [] },
    );

    const rows = markers.map((marker, index) => ({
      marker,
      chapter: chapterOf(marker),
      score: scored.rows[index]?.score ?? null,
    }));

    const grouped = CHAPTER_ORDER.map((chapter) => ({
      chapter,
      rows: rows.filter((row) => row.chapter === chapter),
    })).filter((group) => group.rows.length > 0);

    return { chapters: grouped, finalScore: `${scored.home}–${scored.away}` };
  }, [events]);

  return (
    <GlassPanel className={`p-4 ${className ?? ''}`} data-testid="match-spine">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="flex items-center gap-2 font-headline text-kicker font-bold uppercase tracking-widest text-primary/80">
          <AppIcon name="history" className="text-base" />
          {t('title')}
        </h3>
        <span className="font-headline text-label tabular-nums text-on-surface-variant">
          {homeTeamName} <span className="text-on-surface">{finalScore}</span>{' '}
          {awayTeamName}
        </span>
      </div>

      {chapters.length === 0 ? (
        <p className="py-6 text-center text-kicker font-headline text-on-surface/30">
          {t('empty')}
        </p>
      ) : (
        <ol className="relative">
          {chapters.map((group) => (
            <li key={group.chapter} className="mb-2 last:mb-0">
              <div className="sticky top-0 z-10 -mx-1 mb-1 bg-surface-container/95 px-1 py-1 backdrop-blur-sm">
                <span className="font-headline text-kicker uppercase tracking-[0.3em] text-on-surface-variant/70">
                  {t(`chapter.${group.chapter}`)}
                </span>
              </div>
              <ul className="border-l-2 border-outline-variant/20 pl-0">
                {group.rows.map(({ marker, score }) => (
                  <SpineRow
                    key={marker.key}
                    marker={marker}
                    score={score}
                    active={activeMinute !== undefined && marker.minute === activeMinute}
                    onSelect={onSelectMinute}
                    label={t(`type.${marker.type}`)}
                  />
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </GlassPanel>
  );
}

function SpineRow({
  marker,
  score,
  active,
  onSelect,
  label,
}: {
  marker: TimelineMarker;
  score: string | null;
  active: boolean;
  onSelect?: (minute: number) => void;
  label: string;
}) {
  const look = NODE_LOOK[marker.type];
  const interactive = onSelect !== undefined;

  const content = (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <span
        className={`grid size-7 shrink-0 place-items-center rounded-full border ${look.ring} ${look.tone}`}
      >
        {look.icon ? (
          <AppIcon name={look.icon} className="text-sm" />
        ) : (
          <span className={`block h-3 w-2 rounded-[1px] ${look.swatch}`} />
        )}
      </span>
      <span className="w-14 shrink-0 text-right font-mono text-label tabular-nums text-on-surface-variant">
        {marker.minuteLabel}&apos;
      </span>
      <span className="shrink-0 font-headline text-label font-bold text-on-surface">
        {label}
      </span>
      <span className="truncate text-label text-on-surface-variant">
        {marker.playerName ?? ''}
      </span>
    </span>
  );

  return (
    <li>
      <div
        className={`flex h-11 items-center gap-1 rounded-md px-1 transition-colors ${
          active ? 'bg-primary/10' : 'hover:bg-surface-container/40'
        }`}
      >
        {interactive ? (
          <button
            type="button"
            onClick={() => onSelect?.(marker.minute)}
            className="flex min-w-0 flex-1 items-center text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            aria-current={active ? 'true' : undefined}
          >
            {content}
          </button>
        ) : (
          content
        )}
        <span className="w-10 shrink-0 text-right font-headline text-kicker tabular-nums text-on-surface">
          {score ?? ''}
        </span>
      </div>
    </li>
  );
}

interface NodeLook {
  ring: string;
  tone: string;
  swatch?: string;
  icon?: 'sports_soccer' | 'swap_horiz' | 'add';
}

const NODE_LOOK: Record<TimelineEventType, NodeLook> = {
  GOAL: {
    ring: 'border-primary bg-primary',
    tone: 'text-on-primary',
    icon: 'sports_soccer',
  },
  SUBSTITUTION: {
    ring: 'border-outline-variant/50 bg-surface-container-high',
    tone: 'text-on-surface-variant',
    icon: 'swap_horiz',
  },
  YELLOW_CARD: {
    ring: 'border-signal-amber/50 bg-surface-container-high',
    tone: 'text-signal-amber',
    swatch: 'bg-signal-amber',
  },
  SECOND_YELLOW: {
    ring: 'border-signal-amber/50 bg-surface-container-high',
    tone: 'text-signal-amber',
    swatch: 'bg-signal-amber',
  },
  RED_CARD: {
    ring: 'border-error/50 bg-surface-container-high',
    tone: 'text-error',
    swatch: 'bg-error',
  },
  INJURY: {
    ring: 'border-outline-variant/50 bg-surface-container-high',
    tone: 'text-on-surface-variant',
    icon: 'add',
  },
};
