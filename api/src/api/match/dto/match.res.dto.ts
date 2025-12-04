import { MatchStatus, MatchType } from '@goalxi/database';

export class MatchResDto {
    id!: string;
    leagueId!: string;
    season!: number;
    week!: number;
    homeTeamId!: string;
    awayTeamId!: string;
    homeScore!: number | null;
    awayScore!: number | null;
    status!: MatchStatus;
    type!: MatchType;
    scheduledAt!: Date;
    simulationCompletedAt!: Date | null;
    homeTeam!: {
        id: string;
        name: string;
        logo: string | null;
    };
    awayTeam!: {
        id: string;
        name: string;
        logo: string | null;
    };

    // Phase 4: Match automation fields
    tacticsLocked!: boolean;
    homeForfeit!: boolean;
    awayForfeit!: boolean;
    firstHalfInjuryTime!: number | null;
    secondHalfInjuryTime!: number | null;
    hasExtraTime!: boolean;
}
