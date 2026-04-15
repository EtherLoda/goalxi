import { Expose } from 'class-transformer';

export class CompetitionStatsEntryDto {
  @Expose()
  playerId!: string;

  @Expose()
  playerName!: string;

  @Expose()
  teamId!: string;

  @Expose()
  teamName!: string;

  @Expose()
  goals!: number;

  @Expose()
  assists!: number;

  @Expose()
  tackles!: number;

  @Expose()
  yellowCards!: number;

  @Expose()
  redCards!: number;

  @Expose()
  appearances!: number;

  @Expose()
  starts!: number;
}

export class LeaderboardResDto {
  @Expose()
  leagueId!: string;

  @Expose()
  season!: number;

  @Expose()
  type!: 'goals' | 'assists' | 'tackles';

  @Expose()
  entries!: CompetitionStatsEntryDto[];
}
