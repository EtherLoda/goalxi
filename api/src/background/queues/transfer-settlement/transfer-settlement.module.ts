import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'transfer-settlement',
    }),
  ],
  exports: [BullModule],
})
export class TransferQueueModule {}
