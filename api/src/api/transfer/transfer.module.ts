import {
  AuctionEntity,
  PlayerEntity,
  PlayerHistoryEntity,
  PlayerTransactionEntity,
  TeamEntity,
} from '@goalxi/database';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { FinanceModule } from '../finance/finance.module';
import { AuctionService } from './auction.service';
import { TransferController } from './transfer.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PlayerTransactionEntity,
      PlayerHistoryEntity,
      AuctionEntity,
      PlayerEntity,
      TeamEntity,
    ]),
    AuthModule,
    FinanceModule,
  ],
  controllers: [TransferController],
  providers: [AuctionService],
  exports: [AuctionService],
})
export class TransferModule {}
