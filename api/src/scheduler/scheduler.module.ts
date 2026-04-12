import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerModule as SettlementSchedulerModule } from 'settlement/scheduler/scheduler.module';

@Module({
  imports: [ScheduleModule.forRoot(), SettlementSchedulerModule],
  exports: [SettlementSchedulerModule],
})
export class SchedulerModule {}
