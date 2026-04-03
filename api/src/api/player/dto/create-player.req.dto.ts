import {
  BooleanFieldOptional,
  DateFieldOptional,
  EnumFieldOptional,
  NumberFieldOptional,
  StringField,
  StringFieldOptional,
  UUIDFieldOptional,
} from '@/decorators/field.decorators';
import {
  PotentialTier,
  TrainingCategory,
  TrainingSlot,
} from '@goalxi/database';
import { IsObject, IsOptional } from 'class-validator';

export class CreatePlayerReqDto {
  @StringField()
  name!: string;

  @UUIDFieldOptional()
  teamId?: string;

  @DateFieldOptional()
  birthday?: Date;

  @StringFieldOptional({ minLength: 2, maxLength: 2 })
  nationality?: string;

  @NumberFieldOptional({ int: true, min: 15, max: 45 })
  age?: number;

  @IsOptional()
  @IsObject()
  appearance?: Record<string, any>;

  @StringFieldOptional()
  position?: string;

  @BooleanFieldOptional()
  isGoalkeeper?: boolean;

  @IsOptional()
  @IsObject()
  attributes?: Record<string, any>;

  @NumberFieldOptional({ int: true, min: 0, max: 100 })
  potentialAbility?: number;

  @EnumFieldOptional(() => PotentialTier)
  potentialTier?: PotentialTier;

  @EnumFieldOptional(() => TrainingSlot)
  trainingSlot?: TrainingSlot;

  @EnumFieldOptional(() => TrainingCategory)
  trainingCategory?: TrainingCategory;

  @StringFieldOptional({ minLength: 2, maxLength: 20 })
  trainingSkill?: string;
}
