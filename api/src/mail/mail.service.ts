import { AllConfigType } from '@/config/config.type';
import { MailerService } from '@nestjs-modules/mailer';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  constructor(
    private readonly configService: ConfigService<AllConfigType>,
    private readonly mailerService: MailerService,
  ) {}

  async sendEmailVerification(email: string, token: string) {
    // Please replace the URL with your own frontend URL
    const url = `${this.configService.get('app.url', { infer: true })}/api/v1/auth/verify/email?token=${token}`;

    await this.mailerService.sendMail({
      to: email,
      subject: 'Email Verification',
      template: 'email-verification',
      context: {
        email: email,
        url,
      },
    });
  }

  /**
   * Password reset email. The URL points at the FE reset page
   * (`/[locale]/auth/reset-password?token=...`), not the API
   * directly — the FE page is what calls
   * `POST /auth/verify/forgot-password` to validate the token
   * and then `POST /auth/reset-password` to commit the change.
   * Going through the FE means the user sees the "set a new
   * password" form, not a raw JSON response.
   */
  async sendPasswordReset(email: string, token: string) {
    const appUrl = this.configService.get('app.url', { infer: true });
    const url = `${appUrl}/auth/reset-password?token=${token}`;

    await this.mailerService.sendMail({
      to: email,
      subject: 'Reset your GoalXI password',
      template: 'password-reset',
      context: {
        email,
        url,
      },
    });
  }
}
