/**
 * Regression specs for EmailQueueService.
 *
 * Covers the P1 refactor where the service became both the
 * producer-side enqueue API (used by AuthService) and the
 * consumer-side dispatch (used by EmailProcessor).
 */
import { IVerifyEmailJob } from '@/common/interfaces/job.interface';
import { JobName, QueueName } from '@/constants/job.constant';
import { MailService } from '@/mail/mail.service';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import { EmailQueueService } from './email-queue.service';

describe('EmailQueueService', () => {
  let service: EmailQueueService;
  let mailService: { sendEmailVerification: jest.Mock };
  let queue: { add: jest.Mock };

  beforeEach(async () => {
    mailService = { sendEmailVerification: jest.fn() };
    queue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailQueueService,
        { provide: MailService, useValue: mailService },
        { provide: getQueueToken(QueueName.EMAIL), useValue: queue },
      ],
    }).compile();

    service = module.get<EmailQueueService>(EmailQueueService);
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  describe('addEmailVerification (producer side)', () => {
    it('enqueues an EMAIL_VERIFICATION job with the typed payload', async () => {
      await service.addEmailVerification('a@b.com', 'tok-1');
      expect(queue.add).toHaveBeenCalledWith(
        JobName.EMAIL_VERIFICATION,
        { email: 'a@b.com', token: 'tok-1' },
        expect.objectContaining({
          attempts: 3,
          backoff: expect.objectContaining({ type: 'exponential' }),
        }),
      );
    });

    it('centralises retry/backoff so callers do not re-invent them', async () => {
      // P1-#16: the retry policy used to live in auth.service.ts
      // as `{ attempts: 3, backoff: { type: 'exponential', delay: 60000 } }`.
      // Anyone adding a second caller would have to remember to
      // copy those numbers. Pin the values here.
      await service.addEmailVerification('a@b.com', 'tok');
      const opts = queue.add.mock.calls[0][2];
      expect(opts.attempts).toBe(3);
      expect(opts.backoff.delay).toBe(60_000);
    });
  });

  describe('sendEmailVerification (consumer side)', () => {
    it('forwards the deserialised payload to MailService', async () => {
      const payload = { email: 'a@b.com', token: 'tok' } as IVerifyEmailJob;
      await service.sendEmailVerification(payload);
      expect(mailService.sendEmailVerification).toHaveBeenCalledWith(
        'a@b.com',
        'tok',
      );
    });
  });
});
