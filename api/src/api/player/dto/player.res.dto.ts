import {
  BooleanField,
  DateField,
  NumberField,
  StringField,
  StringFieldOptional,
  UUIDField,
  UUIDFieldOptional,
} from '@/decorators/field.decorators';
import { PotentialTier } from '@goalxi/database';
import { Exclude, Expose, Transform } from 'class-transformer';

@Exclude()
export class PlayerPublicResDto {
  @UUIDField()
  @Expose()
  id: string;

  @UUIDFieldOptional()
  @Expose()
  teamId?: string | null;

  @StringField()
  @Expose()
  name: string;

  @StringFieldOptional({ minLength: 2, maxLength: 2 })
  @Expose()
  nationality?: string;

  @DateField({ nullable: true })
  @Expose()
  birthday?: Date;

  @BooleanField()
  @Expose()
  isYouth: boolean;

  @NumberField({ int: true })
  @Expose()
  age: number;

  @NumberField({ int: true })
  @Expose()
  ageDays: number;

  @Expose()
  appearance: Record<string, any>;

  @BooleanField()
  @Expose()
  isGoalkeeper: boolean;

  @NumberField({ int: true })
  @Expose()
  overall: number;

  @NumberField({ int: true })
  @Expose()
  pwi: number;

  @StringField()
  @Expose()
  pwiDisplay: string;

  @BooleanField()
  @Expose()
  onTransfer: boolean;

  @StringFieldOptional()
  @Expose()
  specialty?: string | null;

  @NumberField({ int: true })
  @Expose()
  potentialAbility: number;

  @Expose()
  potentialTier: PotentialTier;

  @NumberField()
  @Expose()
  @Transform(({ value }) => Math.floor(value))
  experience: number;

  @NumberField()
  @Expose()
  @Transform(({ value }) => Math.floor(value))
  form: number;

  @NumberField()
  @Expose()
  @Transform(({ value }) => Math.floor(value))
  stamina: number;

  @NumberField({ int: true })
  @Expose()
  currentWage: number;

  @DateField()
  @Expose()
  createdAt: Date;

  @DateField()
  @Expose()
  updatedAt: Date;
}

@Exclude()
export class PlayerResDto extends PlayerPublicResDto {
  @Expose()
  @Transform(({ value }) => {
    if (!value) return value;
    const floored: any = {
      physical: {},
      technical: {},
      mental: {},
      setPieces: {},
    };

    for (const category of ['physical', 'technical', 'mental', 'setPieces']) {
      if (value[category]) {
        floored[category] = {};
        for (const attr in value[category]) {
          floored[category][attr] = Math.floor(value[category][attr]);
        }
      }
    }
    return floored;
  })
  currentSkills: any;

  @Expose()
  @Transform(({ value }) => {
    if (!value) return value;
    const floored: any = {
      physical: {},
      technical: {},
      mental: {},
      setPieces: {},
    };

    for (const category of ['physical', 'technical', 'mental', 'setPieces']) {
      if (value[category]) {
        floored[category] = {};
        for (const attr in value[category]) {
          floored[category][attr] = Math.floor(value[category][attr]);
        }
      }
    }
    return floored;
  })
  potentialSkills: any;
}
