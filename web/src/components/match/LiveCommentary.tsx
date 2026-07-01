'use client';

import { useTranslations } from 'next-intl';
import type { MatchEvent } from '@/lib/api';
import { canonicalEventType, formatEventCommentary } from '@/lib/commentary';

interface LiveCommentaryProps {
  events: MatchEvent[];
  currentMinute: number;
  homeTeamName: string;
  awayTeamName: string;
}

function EventIcon({ type }: { type: string }) {
  const t = type.toUpperCase();
  if (t === 'GOAL') return <span className="text-primary text-sm">⚽</span>;
  if (t === 'YELLOW_CARD' || t === 'SECOND_YELLOW') return <span className="text-yellow-400 text-sm">🟨</span>;
  if (t === 'RED_CARD') return <span className="text-red-400 text-sm">🟥</span>;
  if (t === 'SUBSTITUTION') return <span className="text-blue-400 text-sm">🔄</span>;
  if (t === 'INJURY') return <span className="text-orange-400 text-sm">🏥</span>;
  if (t === 'PENALTY' || t === 'PENALTY_MISS') return <span className="text-purple-400 text-sm">🎯</span>;
  if (t === 'VAR_DECISION') return <span className="text-cyan-400 text-sm">📺</span>;
  if (t === 'WEATHER_ANNOUNCEMENT') return <span className="text-blue-300 text-sm">🌤️</span>;
  if (t === 'PLAYER_INTRODUCTION') return <span className="text-green-400 text-sm">👥</span>;
  if (t === 'HALF_TIME' || t === 'FULL_TIME') return <span className="text-on-surface-variant text-sm">⏹</span>;
  if (t === 'KICKOFF' || t === 'SECOND_HALF_START') return <span className="text-on-surface-variant text-sm">▶</span>;
  return <span className="text-on-surface-variant text-sm">•</span>;
}

export function LiveCommentary({ events, currentMinute, homeTeamName, awayTeamName }: LiveCommentaryProps) {
  const t = useTranslations();

  // Sort: newest first (higher minute = newer)
  const sorted = [...events].sort((a, b) => b.minute - a.minute);

  // Filter out SNAPSHOT — resolve the type via the same alias map the
  // formatter uses, so simulator strings that the formatter normalizes
  // (e.g. raw `match_start` -> canonical `KICKOFF`) are filtered consistently.
  const filtered = sorted.filter(
    (e) => canonicalEventType(e.typeName ?? e.type) !== 'SNAPSHOT',
  );

  return (
    <div className="rounded-DEFAULT border border-surface-container-high bg-surface-container-low overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-container-high">
        <h3 className="font-headline font-bold text-xs uppercase tracking-widest text-primary flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          Live Commentary
        </h3>
        <div className="flex items-center gap-1.5">
          <span className="font-mono font-black text-sm text-primary">
            {currentMinute}&apos;
          </span>
          <span className="text-[9px] font-bold uppercase tracking-widest text-error/80 font-headline animate-pulse">
            LIVE
          </span>
        </div>
      </div>

      {/* Event List */}
      <div className="max-h-[360px] overflow-y-auto px-4 py-3 space-y-1">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-on-surface-variant text-sm font-headline">
            Waiting for events...
          </div>
        ) : (
          filtered.map((event, idx) => {
            const type = canonicalEventType(event.typeName ?? event.type);
            const isLatest = idx === 0;
            const text = formatEventCommentary(event, homeTeamName, awayTeamName, t);
            if (!text) return null;

            return (
              <div
                key={event.id || `${event.minute}-${idx}`}
                className={`flex items-start gap-3 px-3 py-2.5 rounded-xl transition-all ${
                  isLatest
                    ? 'bg-surface-container border border-primary/20'
                    : 'hover:bg-surface-container'
                }`}
              >
                <div className="shrink-0 mt-0.5">
                  <EventIcon type={type} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs leading-relaxed ${isLatest ? 'text-on-surface font-medium' : 'text-on-surface-variant'}`}>
                    {text}
                  </p>
                </div>
                <span className={`shrink-0 font-mono font-black text-[11px] ${isLatest ? 'text-primary' : 'text-on-surface-variant'}`}>
                  {event.minute}&apos;
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
