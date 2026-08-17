import { AllConfigType } from '@/config/config.type';
import MailerCustomLogger from '@/utils/mailer-custom-logger';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import { MailService } from './mail.service';

@Global()
@Module({
  imports: [
    MailerModule.forRootAsync({
      useFactory: (config: ConfigService<AllConfigType>) => {
        const user = config.get('mail.user', { infer: true });
        const pass = config.get('mail.password', { infer: true });
        // P1-#17: only attach `auth` when both user AND password
        // are configured. nodemailer treats a present-but-empty
        // auth object as "use AUTH with empty creds" which most
        // SMTP servers (Gmail/Outlook/etc.) reject with a confusing
        // 535 5.7.x. Skipping the key entirely is the supported
        // way to say "no auth, just opportunistic STARTTLS".
        const auth = user && pass ? { user, pass } : undefined;
        // P2-#25: route nodemailer through MailerCustomLogger when
        // MAIL_LOGGER_ENABLED=true so SMTP traffic shows up under
        // the NestJS logger. Default false to keep prod logs
        // readable; the class itself is always wired so it can be
        // toggled without a code change.
        const loggerEnabled = config.get('mail.loggerEnabled', {
          infer: true,
        });

        return {
          transport: {
            host: config.get('mail.host', { infer: true }),
            port: config.get('mail.port', { infer: true }),
            ignoreTLS: config.get('mail.ignoreTLS', { infer: true }),
            requireTLS: config.get('mail.requireTLS', { infer: true }),
            secure: config.get('mail.secure', { infer: true }),
            logger: loggerEnabled ? MailerCustomLogger.getInstance() : false,
            ...(auth ? { auth } : {}),
          },
          defaults: {
            from: `"${config.get('mail.defaultName', { infer: true })}" <${config.get('mail.defaultEmail', { infer: true })}>`,
          },
          template: {
            // nest-cli.json ships `**/*.hbs` as a build asset, so
            // this directory is also present under `dist/mail/templates`
            // after `pnpm build`. Do NOT use `process.cwd()` here —
            // it breaks when the API is started from a different
            // directory.
            dir: join(__dirname, 'templates'),
            adapter: new HandlebarsAdapter(),
            options: {
              strict: true,
            },
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
