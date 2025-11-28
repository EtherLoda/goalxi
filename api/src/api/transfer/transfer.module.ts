import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransferEntity } from './entities/transfer.entity';
import { PlayerHistoryEntity } from './entities/player-history.entity';
import { AuctionEntity } from './entities/auction.entity';
import { TransferService } from './transfer.service';
import { AuctionService } from './auction.service';
import { TransferController } from './transfer.controller';
import { AuthModule } from '../auth/auth.module';
import { FinanceModule } from '../finance/finance.module';
import { PlayerEntity } from '../player/entities/player.entity';
import { TeamEntity } from '../team/entities/team.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            TransferEntity,
            PlayerHistoryEntity,
            AuctionEntity,
            PlayerEntity,
            TeamEntity,
        ]),
        AuthModule,
        FinanceModule,
    ],
    controllers: [TransferController],
    providers: [TransferService, AuctionService],
    exports: [TransferService, AuctionService],
})
export class TransferModule { }
