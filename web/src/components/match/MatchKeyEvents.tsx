/**
 * MatchKeyEvents — a chronological list of the match's biggest moments
 * (goals, cards, substitutions, injuries). Redesigned as a vertical
 * list of side-tinted rows: a small minute badge on the left uses
 * the team's color (home = primary, away = secondary) so the user
 * can scan who did what without reading the names. Each row also
 * carries the event type icon and the player name, with an optional
 * sub-label (e.g. assist / second yellow / player out).
 *
 * Rendering order: chronological (earliest first), matching the
 * page-level commentary feed. The previous reverse-chronological
 * order was a "highlight reel" choice that hid every event past
 * the most recent 8 via slice(-MAX_EVENTS) — a reader looking at
 * a 5-goal match only saw the last 3 with no way to see the rest.
 * Now every key event renders, and the panel is internally
 * scrollable (max-h + overflow-y-auto) so it works whether the
 * caller wraps it in a height-bounded container or not.
 */
'use client';

import React from 'react';
import { clsx } from 'clsx';
import type { MatchEvent } from '@/lib/api';
import { extractKeyEvents } from './extract-key-events';

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

// Fallback cap. The panel is internally scrollable now, so this
// only kicks in as a defensive ceiling when callers forget to wrap
// the panel in a height-bounded container. Set high enough that no
// real match would hit it (10 events is already an unusually busy
// match); the rendered cap means the page can't paint an
// unbounded vertical column if the scrollable container is missing.
const HARD_MAX_EVENTS = 200;
const HOME_FALLBACK = '#00e479';
const AWAY_FALLBACK = '#ffdb9d';

export function MatchKeyEvents({
  events,
  rosterById,
  currentMinute,
  homeTeamId,
  awayTeamId,
}: MatchKeyEventsProps) {
  // Chronological, earliest first. The list is intentionally not
  // sliced — readers want to see every key event, not a curated
  // "highlight reel" of the last 8. The container below is
  // internally scrollable so a 6-goal match with 4 cards on top
  // doesn't push the rest of the sidebar off-screen.
  const entries = extractKeyEvents(events, rosterById, homeTeamId, awayTeamId)
    .sort(
      (a, b) =>
        a.minute - b.minute || a.label.localeCompare(b.label),
    )
    .slice(0, HARD_MAX_EVENTS);

  if (entries.length === 0) return null;

  return (
    // `max-h + overflow-y-auto` on the root so the panel is
    // self-sufficient — both `MatchPitchSidebar` and
    // `TacticalMatchDetail` wrap this in a `glass-panel`, and
    // either wrapper may or may not be height-bounded depending
    // on the layout. The internal scroll means the panel degrades
    // gracefully when the caller forgets.
    <div className="flex flex-col gap-1.5 pointer-events-none max-w-[200px] max-h-[420px] overflow-y-auto pr-1">
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
              {/* D-style SVG icon (replaces the previous emoji). The
                  component carries its own palette; the size prop is
                  locked to 14 to match the ticker-strip so the two
                  surfaces read at the same visual weight. */}
              <span className="shrink-0 inline-flex">
                <entry.icon size={14} />
              </span>
              <div className="flex-1 min-w-0">
                <p
                  className="font-headline font-bold text-[10px] text-white/90 truncate leading-tight"
                  title={entry.label}
                >
                  {entry.label}
                </p>
                {(entry.sublabel || entry.specialtyChip) && (
                  <p className="font-label text-[8px] text-white/40 uppercase tracking-wider truncate leading-tight mt-0.5 flex items-center gap-1">
                    {entry.sublabel}
                    {entry.specialtyChip && (
                      // RFC 0003 — Specialty chip. Tier-tinted
                      // glyph + the localized bonus text
                      // ("+14% 效果"). Picked tier color matches
                      // `SpecialtyIcon.tsx`'s `TIER_TEXT` map so
                      // the chip reads as the same specialty
                      // chip the user sees on the player card.
                      <span
                        className={clsx(
                          'inline-flex items-center gap-0.5 px-1 rounded-sm border',
                          entry.specialtyChip.tier === 'GOLD' &&
                            'text-amber-300 border-amber-300/30 bg-amber-300/10',
                          entry.specialtyChip.tier === 'SILVER' &&
                            'text-slate-300 border-slate-300/30 bg-slate-300/10',
                          entry.specialtyChip.tier === 'BRONZE' &&
                            'text-stone-400 border-stone-400/30 bg-stone-400/10',
                        )}
                        title={`${entry.specialtyChip.label} (${entry.specialtyChip.tier})`}
                      >
                        <span className="text-[7px]">{entry.specialtyChip.label}</span>
                        <span className="text-[8px] font-mono font-bold">{entry.specialtyChip.bonusText}</span>
                      </span>
                    )}
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
