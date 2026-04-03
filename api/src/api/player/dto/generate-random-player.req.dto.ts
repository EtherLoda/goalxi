import { NumberFieldOptional } from '@/decorators/field.decorators';
import { IsInt, Max, Min } from 'class-validator';

export class GenerateRandomPlayerReqDto {
  @NumberFieldOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  readonly count?: number = 1;
}
