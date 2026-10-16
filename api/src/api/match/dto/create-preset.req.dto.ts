import { GAME_SETTINGS } from '@goalxi/database';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { SubstitutionDto } from './substitution.dto';

export class CreatePresetReqDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsString()
  formation!: string;

  // Player ids are int (post-PlayerIdToNumeric migration). See
  // SubmitTacticsReqDto for the rationale.
  @IsObject()
  lineup!: Record<string, number>;

  @IsObject()
  @IsOptional()
  instructions?: Record<string, any>;

  // Same cap as `SubmitTacticsReqDto` — a preset that queued 4 voluntary
  // substitutions could otherwise be applied to a match, where the engine
  // would silently drop the 4th.
  @IsArray()
  @IsOptional()
  @ArrayMaxSize(GAME_SETTINGS.MATCH_MAX_SUBSTITUTIONS, {
    message: `substitutions must not contain more than ${GAME_SETTINGS.MATCH_MAX_SUBSTITUTIONS} entries (only voluntary substitutions count; injury replacements are handled by the engine)`,
  })
  @ValidateNested({ each: true })
  @Type(() => SubstitutionDto)
  substitutions?: SubstitutionDto[];

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
