import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

/**
 * Response for `POST /auth/forgot-password`.
 *
 * `devToken` is only set when `MAIL_ENABLED=false` (dev box,
 * no SMTP relay). It mirrors the token the email would have
 * contained, so the FE can drive the reset flow end-to-end
 * without a working mailer. In production this field is
 * always undefined and the email is the only way to obtain
 * a token.
 */
export class ForgotPasswordResDto {
  @ApiProperty({ example: 'If the email exists, a reset link has been sent.' })
  message!: string;

  @Expose({ name: 'devToken' })
  @ApiProperty({
    required: false,
    description:
      'Dev-only echo of the reset token. Set when MAIL_ENABLED=false so the FE can complete the flow without an SMTP relay. Never set in production.',
  })
  devToken?: string;
}
