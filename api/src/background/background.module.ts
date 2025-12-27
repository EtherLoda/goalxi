import { Module } from '@nestjs/common';
import { EmailQueueModule } from './queues/email-queue/email-queue.module';
import { MatchCompletionModule } from './queues/match-completion/match-completion.module';
import { SchedulerModule } from '../scheduler/scheduler.module';
@Module({
  imports: [EmailQueueModule, MatchCompletionModule, SchedulerModule],
})
export class BackgroundModule { }
