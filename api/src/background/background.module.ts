import { Module } from '@nestjs/common';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { EmailQueueModule } from './queues/email-queue/email-queue.module';
import { FinanceSettlementModule } from './queues/finance-settlement/finance-settlement.module';
import { MatchCompletionModule } from './queues/match-completion/match-completion.module';

@Module({
  imports: [
    EmailQueueModule,
    MatchCompletionModule,
    FinanceSettlementModule,
    SchedulerModule,
  ],
})
export class BackgroundModule {}
