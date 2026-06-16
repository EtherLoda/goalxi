import {
  BooleanFieldOptional,
  DateFieldOptional,
  NumberFieldOptional,
  StringField,
  StringFieldOptional,
  UUIDFieldOptional,
} from '@/decorators/field.decorators';
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

  @StringFieldOptional()
  position?: string;

  @BooleanFieldOptional()
  isGoalkeeper?: boolean;

  @IsOptional()
  @IsObject()
  attributes?: Record<string, any>;

  @NumberFieldOptional({ int: true, min: 0, max: 100 })
  potentialAbility?: number;
}
