import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AuctionEntity,
  FinanceEntity,
  PlayerEntity,
  PlayerEventEntity,
  PlayerTransactionEntity,
  TeamEntity,
  TransactionEntity,
  TransferTransactionEntity,
} from '@goalxi/database';
import { TransferProcessor } from './processors/transfer.processor';
import { NotificationModule } from './notification/notification.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'transfer-settlement',
    }),
    TypeOrmModule.forFeature([
      AuctionEntity,
      FinanceEntity,
      PlayerEntity,
      PlayerEventEntity,
      PlayerTransactionEntity,
      TeamEntity,
      TransactionEntity,
      TransferTransactionEntity,
    ]),
    NotificationModule,
  ],
  providers: [TransferProcessor],
  exports: [BullModule],
})
export class TransferModule {}
