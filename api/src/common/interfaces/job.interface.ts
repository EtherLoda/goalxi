export interface IEmailJob {
  email: string;
}

export interface IVerifyEmailJob extends IEmailJob {
  token: string;
}

/**
 * Job payload for the password-reset email. The token is a
 * JWT signed with `auth.forgotSecret`; the email template
 * renders it into a one-click reset link with the same shape
 * as the verification email (subject + button + raw URL).
 *
 * Carries `userId` alongside the token so the consumer (or
 * the email template) can do a fresh DB lookup if it needs
 * the username / locale without re-decoding the JWT. Mirrors
 * `IVerifyEmailJob` so adding new email-queue job types is
 * a single-file copy.
 */
export interface IForgotPasswordJob extends IEmailJob {
  userId: string;
  token: string;
}
