import { IEmailJob, IVerifyEmailJob } from '@/common/interfaces/job.interface';
import { JobName, QueueName } from '@/constants/job.constant';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EmailQueueService } from './email-queue.service';

// P1-#16: pulled out of the @Processor decorator so they can be
// reviewed/changed in one place. These are tuned for a single
// SMTP host that doesn't appreciate parallel connections; raise
// them if/when the queue is split into a real marketing stream.
const WORKER_CONCURRENCY = 1;
const STALLED_INTERVAL_MS = 5 * 60_000;
const DRAIN_DELAY_MS = 300;
// 1 job per 150ms = ~6.6 jobs/sec upper bound. Picked so we stay
// well under most SMTP providers' free-tier rate limits.
const RATE_LIMIT_MAX = 1;
const RATE_LIMIT_DURATION_MS = 150;
// Keep the most recent 100 completed jobs in Redis for 1 day.
// Anything older we don't need to introspect.
const COMPLETED_JOB_TTL_SECONDS = 86_400;
const COMPLETED_JOB_KEEP_COUNT = 100;
// Postfix-#3: BullMQ's default `removeOnFail` is undefined, so
// every failed email (e.g. hard-bounce 550 from the recipient
// domain) stayed in Redis forever. With 3 retry attempts the
// per-bounce footprint is small, but a single misconfigured
// recipient list (or a temporary sender-domain block) can pile
// up thousands of failed entries per day. Cap them at 7 days /
// 1000 entries; older ones get dropped, the cap keeps the set
// inspectable for ops.
const FAILED_JOB_TTL_SECONDS = 7 * 86_400;
const FAILED_JOB_KEEP_COUNT = 1_000;

@Processor(QueueName.EMAIL, {
  concurrency: WORKER_CONCURRENCY,
  drainDelay: DRAIN_DELAY_MS,
  stalledInterval: STALLED_INTERVAL_MS,
  removeOnComplete: {
    age: COMPLETED_JOB_TTL_SECONDS,
    count: COMPLETED_JOB_KEEP_COUNT,
  },
  // NestJS-BullMQ renames the raw BullMQ `removeOnFailed` to
  // `removeOnFail` in its decorator options; verified against
  // onboarding.service.ts which uses the same spelling.
  removeOnFail: {
    age: FAILED_JOB_TTL_SECONDS,
    count: FAILED_JOB_KEEP_COUNT,
  },
  limiter: {
    max: RATE_LIMIT_MAX,
    duration: RATE_LIMIT_DURATION_MS,
  },
})
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly emailQueueService: EmailQueueService) {
    super();
  }

  async process(
    job: Job<IEmailJob, any, string>,
    _token?: string,
  ): Promise<any> {
    this.logger.debug(
      `Processing job ${job.id} of type ${job.name} with data ${JSON.stringify(job.data)}...`,
    );

    switch (job.name) {
      case JobName.EMAIL_VERIFICATION:
        return await this.emailQueueService.sendEmailVerification(
          job.data as unknown as IVerifyEmailJob,
        );
      default:
        throw new Error(`Unknown job name: ${job.name}`);
    }
  }

  @OnWorkerEvent('active')
  async onActive(job: Job) {
    this.logger.debug(`Job ${job.id} is now active`);
  }

  @OnWorkerEvent('progress')
  async onProgress(job: Job) {
    this.logger.debug(`Job ${job.id} is ${job.progress}% complete`);
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: Job) {
    this.logger.debug(`Job ${job.id} has been completed`);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job) {
    this.logger.error(
      `Job ${job.id} has failed with reason: ${job.failedReason}`,
    );
    this.logger.error(job.stacktrace);
  }

  @OnWorkerEvent('stalled')
  async onStalled(job: Job) {
    this.logger.error(`Job ${job.id} has been stalled`);
  }

  @OnWorkerEvent('error')
  // P2-#31: was `onError(job: Job, error: Error)` — wrong signature
  // (BullMQ passes only the error). Kept single-arg, dropped the
  // `job` parameter the old comment claimed we needed.
  async onError(error: Error) {
    this.logger.error(
      `Email worker error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
