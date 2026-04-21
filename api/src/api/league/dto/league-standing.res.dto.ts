import { Expose, Type } from 'class-transformer';

export class RecentMatchDto {
  @Expose()
  result: 'W' | 'D' | 'L';

  @Expose()
  homeScore: number;

  @Expose()
  awayScore: number;

  @Expose()
  opponentName: string;

  @Expose()
  isHome: boolean;

  @Expose()
  scheduledAt: string;
}

export class LeagueStandingResDto {
  @Expose()
  position: number;

  @Expose()
  teamId: string;

  @Expose()
  teamName: string;

  @Expose()
  played: number;

  @Expose()
  wins: number;

  @Expose()
  draws: number;

  @Expose()
  losses: number;

  @Expose()
  goalsFor: number;

  @Expose()
  goalsAgainst: number;

  @Expose()
  goalDifference: number;

  @Expose()
  points: number;

  @Expose()
  @Type(() => RecentMatchDto)
  recentMatches: RecentMatchDto[];
}
