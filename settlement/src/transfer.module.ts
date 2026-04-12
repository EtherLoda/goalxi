import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AuctionEntity,
  PlayerEntity,
  PlayerHistoryEntity,
  PlayerTransactionEntity,
  TeamEntity,
  TransferTransactionEntity,
} from '@goalxi/database';
import { TransferProcessor } from './processors/transfer.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'transfer-settlement',
    }),
    TypeOrmModule.forFeature([
      AuctionEntity,
      PlayerEntity,
      PlayerHistoryEntity,
      PlayerTransactionEntity,
      TeamEntity,
      TransferTransactionEntity,
    ]),
  ],
  providers: [TransferProcessor],
  exports: [BullModule],
})
export class TransferModule {}
