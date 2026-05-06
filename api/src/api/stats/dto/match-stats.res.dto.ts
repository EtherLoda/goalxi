import { MatchTeamStatsEntity } from '@goalxi/database';

export class ComputedTeamStats {
  xG: number = 0;
  goals: number = 0;
  saves: number = 0;
  tackles: number = 0;
  interceptions: number = 0;
  clearances: number = 0;
  passAccuracy: number = 0;
}

export class MatchStatsResDto {
  matchId!: string;
  homeTeamStats!: MatchTeamStatsEntity;
  awayTeamStats!: MatchTeamStatsEntity;
  homeComputed!: ComputedTeamStats;
  awayComputed!: ComputedTeamStats;
}
