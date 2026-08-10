/**
 * MatchPitchSidebar — right-rail container for the live match page.
 *
 * Delegates event-derivation to `match-sidebar-data` so the rule for
 * "what counts as a key event / where do we get weather from" lives
 * in one place (shared with `TacticalMatchDetail`).
 */

'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import type { MatchEvent } from '@/lib/api';
import { extractSidebarData, type MatchSidebarData } from './match-sidebar-data';
import { MatchInfoPanel } from './MatchInfoPanel';
import { MatchKeyEvents } from './MatchKeyEvents';

export type { MatchSidebarData } from './match-sidebar-data';
export { extractSidebarData } from './match-sidebar-data';

// ── Sidebar component ─────────────────────────────────────────────────────────

interface MatchPitchSidebarProps {
  /** Events from REST (report) or WS (live). */
  events: MatchEvent[];
  /** Current minute, used to highlight the active event in key events. */
  currentMinute?: number;
  /** Stadium name (from match.venue). */
  stadium?: string;
  /** Attendance number (from match.attendance). */
  attendance?: number;
  /**
   * Home / away team ids. The simulator payload only ships `teamId`
   * on each event (no `isHome` flag), so the key events panel
   * compares `event.teamId` to these to attribute the side. Without
   * them, every team-attributed event defaults to the away color.
   */
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  /** Roster map for name resolution (forwarded to MatchKeyEvents). */
  rosterById?: Map<string, { name: string }>;
}

export function MatchPitchSidebar({
  events,
  currentMinute,
  stadium,
  attendance,
  homeTeamId,
  awayTeamId,
  rosterById,
}: MatchPitchSidebarProps) {
  const t = useTranslations('matches.live');

  const { weather, attendance: extractedAttendance, keyEvents } = extractSidebarData(events);

  const hasWeatherOrAttendance = weather !== null || attendance !== null || extractedAttendance !== null;

  if (!hasWeatherOrAttendance && keyEvents.length === 0) {
    return (
      <div className="glass-panel rounded-2xl p-4">
        <h3 className="font-headline font-bold text-[10px] uppercase tracking-widest text-primary/80 mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-base">history</span>
          {t('keyEvents') ?? 'Key Events'}
        </h3>
        <p className="text-[10px] text-white/30 font-headline italic">
          {t('waiting') ?? 'Waiting for events…'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="pitch-sidebar">
      {/* Weather + Attendance info */}
      {hasWeatherOrAttendance && (
        <div className="glass-panel rounded-2xl p-4 shrink-0">
          <h3 className="font-headline font-bold text-[10px] uppercase tracking-widest text-primary/80 mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-base">stadium</span>
            {t('matchInfo') ?? 'Match Info'}
          </h3>
          <MatchInfoPanel
            stadium={stadium ?? undefined}
            weather={weather ?? undefined}
            attendance={attendance ?? extractedAttendance ?? undefined}
          />
        </div>
      )}

      {/* Key Events */}
      {keyEvents.length > 0 && (
        <div className="glass-panel rounded-2xl p-4 flex flex-col max-h-56 overflow-y-auto">
          <h3 className="font-headline font-bold text-[10px] uppercase tracking-widest text-primary/80 mb-3 flex items-center gap-2 shrink-0">
            <span className="material-symbols-outlined text-base">history</span>
            {t('keyEvents') ?? 'Key Events'}
          </h3>
          <MatchKeyEvents
            events={keyEvents}
            rosterById={rosterById ?? new Map()}
            currentMinute={currentMinute}
            homeTeamId={homeTeamId}
            awayTeamId={awayTeamId}
          />
        </div>
      )}
    </div>
  );
}
