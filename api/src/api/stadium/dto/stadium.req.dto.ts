import { NumberField } from '@/decorators/field.decorators';

export class BuildStadiumReqDto {
  @NumberField({ min: 1000 })
  capacity!: number;
}

export class ResizeStadiumReqDto {
  @NumberField({ min: 1000 })
  capacity!: number;
}
