import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
    PlayerTransactionEntity,
    PlayerHistoryEntity,
    AuctionEntity,
    PlayerEntity,
    TeamEntity,
} from '@goalxi/database';
import { AuctionService } from './auction.service';
import { TransferController } from './transfer.controller';
import { AuthModule } from '../auth/auth.module';
import { FinanceModule } from '../finance/finance.module';

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
export class TransferModule { }
