import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlayerTransactionEntity } from './entities/player-transaction.entity';
import { PlayerHistoryEntity } from './entities/player-history.entity';
import { AuctionEntity } from './entities/auction.entity';
import { AuctionService } from './auction.service';
import { TransferController } from './transfer.controller';
import { AuthModule } from '../auth/auth.module';
import { FinanceModule } from '../finance/finance.module';
import { PlayerEntity } from '../player/entities/player.entity';
import { TeamEntity } from '../team/entities/team.entity';

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
