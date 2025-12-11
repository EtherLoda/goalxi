import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { MatchStatus, MatchType } from '@goalxi/database';
import { Type } from 'class-transformer';

export class ListMatchesReqDto {
    @IsString()
    @IsOptional()
    leagueId?: string;

    @IsUUID()
    @IsOptional()
    teamId?: string;

    @IsInt()
    @IsOptional()
    @Type(() => Number)
    season?: number;

    @IsInt()
    @IsOptional()
    @Type(() => Number)
    week?: number;

    @IsEnum(MatchStatus)
    @IsOptional()
    status?: MatchStatus;

    @IsEnum(MatchType)
    @IsOptional()
    type?: MatchType;

    @IsInt()
    @Min(1)
    @IsOptional()
    @Type(() => Number)
    page?: number = 1;

    @IsInt()
    @Min(1)
    @Max(100)
    @IsOptional()
    @Type(() => Number)
    limit?: number = 20;
}
