import { YouthMatchStatus } from '@goalxi/database';
import { IsOptional, IsUUID } from 'class-validator';

export class ListYouthMatchesReqDto {
  @IsUUID()
  @IsOptional()
  youthLeagueId?: string;

  @IsUUID()
  @IsOptional()
  teamId?: string; // youth team ID

  @IsOptional()
  season?: number;

  @IsOptional()
  week?: number;

  @IsOptional()
  status?: YouthMatchStatus;

  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}
