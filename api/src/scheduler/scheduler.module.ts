import { Module } from '@nestjs/common';
import { SchedulerModule as SettlementSchedulerModule } from 'settlement/scheduler/scheduler.module';

@Module({
    imports: [SettlementSchedulerModule],
    exports: [SettlementSchedulerModule],
})
export class SchedulerModule {}
