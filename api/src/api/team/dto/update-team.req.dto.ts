import {
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

  @StringFieldOptional()
  jerseyColorPrimary?: string;

  @StringFieldOptional()
  jerseyColorSecondary?: string;
}
