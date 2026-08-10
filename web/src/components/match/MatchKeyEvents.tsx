/**
 * MatchKeyEvents — a chronological list of the match's biggest moments
 * (goals, cards, substitutions). Redesigned as a vertical list of
 * side-tinted rows: a small minute badge on the left uses the
 * team's color (home = primary, away = secondary) so the user can
 * scan who did what without reading the names. Each row also carries
 * the event type icon and the player name, with an optional sub-label
 * (e.g. assist / second yellow / player out).
 */
'use client';

import React from 'react';
import { clsx } from 'clsx';
import type { MatchEvent } from '@/lib/api';
import { resolveSide, type EventSide } from './match-event-side';

interface MatchKeyEventsProps {
  events: MatchEvent[];
  /** Roster map for name resolution */
  rosterById: Map<string, { name: string }>;
  /** Minute to highlight as "current" */
  currentMinute?: number;
  /**
   * Home / away team ids. The simulator payload only ships `teamId`
   * on each event (no `isHome` flag), so we derive the side from
   * `event.teamId` comparison. Without these, every team-attributed
   * event is misread as away.
   */
  homeTeamId?: string | null;
  awayTeamId?: string | null;
}

type EventEntry = {
  minute: number;
  icon: string;
  label: string;
  sublabel?: string;
  /** Always 'home' or 'away' — neutral events (KICKOFF, etc.) aren't goals/cards/subs so
   *  they never reach this list, so the union is tighter than `EventSide`. */
  side: 'home' | 'away';
};

function extractKeyEvents(
  events: MatchEvent[],
  homeTeamId?: string | null,
  awayTeamId?: string | null,
): EventEntry[] {
  const GOAL_TYPES = ['goal', 'own_goal'];
  const CARD_TYPES = ['yellow_card', 'second_yellow', 'red_card'];
  const SUB_TYPES = ['substitution'];
  const entries: EventEntry[] = [];

  for (const ev of events) {
    const type = ev.typeName?.toLowerCase() ?? '';
    // Side derivation lives in `resolveSide` (see match-event-side.ts) so
    // the same rule is shared with the commentary feed's `EventBubble`.
    // Neutral events can't be GOAL / CARD / SUB so we never reach the
    // entries.push with `side: 'neutral'` below, but we narrow the type
    // here anyway to keep the row tinting strict.
    const resolved: EventSide = resolveSide(ev, homeTeamId, awayTeamId);
    const side: 'home' | 'away' = resolved === 'away' ? 'away' : 'home';

    if (GOAL_TYPES.includes(type)) {
      const scorer = ev.data?.playerName ?? ev.playerId?.slice(0, 6) ?? '?';
      const assist = ev.data?.assistName;
      entries.push({
        minute: ev.minute,
        icon: '⚽',
        label: scorer + (assist ? `  ·  A: ${assist}` : ''),
        sublabel: type === 'own_goal' ? 'OG' : undefined,
        side,
      });
    } else if (CARD_TYPES.includes(type)) {
      const player = ev.data?.playerName ?? ev.playerId?.slice(0, 6) ?? '?';
      const cardType =
        type === 'second_yellow' ? '2nd Yellow' : type === 'red_card' ? 'Red' : 'Yellow';
      entries.push({
        minute: ev.minute,
        icon: type === 'red_card' ? '🟥' : '🟨',
        label: player,
        sublabel: cardType,
        side,
      });
    } else if (SUB_TYPES.includes(type)) {
      const playerIn =
        ev.data?.substitutePlayerName ?? ev.data?.playerIn ?? ev.playerId?.slice(0, 6) ?? '?';
      const playerOut = ev.data?.playerOut ?? '?';
      entries.push({
        minute: ev.minute,
        icon: '⇄',
        label: playerIn,
        sublabel: `↔ ${playerOut}`,
        side,
      });
    }
  }

  return entries;
}

const MAX_EVENTS = 8;
const HOME_FALLBACK = '#00e479';
const AWAY_FALLBACK = '#ffdb9d';

export function MatchKeyEvents({
  events,
  currentMinute,
  homeTeamId,
  awayTeamId,
}: MatchKeyEventsProps) {
  // Reverse-chronological (most recent first) is the conventional
  // match-report ordering, so the user sees the dramatic ending at
  // the top. The page-level commentary feed is chronological; this
  // panel is the highlight reel and gets the opposite order.
  const entries = extractKeyEvents(events, homeTeamId, awayTeamId)
    .slice(-MAX_EVENTS)
    .reverse();

  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 pointer-events-none max-w-[200px]">
      {entries.map((entry, i) => {
        const color = entry.side === 'home' ? HOME_FALLBACK : AWAY_FALLBACK;
        return (
          <div
            key={i}
            className="flex items-stretch gap-1.5 rounded-md overflow-hidden border border-white/5"
          >
            {/* Minute badge — side-tinted so the team attribution
                reads at a glance, even before the user sees the name. */}
            <div
              className="flex flex-col items-center justify-center w-9 shrink-0"
              style={{ backgroundColor: `${color}22` }}
            >
              <span
                className={clsx(
                  'font-mono font-black tabular-nums text-[11px] leading-none',
                  entry.minute === currentMinute ? '' : 'opacity-90',
                )}
                style={{ color }}
              >
                {entry.minute}
              </span>
              <span className="font-mono text-[7px] opacity-60 leading-none" style={{ color }}>
                &apos;
              </span>
            </div>

            {/* Event body — transparent background (matches the
                pre-redesign inline key events so the player name
                sits on the panel's own background rather than a
                tinted block). */}
            <div className="flex-1 min-w-0 flex items-center gap-1.5 px-1.5 py-1">
              <span className="text-[11px] leading-none shrink-0">{entry.icon}</span>
              <div className="flex-1 min-w-0">
                <p
                  className="font-headline font-bold text-[10px] text-white/90 truncate leading-tight"
                  title={entry.label}
                >
                  {entry.label}
                </p>
                {entry.sublabel && (
                  <p className="font-label text-[8px] text-white/40 uppercase tracking-wider truncate leading-tight mt-0.5">
                    {entry.sublabel}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
