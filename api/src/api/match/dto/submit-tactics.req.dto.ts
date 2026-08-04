import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { DefensiveLine, PitchWidth, Tempo } from '../types/tactical-dimensions';
import { SubstitutionDto } from './substitution.dto';

export class SubmitTacticsReqDto {
  @IsString()
  formation!: string;

  // Player ids are int (post-PlayerIdToNumeric migration). The wire payload
  // is `Record<slot, int playerId>`; we keep `IsObject()` only and let the
  // values stay as their native JSON type rather than enforcing string here.
  @IsObject()
  lineup!: Record<string, number>;

  @IsObject()
  @IsOptional()
  instructions?: Record<string, any>;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => SubstitutionDto)
  substitutions?: SubstitutionDto[];

  @IsUUID()
  @IsOptional()
  presetId?: string;

  @IsUUID()
  teamId!: string;

  @IsEnum(Tempo)
  @IsOptional()
  tempo?: Tempo;

  @IsEnum(PitchWidth)
  @IsOptional()
  pitchWidth?: PitchWidth;

  @IsEnum(DefensiveLine)
  @IsOptional()
  defensiveLine?: DefensiveLine;
}
