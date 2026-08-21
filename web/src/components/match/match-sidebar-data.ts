/**
 * match-sidebar-data.ts — shared sidebar event extractors.
 *
 * Owned here (rather than re-implemented in each consumer) so the
 * weather/attendance/keys resolution rules live in one place. The two
 * callers that need this data are:
 *
 *   - `MatchPitchSidebar` (live page right rail)
 *   - `TacticalMatchDetail` (report page right rail)
 *
 * Both were carrying their own copy of `extractSidebarData`. Consolidating
 * them makes future tweaks (e.g. adding a new "MATCH_START" event) a
 * single-file change and keeps the legacy attendance-fallback branches
 * (pre-RFC weather_announcement rows) in lockstep.
 *
 * The file lives in `.ts` (not `.tsx`) so jest's `moduleFileExtensions`
 * resolves it without a jsdom environment.
 */

import type { MatchEvent } from '@/lib/api';

export interface MatchSidebarData {
  weather: string | null;
  attendance: number | null;
  keyEvents: MatchEvent[];
}

const KEY_TYPES = new Set([
  'goal',
  'own_goal',
  'yellow_card',
  'second_yellow',
  'red_card',
  'substitution',
]);

/**
 * Walk a (chronological) event list and pull out:
 *   - The first `weather_announcement` event's weather key.
 *   - The first non-zero attendance value, with two sources merged:
 *       1. The dedicated `attendance_announcement` event (post-RFC).
 *       2. Legacy: the `attendance` field piggybacked on a
 *          `weather_announcement` event for matches pre-dating the split.
 *     Zero values are skipped because pre-RFC rows default to 0 when no
 *     scheduler had populated `match.attendance` and would otherwise
 *     mask the real number coming from the dedicated event below.
 *   - All "key" events (goals, cards, subs) in the order seen.
 *
 * Pure: no mutation, no React. Safe inside `useMemo`.
 */
export function extractSidebarData(events: MatchEvent[]): MatchSidebarData {
  let weather: string | null = null;
  let attendance: number | null = null;
  const keyEvents: MatchEvent[] = [];

  for (const ev of events) {
    const type = ev.typeName?.toLowerCase() ?? '';
    if (type === 'weather_announcement') {
      if (!weather) {
        weather = (ev.data?.weather as string) ?? (ev.data?.weatherKey as string) ?? null;
      }
      if (
        attendance === null &&
        typeof ev.data?.attendance === 'number' &&
        (ev.data.attendance as number) > 0
      ) {
        attendance = ev.data.attendance as number;
      }
    } else if (type === 'attendance_announcement') {
      // Symmetric with the `weather_announcement` branch above: only
      // adopt a non-zero number. A 0 value means "the preprocessor
      // never computed attendance for this match" (no built stadium,
      // no fan row, etc.) and we want the FE to render the absence
      // (no tile) rather than a misleading "Attendance 0".
      if (
        attendance === null &&
        typeof ev.data?.attendance === 'number' &&
        (ev.data.attendance as number) > 0
      ) {
        attendance = ev.data.attendance as number;
      }
    }
    if (KEY_TYPES.has(type)) {
      keyEvents.push(ev);
    }
  }

  return { weather, attendance, keyEvents };
}
