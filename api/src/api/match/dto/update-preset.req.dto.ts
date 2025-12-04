import { PartialType } from '@nestjs/mapped-types';
import { CreatePresetReqDto } from './create-preset.req.dto';

export class UpdatePresetReqDto extends PartialType(CreatePresetReqDto) { }
