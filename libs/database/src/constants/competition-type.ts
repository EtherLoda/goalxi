/**
 * Competition-bucket discriminator for `player_competition_stats`.
 *
 * Sits between `match.type` (the raw MatchType enum: league,
 * cup, friendly, national_team, tournament, playoff) and the
 * FE render. Collapses the 6 raw types into the 4 buckets the
 * FE actually wants to render:
 *
 *   - 'LEAGUE'  - senior league + playoff (both stamp a
 *                 `league_standing` row and live in
 *                 `player_competition_stats.leagueId IS NOT NULL`)
 *   - 'CUP'     - cup match (match.type='cup',
 *                 `player_competition_stats.leagueId IS NULL`,
 *                 `match.youthLeagueId IS NULL`)
 *   - 'YOUTH'   - youth academy match (`match.youthLeagueId`
 *                 is set, regardless of `match.type`)
 *   - 'OTHER'   - reserved for future types the MatchType enum
 *                 allows (friendly, national_team, tournament)
 *                 but no scheduler currently generates
 *
 * The simulator's `updatePlayerCompetitionStats` writes this
 * value at insert time using `competitionTypeForMatch()`
 * below so the FE never has to infer bucket from `leagueId` /
 * `youthLeagueId` / `match.type` at query time.
 */

export enum CompetitionType {
  LEAGUE = 'LEAGUE',
  CUP = 'CUP',
  YOUTH = 'YOUTH',
  OTHER = 'OTHER',
}

/**
 * Map a `match` row to the bucket the FE should render. The
 * order of checks matters:
 *
 *   1. `youthLeagueId` set -> always 'YOUTH' (youth matches
 *      share the senior `match` table but get their own
 *      bucket so the FE can label them as academy play, not
 *      senior play)
 *   2. `type === 'cup'` -> 'CUP'
 *   3. `type` in ('league', 'playoff') -> 'LEAGUE' (playoff
 *      is league-scored - it stamps a `league_standing` row
 *      just like a regular league match)
 *   4. anything else ('friendly', 'national_team',
 *      'tournament') -> 'OTHER' (currently never reaches
 *      here, but the value is reserved so a future
 *      implementation doesn't have to migrate the column)
 */
export function competitionTypeForMatch(match: {
  type: string;
  youthLeagueId?: string | null;
}): CompetitionType {
  if (match.youthLeagueId) return CompetitionType.YOUTH;
  if (match.type === "cup") return CompetitionType.CUP;
  if (match.type === "league" || match.type === "playoff") {
    return CompetitionType.LEAGUE;
  }
  return CompetitionType.OTHER;
}
