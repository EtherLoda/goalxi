import { YouthMatchStatus } from '@goalxi/database';

export class YouthMatchResDto {
  id!: string;
  youthLeagueId!: string;
  season!: number;
  week!: number;
  homeYouthTeamId!: string;
  awayYouthTeamId!: string;
  homeScore?: number;
  awayScore?: number;
  status!: YouthMatchStatus;
  scheduledAt!: Date;
  simulationCompletedAt?: Date;
  tacticsLocked!: boolean;
  homeForfeit!: boolean;
  awayForfeit!: boolean;
  startedAt?: Date;
  completedAt?: Date;
  homeYouthTeam?: {
    id: string;
    name: string;
  };
  awayYouthTeam?: {
    id: string;
    name: string;
  };
}

export class YouthMatchListResDto {
  items!: YouthMatchResDto[];
  total!: number;
  page!: number;
  limit!: number;
  totalPages!: number;
}
