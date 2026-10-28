import type { MatchEvent, MatchStatsRes } from '@/lib/api';
import { canonicalEventType } from '@/lib/commentary';
import { resolveSide } from './match-event-side';

/**
 * The numbers behind the "Match stats" card — the kind of row-for-row
 * comparison you get on a Premier League match centre.
 *
 * Two sources, because neither one has everything:
 *
 * - The persisted `MatchTeamStatsEntity` row owns shots, shots on
 *   target, corners, fouls, offsides and cards. Those counters come
 *   from the engine's own tally, not from the event stream (a foul
 *   never becomes an event row), so they cannot be recomputed here.
 * - Goals and assists come from the event stream. `stats` does carry
 *   `computed.goals`, but the per-goal `assistName` only lives on the
 *   event, and reading both from one place keeps the two rows
 *   consistent with each other.
 *
 * The stats row is written when the match finishes, so this card only
 * renders once there is something to show — the caller passes `null`
 * while the match is live and the card stays out of the sidebar.
 */

export type StatRowKey =
  | 'possession'
  | 'shots'
  | 'shotsOnTarget'
  | 'goals'
  | 'assists'
  | 'corners'
  | 'fouls'
  | 'offsides'
  | 'yellowCards'
  | 'redCards';

export interface StatRow {
  key: StatRowKey;
  home: number;
  away: number;
  unit: 'count' | 'percent';
}

interface SideCounts {
  home: number;
  away: number;
}

/**
 * Count events of one canonical type per side.
 *
 * `predicate` lets the assist row reuse the same walk: an assist is a
 * goal event that carries `data.assistName`, so the filter runs on the
 * event rather than on the tally.
 */
function countEvents(
  events: readonly MatchEvent[],
  homeTeamId: string | null,
  awayTeamId: string | null,
  typeName: string,
  predicate?: (event: MatchEvent) => boolean,
): SideCounts {
  const counts: SideCounts = { home: 0, away: 0 };
  for (const event of events) {
    if (canonicalEventType(event.typeName ?? event.type) !== typeName) continue;
    if (predicate && !predicate(event)) continue;
    const side = resolveSide(event, homeTeamId, awayTeamId);
    if (side === 'neutral') continue;
    counts[side] += 1;
  }
  return counts;
}

function hasAssist(event: MatchEvent): boolean {
  const name = event.data?.assistName;
  return typeof name === 'string' && name.trim().length > 0;
}

/** Percentages come back as strings ("46.67") to keep two decimals. */
function toNumber(value: unknown): number {
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : 0;
}

export function buildStatRows(
  stats: MatchStatsRes | null,
  events: readonly MatchEvent[],
  homeTeamId: string | null,
  awayTeamId: string | null,
): StatRow[] {
  if (!stats) return [];

  const home = stats.homeTeamStats;
  const away = stats.awayTeamStats;

  const goals = countEvents(events, homeTeamId, awayTeamId, 'GOAL');
  const assists = countEvents(
    events,
    homeTeamId,
    awayTeamId,
    'GOAL',
    hasAssist,
  );

  const possessionHome = toNumber(home.possessionPercentage);
  const possessionAway = toNumber(away.possessionPercentage);

  const rows: StatRow[] = [
    { key: 'shots', home: home.shots ?? 0, away: away.shots ?? 0, unit: 'count' },
    {
      key: 'shotsOnTarget',
      home: home.shotsOnTarget ?? 0,
      away: away.shotsOnTarget ?? 0,
      unit: 'count',
    },
    { key: 'goals', home: goals.home, away: goals.away, unit: 'count' },
    { key: 'assists', home: assists.home, away: assists.away, unit: 'count' },
    { key: 'corners', home: home.corners ?? 0, away: away.corners ?? 0, unit: 'count' },
    { key: 'fouls', home: home.fouls ?? 0, away: away.fouls ?? 0, unit: 'count' },
    { key: 'offsides', home: home.offsides ?? 0, away: away.offsides ?? 0, unit: 'count' },
    {
      key: 'yellowCards',
      home: home.yellowCards ?? 0,
      away: away.yellowCards ?? 0,
      unit: 'count',
    },
    { key: 'redCards', home: home.redCards ?? 0, away: away.redCards ?? 0, unit: 'count' },
  ];

  // Possession leads when it exists; a 0/0 row means the column was
  // never written for this match, so it is dropped rather than shown as
  // "0 % – 0 %".
  if (possessionHome > 0 || possessionAway > 0) {
    rows.unshift({
      key: 'possession',
      home: possessionHome,
      away: possessionAway,
      unit: 'percent',
    });
  }

  return rows;
}
