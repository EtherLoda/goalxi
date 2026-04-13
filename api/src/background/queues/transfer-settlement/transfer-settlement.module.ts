import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'transfer-settlement',
    }),
  ],
  exports: [BullModule],
})
export class TransferQueueModule {}
