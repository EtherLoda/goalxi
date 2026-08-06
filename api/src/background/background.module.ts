import { Module } from '@nestjs/common';
// The scheduler lives in the `settlement` workspace; the
// `SchedulerModule` name alias keeps the import line short and
// avoids the two-namesake trap (both `api` and `settlement`
// export a class named `SchedulerModule`).
//   - `api/src/scheduler/scheduler.module.ts` was previously a
//     transparent alias re-exporting this. It only existed to
//     avoid the namesake; the alias was deleted and the import
//     is now direct. See #9 in the audit log.
import { SchedulerModule as SettlementSchedulerModule } from 'settlement/scheduler/scheduler.module';
import { EmailQueueModule } from './queues/email-queue/email-queue.module';
import { FinanceSettlementModule } from './queues/finance-settlement/finance-settlement.module';
import { MatchCompletionModule } from './queues/match-completion/match-completion.module';

@Module({
  imports: [
    EmailQueueModule,
    MatchCompletionModule,
    FinanceSettlementModule,
    SettlementSchedulerModule,
  ],
})
export class BackgroundModule {}
