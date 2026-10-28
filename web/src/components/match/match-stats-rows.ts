import type { MatchEvent, MatchStatsRes } from '@/lib/api';
import { canonicalEventType } from '@/lib/commentary';
import { resolveSide } from './match-event-side';
import { isOnTarget, isShotAttempt } from './shot-attempts';

/**
 * The numbers behind the "Match stats" card — the kind of row-for-row
 * comparison you get on a Premier League match centre.
 *
 * Two sources, and which one owns a row depends on where the truth is:
 *
 * - **Shots / shots on target** come from the event stream, through the
 *   same `shot-attempts` predicate the chances card uses. The persisted
 *   `shots` column is derived by the processor as `goals + misses +
 *   saves`, which drops set-piece attempts and mis-assigns saves to the
 *   wrong side, so it disagreed with the chances card on real matches
 *   (3 : 8 vs 7 : 8). Reading the events keeps the two cards in step for
 *   historical matches too — no backfill needed.
 * - **Fouls / cards / possession** come from `match_team_stats`: a
 *   foul never becomes an event row, so those counters cannot be
 *   recomputed here.
 * - **Goals / assists / tackles** come from events as well. Assists only
 *   exist there (`assistName`), and a tackle is the `turnover` the
 *   engine emits when a defender wins the ball — the offside counter is
 *   gone entirely because the engine never models offsides, so the
 *   column was always 0.
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
  | 'tackles'
  | 'fouls'
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

/** Walk the events once and count the ones that match, per side. */
function tally(
  events: readonly MatchEvent[],
  homeTeamId: string | null,
  awayTeamId: string | null,
  predicate: (event: MatchEvent) => boolean,
): SideCounts {
  const counts: SideCounts = { home: 0, away: 0 };
  for (const event of events) {
    if (!predicate(event)) continue;
    const side = resolveSide(event, homeTeamId, awayTeamId);
    if (side === 'neutral') continue;
    counts[side] += 1;
  }
  return counts;
}

function isGoal(event: MatchEvent): boolean {
  return canonicalEventType(event.typeName ?? event.type) === 'GOAL';
}

/** A tackle is the turnover the engine emits when a defender wins the ball. */
function isTackle(event: MatchEvent): boolean {
  return canonicalEventType(event.typeName ?? event.type) === 'TURNOVER';
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

  const goals = tally(events, homeTeamId, awayTeamId, isGoal);
  const assists = tally(
    events,
    homeTeamId,
    awayTeamId,
    (event) => isGoal(event) && hasAssist(event),
  );
  const shots = tally(events, homeTeamId, awayTeamId, isShotAttempt);
  const onTarget = tally(events, homeTeamId, awayTeamId, isOnTarget);
  const tackles = tally(events, homeTeamId, awayTeamId, isTackle);

  const possessionHome = toNumber(home.possessionPercentage);
  const possessionAway = toNumber(away.possessionPercentage);

  const rows: StatRow[] = [
    { key: 'shots', home: shots.home, away: shots.away, unit: 'count' },
    { key: 'shotsOnTarget', home: onTarget.home, away: onTarget.away, unit: 'count' },
    { key: 'goals', home: goals.home, away: goals.away, unit: 'count' },
    { key: 'assists', home: assists.home, away: assists.away, unit: 'count' },
    { key: 'corners', home: home.corners ?? 0, away: away.corners ?? 0, unit: 'count' },
    { key: 'tackles', home: tackles.home, away: tackles.away, unit: 'count' },
    { key: 'fouls', home: home.fouls ?? 0, away: away.fouls ?? 0, unit: 'count' },
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
