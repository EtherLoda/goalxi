export type MailConfig = {
  host?: string;
  port: number;
  user?: string;
  password?: string;
  ignoreTLS: boolean;
  secure: boolean;
  requireTLS: boolean;
  defaultEmail?: string;
  defaultName?: string;
  /**
   * P2-#25: pipe nodemailer's SMTP conversation through
   * `MailerCustomLogger` (a NestJS Logger adapter) instead of
   * swallowing it. Default off in production, can be flipped on
   * for debugging transport issues without redeploying.
   */
  loggerEnabled: boolean;
};
