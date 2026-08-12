import {
  EmailField,
  PasswordField,
  StringField,
} from '@/decorators/field.decorators';

export class RegisterReqDto {
  @StringField()
  username!: string;

  @EmailField()
  email!: string;

  @PasswordField()
  password!: string;

  /**
   * User-supplied club name. The register form marks this
   * as required, so a real client always sends a value; the
   * `@IsOptional()` is purely a safety net for headless
   * scripts and tests. The settlement worker writes this
   * directly to `team.name` so the user lands on
   * `/dashboard` with a club name they recognize — no
   * separate "rename your club" step on `/onboarding/select`.
   *
   * `minLength: 2, maxLength: 50` mirrors `UpdateTeamReqDto.name`
   * — same character budget for the same field, enforced
   * twice so a manual DB write and a UI form share the
   * contract.
   */
  @StringField({ minLength: 2, maxLength: 50, required: false })
  teamName?: string;

  /**
   * Locale the user is registering from. The web register
   * page reads this from the `[locale]` URL segment and
   * ships it so we can route the user back to the right
   * language after every subsequent login. Defaults to
   * `'en'` server-side; the `en`/`zh` constraint matches
   * `UserEntity.preferredLanguage` (varchar(8)) and
   * next-intl's `routing.locales`. Optional so headless
   * scripts / tests can omit it.
   */
  @StringField({ minLength: 2, maxLength: 8, required: false })
  preferredLanguage?: string;
}
