import { IsDateString, IsEnum, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { MatchType } from '@goalxi/database';

export class CreateMatchReqDto {
    @IsUUID()
    leagueId!: string;

    @IsInt()
    @Min(1)
    season!: number;

    @IsInt()
    @Min(1)
    week!: number;

    @IsUUID()
    homeTeamId!: string;

    @IsUUID()
    awayTeamId!: string;

    @IsDateString()
    scheduledAt!: string;

    @IsEnum(MatchType)
    @IsOptional()
    type?: MatchType;
}
