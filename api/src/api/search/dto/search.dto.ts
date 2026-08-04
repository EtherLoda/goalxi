import {
  NumberFieldOptional,
  UUIDFieldOptional,
} from '@/decorators/field.decorators';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

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
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @UUIDFieldOptional()
  leagueId?: string;

  @IsOptional()
  @NumberFieldOptional({ min: 1, max: 50 })
  limit?: number;

  @IsOptional()
  @NumberFieldOptional({ min: 100000001, max: 999999999 })
  playerId?: number;
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
