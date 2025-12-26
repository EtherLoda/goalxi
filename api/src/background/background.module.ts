import { Module } from '@nestjs/common';
import { EmailQueueModule } from './queues/email-queue/email-queue.module';
import { MatchSimulationQueueModule } from './queues/match-simulation/match-simulation.module';
import { MatchCompletionModule } from './queues/match-completion/match-completion.module';
import { SchedulerModule } from '../scheduler/scheduler.module';
@Module({
  imports: [EmailQueueModule, MatchSimulationQueueModule, MatchCompletionModule, SchedulerModule],
})
export class BackgroundModule { }
