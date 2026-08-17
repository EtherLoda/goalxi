import {
  EnumFieldOptional,
  StringFieldOptional,
} from '@/decorators/field.decorators';
import { IsValidTimezone } from '@/decorators/is-valid-timezone.decorator';

/**
 * Locale codes the user is allowed to pick. Mirrors
 * `web/src/i18n/routing.ts` — keep in sync. Adding a new locale
 * here without also wiring the FE will leave a user stuck on
 * a code that 404s the next request.
 *
 * Defined BEFORE `UpdateMyProfileReqDto` because the class-level
 * `EnumFieldOptional(() => SupportedLanguage)` decorator evaluates
 * the reference at class-load time; placing the enum after the
 * class would put it in the temporal dead zone.
 */
export enum SupportedLanguage {
  EN = 'en',
  ZH = 'zh',
}

/**
 * Owner-only profile update DTO. Reachable via `PATCH /users/me`; the
 * controller pulls the user id from the JWT, so callers cannot
 * impersonate another user.
 *
 * Fields the user is NOT allowed to touch via this endpoint
 * (username / email / password / role / supporterLevel /
 *  onboardingStatus) are deliberately absent. The DTO is a
 *  white-list, not a black-list, so a malicious body like
 *  `{ "role": "admin" }` is silently ignored at the class-validator
 *  layer — `UserService.updateMe` also double-checks at runtime
 *  (see comment there) so we don't rely on validation alone.
 */
export class UpdateMyProfileReqDto {
  @StringFieldOptional({ minLength: 2, maxLength: 50 })
  nickname?: string;

  @StringFieldOptional({ maxLength: 2000, nullable: true })
  bio?: string | null;

  // The avatar URL is user-controlled. The FE validates
  // `new URL(s).protocol === 'https:'` before submitting, so a
  // plain string field is enough here. If a stricter server-side
  // check is needed later, add a `@IsHttpsUrl()` decorator; for
  // now the pattern mirrors `UpdateTeamReqDto.logoUrl`.
  @StringFieldOptional({ maxLength: 500, nullable: true })
  avatar?: string | null;

  /**
   * The locale the user wants to see. Must be one of the codes
   * `next-intl` actually has a translation for — see
   * `web/src/i18n/routing.ts`. We let `class-validator` reject
   * anything outside the enum, so a body containing
   * `{ "preferredLanguage": "klingon" }` is a 400, not a silent
   * write to a meaningless value.
   */
  @EnumFieldOptional(() => SupportedLanguage)
  preferredLanguage?: SupportedLanguage;

  /**
   * IANA timezone (e.g. `Asia/Shanghai`). Validated at runtime via
   * `Intl.DateTimeFormat({ timeZone })` — see
   * `is-valid-timezone.decorator.ts`. We don't enumerate valid
   * values; the IANA tz database is too large to bake into the DTO
   * and would also need a code change every time a region splits
   * off a new zone.
   */
  @IsValidTimezone()
  timezone?: string;
}
