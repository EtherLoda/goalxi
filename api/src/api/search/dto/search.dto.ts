import {
  NumberFieldOptional,
  UUIDFieldOptional,
} from '@/decorators/field.decorators';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SearchTeamsReqDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q: string;

  @IsOptional()
  @UUIDFieldOptional()
  leagueId?: string;

  @IsOptional()
  @NumberFieldOptional({ min: 1, max: 50 })
  limit?: number;
}

export class SearchPlayersReqDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q: string;

  @IsOptional()
  @UUIDFieldOptional()
  leagueId?: string;

  @IsOptional()
  @NumberFieldOptional({ min: 1, max: 50 })
  limit?: number;
}

export class SearchLeaguesReqDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q: string;

  @IsOptional()
  @NumberFieldOptional({ min: 1, max: 50 })
  limit?: number;
}
