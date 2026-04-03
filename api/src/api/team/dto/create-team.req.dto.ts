import {
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

  @StringFieldOptional()
  jerseyColorPrimary?: string;

  @StringFieldOptional()
  jerseyColorSecondary?: string;
}
