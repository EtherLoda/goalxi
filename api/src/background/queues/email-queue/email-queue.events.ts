import { QueueName } from '@/constants/job.constant';
import {
  OnQueueEvent,
  QueueEventsHost,
  QueueEventsListener,
} from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';

/**
 * Queue-level event listener for the email queue.
 *
 * P1-#15: the previous version of this file had three additional
 * @OnQueueEvent handlers commented out, and a duplicate "active"
 * handler that was already covered by EmailProcessor's
 * @OnWorkerEvent. The dead branches made it look like the queue
 * events were wired when they weren't. We keep only the two
 * handlers that are actually distinct from the worker-side
 * ones — "added" and "waiting" — which are useful for
 * observability (you can see the queue is being fed) without
 * doubling up on completion/failure logs.
 */
@QueueEventsListener(QueueName.EMAIL, { blockingTimeout: 300_000 })
export class EmailQueueEvents extends QueueEventsHost {
  private readonly logger = new Logger(EmailQueueEvents.name);

  @OnQueueEvent('added')
  onAdded(job: { jobId: string; name: string }) {
    this.logger.debug(
      `Job ${job.jobId} of type ${job.name} has been added to the queue`,
    );
  }

  @OnQueueEvent('waiting')
  onWaiting(job: { jobId: string; prev?: string }) {
    this.logger.debug(`Job ${job.jobId} is waiting`);
  }
}
