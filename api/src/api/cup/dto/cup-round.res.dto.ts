import { Expose } from 'class-transformer';

/**
 * One row per match in a cup round, used in
 * `CupBracketResDto.rounds[].matches[]`. Byes are also
 * included as a match with `isBye=true` and `matchId=null`
 * (no MatchEntity exists for a bye).
 */
export class CupMatchResDto {
  @Expose()
  matchId: string | null;

  @Expose()
  homeTeam: { id: string; name: string; tier: number } | null;

  @Expose()
  awayTeam: { id: string; name: string; tier: number } | null;

  @Expose()
  winnerTeamId: string | null;

  @Expose()
  isBye: boolean;

  @Expose()
  scheduledAt: string | null;
}

export class CupRoundResDto {
  @Expose()
  roundNumber: number;

  @Expose()
  roundName: string;

  @Expose()
  kind: string;

  @Expose()
  status: string;

  @Expose()
  scheduledAt: string | null;

  @Expose()
  matches: CupMatchResDto[];
}
