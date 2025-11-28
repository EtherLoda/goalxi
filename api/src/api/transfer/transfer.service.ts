import { Uuid } from '@/common/types/common.type';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { TransferEntity, TransferStatus } from './entities/transfer.entity';
import { PlayerHistoryEntity, PlayerHistoryType } from './entities/player-history.entity';
import { PlayerEntity } from '../player/entities/player.entity';
import { TeamEntity } from '../team/entities/team.entity';
import { FinanceService } from '../finance/finance.service';
import { ListPlayerReqDto } from './dto/list-player.req.dto';
import { TransactionType } from '../finance/finance.constants';

@Injectable()
export class TransferService {
    constructor(
        @InjectRepository(TransferEntity)
        private readonly transferRepo: Repository<TransferEntity>,
        @InjectRepository(PlayerHistoryEntity)
        private readonly historyRepo: Repository<PlayerHistoryEntity>,
        @InjectRepository(PlayerEntity)
        private readonly playerRepo: Repository<PlayerEntity>,
        @InjectRepository(TeamEntity)
        private readonly teamRepo: Repository<TeamEntity>,
        private readonly financeService: FinanceService,
        private readonly dataSource: DataSource,
    ) { }

    async findAll() {
        return this.transferRepo.find({
            where: { status: TransferStatus.LISTED },
            relations: ['player', 'fromTeam'],
            order: { createdAt: 'DESC' },
        });
    }

    async listPlayer(userId: Uuid, dto: ListPlayerReqDto): Promise<TransferEntity> {
        const team = await this.teamRepo.findOneBy({ userId });
        if (!team) throw new NotFoundException('User has no team');

        const player = await this.playerRepo.findOneBy({ id: dto.playerId as Uuid });
        if (!player) throw new NotFoundException('Player not found');

        if (player.teamId !== team.id) {
            throw new BadRequestException('You do not own this player');
        }

        // Check if already listed
        const existingTransfer = await this.transferRepo.findOne({
            where: {
                playerId: player.id,
                status: TransferStatus.LISTED,
            },
        });

        if (existingTransfer) {
            throw new BadRequestException('Player is already listed');
        }

        const transfer = new TransferEntity({
            playerId: player.id,
            fromTeamId: team.id,
            price: dto.price,
            status: TransferStatus.LISTED,
        });

        return this.transferRepo.save(transfer);
    }
}
