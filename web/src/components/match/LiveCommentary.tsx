/**
 * LiveCommentary — full-bleed live event panel.
 *
 * Three vertically stacked sections:
 *   1. TickerStrip           — horizontal marquee of all events
 *   2. GoalSpotlight         — centre-stage card for the latest big event
 *   3. Event feed (single)   — chronologically ordered list, all left-aligned.
 *                              Home / away / neutral events are interleaved
 *                              by time and distinguished only by colour
 *                              (primary / secondary / muted), so the feed
 *                              reads top-to-bottom as a transcript.
 *
 * Big events (goal / red card / sub / period transitions) deliberately
 * only render in the spotlight; the feed is reserved for the lower-impact
 * events (shots, misses, fouls, corners, saves, kicks, meta). This stops
 * the feed from duplicating what the spotlight already shows.
 */
'use client';

import React, { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { MatchEvent } from '@/lib/api';
import { canonicalEventType } from '@/lib/commentary';
import { isSpotlightEvent } from './commentary-icons';
import { TickerStrip } from './ticker-strip';
import { GoalSpotlight } from './goal-spotlight';
import { EventBubble } from './event-bubble';

export interface LiveCommentaryProps {
  events: MatchEvent[];
  currentMinute: number;
  homeTeamName: string;
  awayTeamName: string;
  /**
   * The home/away team ids. Required to colour each event correctly —
   * the simulator only sends `teamId` on each event (no `isHome` flag),
   * so without these every team-attributed event defaults to the away
   * colour. Optional for backwards-compat; when missing, the bubble
   * falls back to the old (broken) behaviour.
   */
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeColor?: string | null;
  awayColor?: string | null;
  homeScore: number;
  awayScore: number;
  /**
   * - 'live' (default): a match in progress. Header shows a pulsing red
   *   "LIVE" tag with the current minute.
   * - 'replay': a completed match played back. Header shows a non-pulsing
   *   "FT" tag — the panel is the same component but the chrome makes it
   *   clear the user is scrubbing history, not watching live action.
   */
  mode?: 'live' | 'replay';
}

export function LiveCommentary({
  events,
  currentMinute,
  homeTeamName,
  awayTeamName,
  homeTeamId,
  awayTeamId,
  homeColor,
  awayColor,
  homeScore,
  awayScore,
  mode = 'live',
}: LiveCommentaryProps) {
  const tChrome = useTranslations('matches.live');

  // 1. Find the most recent spotlight-worthy event.
  const spotlightEvent = useMemo<MatchEvent | null>(() => {
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      const type = canonicalEventType(e.typeName ?? e.type);
      if (isSpotlightEvent(type)) return e;
    }
    return null;
  }, [events]);

  // 2. Build the feed: drop only SNAPSHOT events. Goals, subs and
  //    cards used to be redirected to the spotlight card so the feed
  //    didn't double up; per design feedback the user wants every
  //    non-snapshot event in the chronological feed, so we keep
  //    them all here. The spotlight is now hidden (not deleted) so
  //    the DOM still has it for re-enable later.
  const feedEvents = useMemo(
    () =>
      events.filter((e) => {
        const type = canonicalEventType(e.typeName ?? e.type);
        if (type === 'SNAPSHOT') return false;
        return true;
      }),
    [events],
  );

  // 3. Single chronologically-ordered feed. Side is no longer encoded by
  //    left/right placement — the chat-column split has been retired so
  //    every event sits in the same column from the left, and the
  //    home/away/neutral distinction is colour-only (see EventBubble).
  //    Sorted newest-first so the most recent action is at the top, like
  //    a real-time match feed.
  const sortedFeed = useMemo(
    () =>
      [...feedEvents].sort(
        (a, b) => b.minute - a.minute || (b.second ?? 0) - (a.second ?? 0),
      ),
    [feedEvents],
  );

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h3 className="font-headline font-black text-xs uppercase tracking-widest text-primary flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${
              mode === 'live'
                ? 'bg-error animate-pulse'
                : 'bg-on-surface-variant/50'
            }`}
          />
          {tChrome('commentary')}
        </h3>
        <div className="flex items-center gap-1.5">
          <span className="font-mono font-black text-sm tabular-nums text-primary">
            {currentMinute}&apos;
          </span>
          {mode === 'live' ? (
            <span className="text-[9px] font-bold uppercase tracking-widest text-error/80 font-headline animate-pulse">
              {tChrome('liveTag')}
            </span>
          ) : (
            <span className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant/70 font-headline">
              {tChrome('replayTag')}
            </span>
          )}
        </div>
      </div>

      {/* 1. Ticker — horizontal marquee of all events */}
      <TickerStrip
        events={events}
        homeTeamName={homeTeamName}
        awayTeamName={awayTeamName}
      />

      {/* 2. Spotlight — hidden per design feedback (the feed now shows
             goals / subs / cards inline so the user gets a single
             chronological transcript). Kept in the tree (not removed)
             so we can re-enable it by deleting the `hidden` class
             without re-deriving the layout. */}
      <div hidden>
        <GoalSpotlight
          event={spotlightEvent}
          homeTeamName={homeTeamName}
          awayTeamName={awayTeamName}
          homeScore={homeScore}
          awayScore={awayScore}
          homeColor={homeColor}
          awayColor={awayColor}
          currentMinute={currentMinute}
        />
      </div>

      {/* 3. Feed — single left-aligned chronological column. Home / away /
             neutral events are interleaved by time; side is conveyed by
             colour (primary / secondary / muted) on the EventBubble. */}
      <div className="rounded-2xl border border-surface-container-high bg-surface-container-lowest/40 overflow-hidden">
        <div className="max-h-[480px] overflow-y-auto px-3 py-2">
          {sortedFeed.length === 0 ? (
            <p className="text-center text-on-surface-variant text-xs py-6 font-headline uppercase tracking-widest">
              {tChrome('waiting')}
            </p>
          ) : (
            sortedFeed.map((e) => (
              <EventBubble
                key={e.id ?? `${e.minute}-${e.second ?? 0}`}
                event={e}
                homeTeamName={homeTeamName}
                awayTeamName={awayTeamName}
                homeTeamId={homeTeamId}
                awayTeamId={awayTeamId}
                homeColor={homeColor}
                awayColor={awayColor}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
