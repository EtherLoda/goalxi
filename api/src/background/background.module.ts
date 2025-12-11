import { Module } from '@nestjs/common';
import { EmailQueueModule } from './queues/email-queue/email-queue.module';
import { MatchSimulationQueueModule } from './queues/match-simulation/match-simulation.module';
import { SchedulerModule } from '../scheduler/scheduler.module';
@Module({
  imports: [EmailQueueModule, MatchSimulationQueueModule, SchedulerModule],
})
export class BackgroundModule { }
