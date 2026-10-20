/**
 * One row of a player's match log.
 *
 * Derived from `match_event`, not from a appearances table — see
 * `StatsService.getPlayerMatches`. `result` is `pending` for a fixture that
 * has not been simulated yet (`homeScore`/`awayScore` are null).
 */
export interface PlayerMatchLogEntryDto {
  matchId: string;
  season: number;
  round: number | null;
  scheduledAt: string;
  /** `league` | `cup` | `friendly` | `playoff` | ... (MatchType). */
  matchType: string;
  isHome: boolean;
  opponentName: string;
  opponentShortCode: string | null;
  /** Goals for the player's side, null when the match has not been played. */
  teamScore: number | null;
  opponentScore: number | null;
  result: 'win' | 'draw' | 'loss' | 'pending';
  /** How many recorded events the player has in this match. */
  eventCount: number;
}

export interface PlayerMatchLogResDto {
  items: PlayerMatchLogEntryDto[];
  /** Every season this player has a recorded match in, newest first. */
  seasons: number[];
}
