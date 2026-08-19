import {
  IForgotPasswordJob,
  IVerifyEmailJob,
} from '@/common/interfaces/job.interface';
import { JobName, QueueName } from '@/constants/job.constant';
import { MailService } from '@/mail/mail.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

/**
 * P1-#13 / P1-#14:
 *
 * This service is the single API the rest of the app uses to enqueue
 * email jobs, and is also the dispatch point on the worker side. It
 * replaces the previous "AuthService calls InjectQueue directly +
 * worker forwards to a one-line service" indirection with a single
 * typed entry point.
 *
 * Producer side (callers like AuthService):
 *   `this.emailQueue.addEmailVerification(email, token)`
 *
 * Consumer side (EmailProcessor):
 *   routes the deserialised payload straight into `sendEmailVerification`
 *   which is just a thin pass-through to MailService.
 */
@Injectable()
export class EmailQueueService {
  private readonly logger = new Logger(EmailQueueService.name);

  constructor(
    @InjectQueue(QueueName.EMAIL) private readonly queue: Queue,
    private readonly mailService: MailService,
  ) {}

  /**
   * Producer-side: enqueue an email-verification job.
   * BullMQ retries (3 attempts, exponential backoff) are configured
   * here so callers don't have to remember the right knob.
   */
  async addEmailVerification(email: string, token: string): Promise<void> {
    await this.queue.add(
      JobName.EMAIL_VERIFICATION,
      { email, token } satisfies IVerifyEmailJob,
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
      },
    );
  }

  /**
   * Producer-side: enqueue a password-reset email. Same retry /
   * backoff profile as the verification email — both go through
   * the same SMTP relay so the queue's rate limiter caps them
   * together.
   */
  async addPasswordResetEmail(
    userId: string,
    email: string,
    token: string,
  ): Promise<void> {
    await this.queue.add(
      JobName.EMAIL_PASSWORD_RESET,
      { userId, email, token } satisfies IForgotPasswordJob,
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
      },
    );
  }

  /**
   * Consumer-side: process a deserialised verification job.
   * Kept on this service (rather than inlined into the processor)
   * so the processor stays a tiny switch and the actual side
   * effect has a unit-testable surface.
   */
  async sendEmailVerification(data: IVerifyEmailJob): Promise<void> {
    this.logger.debug(`Sending email verification to ${data.email}`);
    await this.mailService.sendEmailVerification(data.email, data.token);
  }

  /**
   * Consumer-side: process a deserialised password-reset job.
   * Same pattern as `sendEmailVerification` — keep the
   * side-effect on the service so the processor stays a tiny
   * switch and the actual call has a unit-testable surface.
   */
  async sendPasswordResetEmail(data: IForgotPasswordJob): Promise<void> {
    this.logger.debug(`Sending password reset email to ${data.email}`);
    await this.mailService.sendPasswordReset(data.email, data.token);
  }
}
