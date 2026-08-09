/**
 * Extract weather from the first WEATHER_ANNOUNCEMENT event, attendance
 * from the ATTENDANCE_ANNOUNCEMENT event, and key events (goals,
 * cards, substitutions) from all matching events.
 *
 * Attendance is its own event type now (post-RFC split). Older matches
 * pre-dating the split had `attendance` piggybacked on
 * `weather_announcement.data`; we keep the old branch as a fallback so
 * legacy rows still render.
 */

'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import type { MatchEvent } from '@/lib/api';
import { MatchInfoPanel } from './MatchInfoPanel';
import { MatchKeyEvents } from './MatchKeyEvents';

// ── Data extraction ────────────────────────────────────────────────────────────

export interface MatchSidebarData {
  weather: string | null;
  attendance: number | null;
  keyEvents: MatchEvent[];
}

export function extractSidebarData(events: MatchEvent[]): MatchSidebarData {
  let weather: string | null = null;
  let attendance: number | null = null;
  const keyEvents: MatchEvent[] = [];

  const KEY_TYPES = new Set(['goal', 'own_goal', 'yellow_card', 'second_yellow', 'red_card', 'substitution']);

  for (const ev of events) {
    const type = ev.typeName?.toLowerCase() ?? '';
    if (type === 'weather_announcement') {
      if (!weather) {
        weather = (ev.data?.weather as string) ?? (ev.data?.weatherKey as string) ?? null;
      }
      // Legacy fallback: pre-split rows carried attendance inside
      // weather_announcement.data. Only honour the field when it is a
      // non-zero number — zeros were the default when no scheduler had
      // populated `match.attendance`, and they would otherwise mask the
      // real value from the dedicated event below.
      if (
        attendance === null &&
        typeof ev.data?.attendance === 'number' &&
        (ev.data.attendance as number) > 0
      ) {
        attendance = ev.data.attendance as number;
      }
    } else if (type === 'attendance_announcement') {
      if (attendance === null && typeof ev.data?.attendance === 'number') {
        attendance = ev.data.attendance as number;
      }
    }
    if (KEY_TYPES.has(type)) {
      keyEvents.push(ev);
    }
  }

  return { weather, attendance, keyEvents };
}

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
