import { QueueName, QueuePrefix } from '@/constants/job.constant';
import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { EmailQueueEvents } from './email-queue.events';
import { EmailQueueService } from './email-queue.service';
import { EmailProcessor } from './email.processor';

@Global()
@Module({
  imports: [
    BullModule.registerQueue({
      name: QueueName.EMAIL,
      // P1-#16: moved under `notification:` prefix (was `auth:`)
      // so the email keyspace is no longer mixed with session
      // and token storage.
      prefix: QueuePrefix.NOTIFICATION,
      streams: {
        events: {
          maxLen: 1000,
        },
      },
    }),
  ],
  // P1-#14: export EmailQueueService so business code (e.g.
  // AuthService) can inject it and call addEmailVerification()
  // instead of having to InjectQueue the raw BullMQ queue itself.
  providers: [EmailQueueService, EmailProcessor, EmailQueueEvents],
  exports: [EmailQueueService, BullModule],
})
export class EmailQueueModule {}
