import {
  AuctionEntity,
  PlayerEntity,
  PlayerEventEntity,
  PlayerTransactionEntity,
  TeamEntity,
  TransferTransactionEntity,
} from '@goalxi/database';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransferQueueModule } from '../../background/queues/transfer-settlement/transfer-settlement.module';
import { AuthModule } from '../auth/auth.module';
import { FinanceModule } from '../finance/finance.module';
import { NotificationModule } from '../notification/notification.module';
import { AuctionService } from './auction.service';
import { TransferController } from './transfer.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PlayerTransactionEntity,
      PlayerEventEntity,
      AuctionEntity,
      PlayerEntity,
      TeamEntity,
      TransferTransactionEntity,
    ]),
    AuthModule,
    FinanceModule,
    TransferQueueModule,
    NotificationModule,
  ],
  controllers: [TransferController],
  providers: [AuctionService],
  exports: [AuctionService],
})
export class TransferModule {}
