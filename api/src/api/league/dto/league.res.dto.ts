import { Expose } from 'class-transformer';

export class LeagueResDto {
    @Expose()
    id: string;

    @Expose()
    name: string;

    @Expose()
    season: number;

    @Expose()
    tier: number;

    @Expose()
    division: number;

    @Expose()
    status: string;

    @Expose()
    createdAt: Date;

    @Expose()
    updatedAt: Date;
}
