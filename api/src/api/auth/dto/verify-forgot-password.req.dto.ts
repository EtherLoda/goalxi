import { StringField } from '@/decorators/field.decorators';

export class VerifyForgotPasswordReqDto {
  /**
   * JWT minted by `POST /auth/forgot-password`, signed with
   * `auth.forgotSecret`. The FE posts it back to verify it
   * hasn't expired or been revoked before showing the user
   * the "set a new password" form.
   */
  @StringField()
  token!: string;
}
