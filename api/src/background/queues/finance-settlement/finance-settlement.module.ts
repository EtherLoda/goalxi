import { FinanceModule } from '@/api/finance/finance.module';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { FinanceSettlementProcessor } from './finance-settlement.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'finance-settlement',
    }),
    FinanceModule,
  ],
  providers: [FinanceSettlementProcessor],
  exports: [BullModule],
})
export class FinanceSettlementModule {}
