import {
  HexColorFieldOptional,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '@/decorators/field.decorators';

export class UpdateTeamReqDto {
  @StringFieldOptional()
  name?: string;

  @StringFieldOptional({ minLength: 2, maxLength: 2 })
  nationality?: string;

  @UUIDFieldOptional()
  leagueId?: string;

  @StringFieldOptional()
  logoUrl?: string;

  @HexColorFieldOptional()
  jerseyColorPrimary?: string;

  @HexColorFieldOptional()
  jerseyColorSecondary?: string;

  @HexColorFieldOptional()
  jerseyColorTertiary?: string;

  @NumberFieldOptional({
    int: true,
    min: 1850,
    max: new Date().getFullYear(),
  })
  foundedYear?: number;

  @StringFieldOptional({ maxLength: 64 })
  city?: string;

  @StringFieldOptional({ maxLength: 2000 })
  bio?: string;

  @NumberFieldOptional({ min: 0, max: 1 })
  staminaTrainingIntensity?: number;
}
