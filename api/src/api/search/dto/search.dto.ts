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
  @IsString()
  @Matches(/^\d{11}$/, { message: 'dId must be exactly 11 digits' })
  dId?: string;
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
