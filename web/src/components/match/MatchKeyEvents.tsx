'use client';

import React from 'react';
import type { MatchEvent } from '@/lib/api';

interface MatchKeyEventsProps {
  events: MatchEvent[];
  /** Roster map for name resolution */
  rosterById: Map<string, { name: string }>;
  /** Minute to highlight as "current" */
  currentMinute?: number;
}

type EventEntry = {
  minute: number;
  icon: string;
  label: string;
  sublabel?: string;
  side: 'home' | 'away';
};

function extractKeyEvents(events: MatchEvent[]): EventEntry[] {
  const GOAL_TYPES = ['goal', 'own_goal'];
  const CARD_TYPES = ['yellow_card', 'second_yellow', 'red_card'];
  const SUB_TYPES = ['substitution'];
  const entries: EventEntry[] = [];

  for (const ev of events) {
    const type = ev.typeName?.toLowerCase() ?? '';
    const isHome = ev.isHome ?? true;

    if (GOAL_TYPES.includes(type)) {
      const scorer = ev.data?.playerName ?? ev.playerId?.slice(0, 6) ?? '?';
      const assist = ev.data?.assistName;
      entries.push({
        minute: ev.minute,
        icon: '⚽',
        label: scorer + (assist ? ` (A: ${assist})` : ''),
        sublabel: type === 'own_goal' ? 'OG' : undefined,
        side: isHome ? 'home' : 'away',
      });
    } else if (CARD_TYPES.includes(type)) {
      const player = ev.data?.playerName ?? ev.playerId?.slice(0, 6) ?? '?';
      const cardType = type === 'second_yellow' ? '2nd Y' : type === 'red_card' ? 'RED' : 'YELLOW';
      entries.push({
        minute: ev.minute,
        icon: type === 'red_card' ? '🟥' : '🟨',
        label: player,
        sublabel: cardType,
        side: isHome ? 'home' : 'away',
      });
    } else if (SUB_TYPES.includes(type)) {
      const playerIn = ev.data?.substitutePlayerName ?? ev.data?.playerIn ?? ev.playerId?.slice(0, 6) ?? '?';
      const playerOut = ev.data?.playerOut ?? '?';
      entries.push({
        minute: ev.minute,
        icon: '🔄',
        label: `${playerIn}`,
        sublabel: `↔ ${playerOut}`,
        side: isHome ? 'home' : 'away',
      });
    }
  }

  return entries;
}

const MAX_EVENTS = 8;

export function MatchKeyEvents({ events, currentMinute }: MatchKeyEventsProps) {
  const entries = extractKeyEvents(events).slice(-MAX_EVENTS);

  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 pointer-events-none max-w-[180px]">
      {entries.map((entry, i) => (
        <div
          key={i}
          className="flex items-center gap-2 px-2 py-1 rounded-md bg-black/40 backdrop-blur-sm border border-white/5"
        >
          {/* Minute badge */}
          <span
            className={`font-headline font-black tabular-nums text-[9px] min-w-[28px] text-left ${
              entry.minute === currentMinute ? 'text-emerald-400' : 'text-white/40'
            }`}
          >
          {entry.minute}&apos;
          </span>

          {/* Icon */}
          <span className="text-[10px] leading-none">{entry.icon}</span>

          {/* Labels */}
          <div className="flex flex-col min-w-0">
            <span
              className="font-headline font-bold text-[10px] text-white/80 truncate leading-tight"
              title={entry.label}
            >
              {entry.label}
            </span>
            {entry.sublabel && (
              <span className="font-label text-[8px] text-white/30 uppercase tracking-wide truncate leading-tight">
                {entry.sublabel}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
