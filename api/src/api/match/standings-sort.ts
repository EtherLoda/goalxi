/**
 * The single canonical league-table sort key.
 *
 * ## Why this is shared
 *
 * Four separate implementations used to order the table, and they could
 * disagree:
 *
 *   - `MatchCompletionService.recalculateLeaguePositions` (this file)
 *   - `api/src/api/league/league.service.ts` (public standings endpoint)
 *   - `api/src/api/league/league-structure.service.ts` ×2
 *
 * Three sorted by the COMPUTED expression `goalsFor - goalsAgainst`; one
 * sorted by the STORED `goal_difference` column. They agree numerically
 * today only because `updateLeagueStandings` keeps the column in sync,
 * and one of them returned rows in the stored `position` order written by
 * a different code path on a different schedule — so two readers of the
 * same league could see different row orders.
 *
 * ## Why 4th and 5th keys exist
 *
 * Every implementation previously stopped at three keys, so two teams tied
 * on (points, GD, GF) got an ARBITRARY rank from Postgres heap order.
 * That is not academic here: `promotion-relegation.service.ts` and
 * `playoff.service.ts` both select participants by exact
 * `position === N`, and `league-award.service.ts` picks prize money by
 * `order: { position: 'ASC' }`. A tie therefore silently decided who got
 * promoted, who got relegated, and who got paid.
 *
 * Head-to-head is the traditional football answer but is expensive (it
 * needs every relevant match) and is not implemented anywhere in this
 * codebase, so the deterministic fallback is used instead:
 *
 *   4. `wins DESC`         — more wins at equal points/GD/GF is better
 *   5. `goalsAgainst ASC`  — the better defensive record is the better team
 *   6. `teamId ASC`        — total tie-break; stable across readers and
 *                            across re-runs, so the rank is reproducible
 *
 * The league has 16 rows, so the extra sort keys cost nothing and no index
 * covers them (the sort is in-memory on a filtered 16-row set).
 */
export const STANDINGS_SORT_SQL = [
  'points DESC',
  '(goals_for - goals_against) DESC',
  'goals_for DESC',
  'wins DESC',
  'goals_against ASC',
  'team_id ASC',
] as const;

/**
 * The same ordering as a JS comparator, for in-memory sorts of
 * `LeagueStandingEntity` rows. Kept beside {@link STANDINGS_SORT_SQL}
 * deliberately: if you change one you must change the other, and the
 * `standings-sort.spec.ts` contract test asserts they agree.
 */
export function compareStandings(a: {
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  wins: number;
  teamId: string;
}, b: {
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  wins: number;
  teamId: string;
}): number {
  if (a.points !== b.points) return b.points - a.points;
  const gdA = a.goalsFor - a.goalsAgainst;
  const gdB = b.goalsFor - b.goalsAgainst;
  if (gdA !== gdB) return gdB - gdA;
  if (a.goalsFor !== b.goalsFor) return b.goalsFor - a.goalsFor;
  if (a.wins !== b.wins) return b.wins - a.wins;
  if (a.goalsAgainst !== b.goalsAgainst) return a.goalsAgainst - b.goalsAgainst;
  // Final deterministic tie-break so a total tie never falls back to
  // database row order.
  return a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0;
}