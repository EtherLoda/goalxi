import { PasswordField, StringField } from '@/decorators/field.decorators';

export class ResetPasswordReqDto {
  /**
   * JWT minted by `POST /auth/forgot-password`. The same
   * token is used for both verify and reset so the FE only
   * needs to keep one piece of state in the URL — no separate
   * "verified" cookie / session.
   */
  @StringField()
  token!: string;

  /**
   * New password. `PasswordField` enforces the project's
   * shared password rules (min length 6 + `IsPassword()`
   * strength validator — see `field.decorators.ts`).
   */
  @PasswordField()
  newPassword!: string;
}
