import {
  BooleanFieldOptional,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '@/decorators/field.decorators';
import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdatePlayerReqDto {
  @StringFieldOptional()
  name?: string;

  @UUIDFieldOptional()
  teamId?: string;

  /** Absolute game-day on which the player was created. */
  @IsOptional()
  @IsInt()
  @Min(0)
  createdDay?: number;

  @StringFieldOptional({ minLength: 2, maxLength: 2 })
  nationality?: string;

  @NumberFieldOptional({ int: true, min: 15, max: 45 })
  age?: number;

  @StringFieldOptional()
  position?: string;

  @BooleanFieldOptional()
  isGoalkeeper?: boolean;

  @BooleanFieldOptional()
  onTransfer?: boolean;

  @IsOptional()
  attributes?: Record<string, any>;

  @NumberFieldOptional({ int: true, min: 0, max: 100 })
  potentialAbility?: number;
}
