import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsInt, IsOptional } from 'class-validator';
import { MatchStatus } from '@goalxi/database';
import { CreateMatchReqDto } from './create-match.req.dto';

export class UpdateMatchReqDto extends PartialType(CreateMatchReqDto) {
    @IsEnum(MatchStatus)
    @IsOptional()
    status?: MatchStatus;

    @IsInt()
    @IsOptional()
    homeScore?: number;

    @IsInt()
    @IsOptional()
    awayScore?: number;
}
