import { MatchTeamStatsEntity } from '@goalxi/database';

export class MatchStatsResDto {
    matchId!: string;
    homeTeamStats!: MatchTeamStatsEntity;
    awayTeamStats!: MatchTeamStatsEntity;
}
