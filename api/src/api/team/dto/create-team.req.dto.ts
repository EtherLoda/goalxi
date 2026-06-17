import {
  HexColorFieldOptional,
  NumberFieldOptional,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '@/decorators/field.decorators';

export class CreateTeamReqDto {
  @UUIDField()
  userId: string;

  @StringField()
  name: string;

  @StringFieldOptional({ minLength: 2, maxLength: 2 })
  nationality?: string;

  @UUIDField({ required: false })
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
}
