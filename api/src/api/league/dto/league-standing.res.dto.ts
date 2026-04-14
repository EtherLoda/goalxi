import { Expose } from 'class-transformer';

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
}
