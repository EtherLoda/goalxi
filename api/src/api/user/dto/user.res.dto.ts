import {
  ClassField,
  NumberField,
  StringField,
  StringFieldOptional,
} from '@/decorators/field.decorators';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class UserResDto {
  @StringField()
  @Expose()
  id: string;

  @StringField()
  @Expose()
  username: string;

  @StringField()
  @Expose()
  email: string;

  @StringFieldOptional()
  @Expose()
  bio?: string;

  // Football Manager specific fields
  @StringFieldOptional()
  @Expose()
  nickname?: string;

  @StringFieldOptional()
  @Expose()
  avatar?: string;

  @StringFieldOptional()
  @Expose()
  teamId?: string;

  @StringFieldOptional()
  @Expose()
  teamName?: string;

  @StringFieldOptional()
  @Expose()
  leagueId?: string;

  @NumberField()
  @Expose()
  supporterLevel: number;

  /**
   * Locale the user registered from. Mirrors
   * `UserEntity.preferredLanguage`; the web `AuthContext` reads
   * this from the `/users/me` payload on every login and routes
   * the user to `/${preferredLanguage}/dashboard` instead of
   * back to whatever locale the URL happens to have when they
   * hit the login page. Defaults to `'en'` server-side, which
   * is also `next-intl`'s `defaultLocale` so the two never
   * disagree for pre-migration users.
   */
  @StringField()
  @Expose()
  preferredLanguage: string;

  @ClassField(() => Date)
  @Expose()
  createdAt: Date;

  @ClassField(() => Date)
  @Expose()
  updatedAt: Date;
}
