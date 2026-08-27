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
import { TickerStrip } from './ticker-strip';
import { EventBubble } from './event-bubble';
import {
  derivePeriodForMinute,
  formatMatchMinute,
  phaseOfEvent,
  useInjuryWindows,
} from './match-timeline';

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

  // 1. Build the feed: drop only SNAPSHOT events. Goals, subs and
  //    cards used to be redirected to a separate "spotlight" card so
  //    the feed didn't double up; per design feedback the user wants
  //    every non-snapshot event in the chronological feed, so we
  //    keep them all here. The spotlight component was deleted with
  //    D5 (it was being mounted into a `<div hidden>` no-op) so the
  //    feed is the single source of truth.
  const feedEvents = useMemo(
    () =>
      events.filter((e) => {
        const type = canonicalEventType(e.typeName ?? e.type);
        if (type === 'SNAPSHOT') return false;
        return true;
      }),
    [events],
  );

  // 3. Chronological feed. Side is no longer encoded by left/right
  //    placement — the chat-column split has been retired so every
  //    event sits in the same column from the left, and the
  //    home/away/neutral distinction is colour-only (see EventBubble).
  //    Sorted oldest-first so the feed reads top-to-bottom as a real
  //    match transcript: kickoff at the top, full-time at the bottom.
  //
  //    Sort key is (phase, minute, second), NOT just (minute, second).
  //    The engine emits the 2H kickoff at engine minute 46 and the
  //    1H whistle at engine minute 45+N1 — but the raw `(minute,
  //    second)` order puts the 2H kickoff BEFORE the 1H whistle in
  //    the list (because 46 < 50), even though the kickoff happens
  //    after the whistle in real time. Without the phase sort key,
  //    the feed renders "46' 下半场开始" *above* "45+5' 半场结束"
  //    — a time paradox the user can't read past.
  //    `phaseOfEvent` returns 0 for 1H events, 1 for 2H, etc.,
  //    so all 1H events (regardless of engine minute) sort above
  //    all 2H events. Within a phase, the engine minute + second
  //    tie-break preserves the engine's emit order.
  const sortedFeed = useMemo(
    () =>
      [...feedEvents].sort((a, b) => {
        const phaseA = phaseOfEvent(a, events);
        const phaseB = phaseOfEvent(b, events);
        return (
          phaseA - phaseB ||
          a.minute - b.minute ||
          (a.second ?? 0) - (b.second ?? 0)
        );
      }),
    [feedEvents, events],
  );

  // Stoppage windows — derived once here and passed to every
  // consumer that needs a player-facing minute label (TickerStrip,
  // EventBubble, the LIVE header). `currentMinute` is the wire
  // value (stoppage-inclusive when the match is in injury time),
  // so the helper turns e.g. 50 into "45+5" if the 1H+5 stoppage
  // is still active at the live cursor. No-op when no half_time /
  // full_time events have been emitted yet.
  const injuryWindows = useInjuryWindows(events);
  // Live cursor's current period. The engine emits the 2H kickoff
  // at engine minute 46 (same wire value as the first 1H stoppage
  // minute), so a naive `formatMatchMinute(currentMinute, ...)` on
  // the header turns a 2H kickoff live cursor into "45+1'" — a
  // 2H moment renders as 1H stoppage, ahead of the "45+5'" 1H
  // whistle in the feed. `derivePeriodForMinute` recovers the
  // real period from the events list.
  const currentPeriod = useMemo(
    () => derivePeriodForMinute(events, currentMinute),
    [events, currentMinute],
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
            {formatMatchMinute(currentMinute, injuryWindows, currentPeriod)}&apos;
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
        injuryWindows={injuryWindows}
      />

      {/* 2. Feed — single left-aligned chronological column. Home / away /
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
                injuryWindows={injuryWindows}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
