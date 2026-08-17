import { PasswordField, StringField } from '@/decorators/field.decorators';

/**
 * Body for `POST /users/me/change-password`. The user must supply
 * their current password (so a stolen device alone is not enough to
 * rotate the credential) and a fresh new password. The new password
 * must satisfy the same policy as registration — see the
 * `isPassword` constraint in `@PasswordField`.
 */
export class ChangePasswordReqDto {
  @StringField({ minLength: 1, maxLength: 128 })
  currentPassword: string;

  @PasswordField()
  newPassword: string;
}
