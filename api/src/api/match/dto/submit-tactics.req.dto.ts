import { Type } from 'class-transformer';
import {
    IsArray,
    IsObject,
    IsOptional,
    IsString,
    IsUUID,
    ValidateNested,
} from 'class-validator';
import { SubstitutionDto } from './substitution.dto';

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
}
