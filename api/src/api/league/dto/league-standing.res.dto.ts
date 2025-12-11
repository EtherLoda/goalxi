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
    won: number;

    @Expose()
    drawn: number;

    @Expose()
    lost: number;

    @Expose()
    goalsFor: number;

    @Expose()
    goalsAgainst: number;

    @Expose()
    goalDifference: number;

    @Expose()
    points: number;
}
