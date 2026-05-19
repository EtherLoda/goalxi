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
import { SubstitutionDto } from './substitution.dto';
import { Tempo, PitchWidth, DefensiveLine } from '../types/tactical-dimensions';

export class SubmitTacticsReqDto {
  @IsString()
  formation!: string;

  @IsObject()
  lineup!: Record<string, string>;

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
