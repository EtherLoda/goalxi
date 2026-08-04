import { Type } from 'class-transformer';
import {
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

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => SubstitutionDto)
  substitutions?: SubstitutionDto[];

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
