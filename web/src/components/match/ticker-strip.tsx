/**
 * ticker-strip.tsx — horizontal live ticker for the top of the live page.
 *
 * Pure-CSS marquee: duplicated content, animation moves the track left.
 * Hover pauses; the latest N events get a brighter tint so the eye lands
 * on "what just happened" before the rest scrolls past.
 *
 * Layout:
 *   [event] [event] [event] · · · [event] [event] [event]
 *                 ◀ —— auto-scrolls left
 *
 * The 4 most recent events render with a primary border + a brighter
 * foreground; older ones fade to on-surface-variant.
 */
'use client';

import React, { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { MatchEvent } from '@/lib/api';
import { canonicalEventType, formatEventCommentary } from '@/lib/commentary';
import { eventIcon } from './commentary-icons';
import { formatMatchMinute, type InjuryWindow } from './match-timeline';

export interface TickerStripProps {
  events: MatchEvent[];
  homeTeamName: string;
  awayTeamName: string;
  /** Cap how many events make it onto the strip — too many and the
   *  scroll speed gets unusable. Default 24. */
  maxItems?: number;
  /** Stoppage windows derived from the same `events` list. Used to
   *  format the minute column with the "+N" suffix for events in
   *  1H / 2H / ET stoppage time. Optional for backwards-compat;
   *  the strip falls back to the raw minute when this is missing. */
  injuryWindows?: InjuryWindow[];
}

interface TickerChunkProps {
  items: MatchEvent[];
  formatText: (e: MatchEvent) => string;
  /** Player-facing minute label resolver — same signature as
   *  `formatMatchMinute` so the parent can pre-bind the windows
   *  once and pass the closure down. */
  formatMinute: (m: number) => string;
}

// Defined at module scope so its identity is stable across renders —
// declaring components inside the function body trips the
// react-hooks/static-components lint rule and also resets state per
// render.
const TickerChunk: React.FC<TickerChunkProps> = ({ items, formatText, formatMinute }) => (
  <>
    {items.map((e, i) => {
      const type = canonicalEventType(e.typeName ?? e.type);
      const Icon = eventIcon(type);
      const isHome = e.isHome;
      const isFresh = i < 4;
      return (
        <div
          key={`${e.id ?? i}-${i}`}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full border whitespace-nowrap shrink-0 ${
            isFresh
              ? 'border-outline/30 bg-surface-container text-on-surface'
              : 'border-transparent bg-surface-container-low/60 text-on-surface-variant'
          } ${isHome ? 'border-l-2 border-l-home' : !e.teamId ? '' : 'border-l-2 border-l-away'}`}
        >
          <span className={`shrink-0 ${isFresh ? 'text-primary' : ''}`}>
            {React.createElement(Icon, { size: 14 })}
          </span>
          <span className="font-mono text-[11px] font-bold tabular-nums text-primary/90">
            {formatMinute(e.minute)}&apos;
          </span>
          <span className="text-xs leading-none">{formatText(e)}</span>
        </div>
      );
    })}
  </>
);

export const TickerStrip: React.FC<TickerStripProps> = ({
  events,
  homeTeamName,
  awayTeamName,
  maxItems = 24,
  injuryWindows,
}) => {
  const tChrome = useTranslations('matches.live');
  const t = useTranslations('commentary');

  const items = useMemo(() => {
    return events
      .filter((e) => canonicalEventType(e.typeName ?? e.type) !== 'SNAPSHOT')
      .slice(0, maxItems);
  }, [events, maxItems]);

  const formatText = React.useCallback(
    (e: MatchEvent) => formatEventCommentary(e, homeTeamName, awayTeamName, t) ?? '',
    [homeTeamName, awayTeamName, t],
  );

  // `formatMinute` is pre-bound with the injury windows so each
  // TickerChunk call site only carries the resolver closure (vs
  // re-passing the windows array down the tree). Falls back to a
  // passthrough resolver when the parent didn't supply windows
  // — same default the helper itself uses internally.
  const formatMinute = React.useCallback(
    (m: number) => formatMatchMinute(m, injuryWindows ?? []),
    [injuryWindows],
  );

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-surface-container-high bg-surface-container-lowest/60 px-4 py-2.5 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-on-surface-variant/40 animate-pulse" />
        <span className="text-xs font-headline uppercase tracking-widest text-on-surface-variant">
          {tChrome('waiting')}
        </span>
      </div>
    );
  }

  return (
    <div
      className="group relative overflow-hidden rounded-2xl border border-surface-container-high bg-surface-container-lowest/70"
      role="marquee"
      aria-label={tChrome('commentary')}
    >
      {/* gradient masks on both ends to fade in/out */}
      <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-10 bg-gradient-to-r from-surface-container-lowest to-transparent z-10" />
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-surface-container-lowest to-transparent z-10" />

      <div className="ticker-track flex items-center gap-2 py-2 px-2 w-max group-hover:[animation-play-state:paused]">
        <TickerChunk items={items} formatText={formatText} formatMinute={formatMinute} />
        {/* duplicate for seamless loop */}
        <TickerChunk items={items} formatText={formatText} formatMinute={formatMinute} />
      </div>

      <style jsx>{`
        @keyframes ticker-scroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        .ticker-track {
          animation: ticker-scroll 60s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .ticker-track { animation: none; }
        }
      `}</style>
    </div>
  );
};
