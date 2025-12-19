import { Uuid } from '@/common/types/common.type';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
    AuctionEntity,
    AuctionStatus,
    PlayerEntity,
    TeamEntity,
    PlayerHistoryEntity,
    PlayerHistoryType,
    TransactionType,
    FinanceEntity,
    TransactionEntity,
    PlayerTransactionEntity,
} from '@goalxi/database';
import { FinanceService } from '../finance/finance.service';
import { CreateAuctionReqDto } from './dto/create-auction.req.dto';
import { PlaceBidReqDto } from './dto/place-bid.req.dto';
import { AUCTION_CONFIG } from './auction.constants';

@Injectable()
export class AuctionService {
    constructor(
        @InjectRepository(AuctionEntity)
        private readonly auctionRepo: Repository<AuctionEntity>,
        @InjectRepository(PlayerEntity)
        private readonly playerRepo: Repository<PlayerEntity>,
        @InjectRepository(TeamEntity)
        private readonly teamRepo: Repository<TeamEntity>,
        @InjectRepository(PlayerHistoryEntity)
        private readonly historyRepo: Repository<PlayerHistoryEntity>,
        private readonly financeService: FinanceService,
        private readonly dataSource: DataSource,
    ) { }

    async findAllActive() {
        return this.auctionRepo.find({
            where: { status: AuctionStatus.ACTIVE },
            relations: ['player', 'team', 'currentBidder'],
            order: { expiresAt: 'ASC' },
        });
    }

    async createAuction(userId: Uuid, dto: CreateAuctionReqDto): Promise<AuctionEntity> {
        const team = await this.teamRepo.findOneBy({ userId });
        if (!team) throw new NotFoundException('User has no team');

        const player = await this.playerRepo.findOneBy({ id: dto.playerId as Uuid });
        if (!player) throw new NotFoundException('Player not found');

        if (player.teamId !== team.id) {
            throw new BadRequestException('You do not own this player');
        }

        // Check if already in auction
        const existingAuction = await this.auctionRepo.findOne({
            where: {
                playerId: player.id,
                status: AuctionStatus.ACTIVE,
            },
        });

        if (existingAuction) {
            throw new BadRequestException('Player is already in auction');
        }

        if (dto.buyoutPrice <= dto.startPrice) {
            throw new BadRequestException('Buyout price must be higher than start price');
        }

        const now = new Date();
        const endsAt = new Date(now.getTime() + dto.durationHours * 60 * 60 * 1000);

        const auction = new AuctionEntity({
            playerId: player.id,
            teamId: team.id,
            startPrice: dto.startPrice,
            buyoutPrice: dto.buyoutPrice,
            currentPrice: dto.startPrice,
            startedAt: now,
            expiresAt: endsAt,
            bidHistory: [],
            status: AuctionStatus.ACTIVE,
        });

        return this.auctionRepo.save(auction);
    }

    async placeBid(userId: Uuid, auctionId: Uuid, dto: PlaceBidReqDto): Promise<AuctionEntity> {
        return this.dataSource.transaction(async (manager) => {
            const auctionRepo = manager.getRepository(AuctionEntity);
            const playerRepo = manager.getRepository(PlayerEntity);
            const historyRepo = manager.getRepository(PlayerHistoryEntity);

            const bidderTeam = await manager.findOne(TeamEntity, { where: { userId } });
            if (!bidderTeam) throw new NotFoundException('Bidder team not found');

            const auction = await auctionRepo.findOne({
                where: { id: auctionId },
                relations: ['team', 'player'],
            });
            if (!auction) throw new NotFoundException('Auction not found');
            if (auction.status !== AuctionStatus.ACTIVE) throw new BadRequestException('Auction is not active');
            if (auction.teamId === bidderTeam.id) throw new BadRequestException('Cannot bid on your own auction');

            const now = new Date();
            if (now > auction.expiresAt) {
                throw new BadRequestException('Auction has ended');
            }

            // Check if buyout price
            if (dto.amount >= auction.buyoutPrice) {
                return this.completeBuyout(manager, auction, bidderTeam, dto.amount);
            }

            // Regular bid validation
            const minBid = auction.currentPrice + AUCTION_CONFIG.MIN_BID_INCREMENT;
            if (dto.amount < minBid) {
                throw new BadRequestException(`Minimum bid is ${minBid}`);
            }

            // Check funds
            const bidderFinance = await manager.findOne(FinanceEntity, { where: { teamId: bidderTeam.id } });
            if (!bidderFinance || bidderFinance.balance < dto.amount) {
                throw new BadRequestException('Insufficient funds');
            }

            // Update auction
            auction.currentPrice = dto.amount;
            auction.currentBidderId = bidderTeam.id;
            auction.bidHistory.push({
                teamId: bidderTeam.id,
                amount: dto.amount,
                timestamp: now.toISOString(),
            });

            // Check if bid is in last X minutes - extend time
            const timeLeft = auction.expiresAt.getTime() - now.getTime();
            const thresholdMs = AUCTION_CONFIG.EXTENSION_THRESHOLD_MINUTES * 60 * 1000;

            if (timeLeft < thresholdMs) {
                auction.expiresAt = new Date(now.getTime() + thresholdMs);
            }

            await auctionRepo.save(auction);

            return auction;
        });
    }

    async buyout(userId: Uuid, auctionId: Uuid): Promise<AuctionEntity> {
        return this.dataSource.transaction(async (manager) => {
            const buyerTeam = await manager.findOne(TeamEntity, { where: { userId } });
            if (!buyerTeam) throw new NotFoundException('Buyer team not found');

            const auction = await manager.findOne(AuctionEntity, {
                where: { id: auctionId },
                relations: ['team', 'player'],
            });
            if (!auction) throw new NotFoundException('Auction not found');
            if (auction.status !== AuctionStatus.ACTIVE) throw new BadRequestException('Auction is not active');
            if (auction.teamId === buyerTeam.id) throw new BadRequestException('Cannot buy your own auction');

            const now = new Date();
            if (now > auction.expiresAt) {
                throw new BadRequestException('Auction has ended');
            }

            return this.completeBuyout(manager, auction, buyerTeam, auction.buyoutPrice);
        });
    }

    private async completeBuyout(
        manager: any,
        auction: AuctionEntity,
        buyerTeam: TeamEntity,
        amount: number,
    ): Promise<AuctionEntity> {
        const auctionRepo = manager.getRepository(AuctionEntity);
        const playerRepo = manager.getRepository(PlayerEntity);
        const historyRepo = manager.getRepository(PlayerHistoryEntity);

        // Check funds
        const buyerFinance = await manager.findOne(FinanceEntity, { where: { teamId: buyerTeam.id } });
        if (!buyerFinance || buyerFinance.balance < amount) {
            throw new BadRequestException('Insufficient funds');
        }

        const sellerFinance = await manager.findOne(FinanceEntity, { where: { teamId: auction.teamId } });
        if (!sellerFinance) throw new BadRequestException('Seller finance not found');

        // Process money
        buyerFinance.balance -= amount;
        sellerFinance.balance += amount;
        await manager.save(buyerFinance);
        await manager.save(sellerFinance);

        // Create finance transactions
        const season = 1; // TODO: Get current season
        const buyerTx = new TransactionEntity({
            teamId: buyerTeam.id,
            amount: -amount,
            type: TransactionType.TRANSFER_OUT,
            season,
        });
        const sellerTx = new TransactionEntity({
            teamId: auction.teamId,
            amount: amount,
            type: TransactionType.TRANSFER_IN,
            season,
        });
        await manager.save(buyerTx);
        await manager.save(sellerTx);

        // Transfer player
        const player = await playerRepo.findOneByOrFail({ id: auction.playerId });
        player.teamId = buyerTeam.id;
        await manager.save(player);

        // Update auction
        auction.status = AuctionStatus.SOLD;
        auction.currentBidderId = buyerTeam.id;
        auction.currentPrice = amount;
        auction.endsAt = new Date();
        auction.bidHistory.push({
            teamId: buyerTeam.id,
            amount,
            timestamp: new Date().toISOString(),
        });
        await auctionRepo.save(auction);

        // Create player history
        const history = new PlayerHistoryEntity({
            playerId: player.id,
            season,
            date: new Date(),
            eventType: PlayerHistoryType.TRANSFER,
            details: {
                fromTeamId: auction.teamId,
                toTeamId: buyerTeam.id,
                price: amount,
                auctionId: auction.id,
            },
        });
        await manager.save(history);

        // Create player transaction record
        const transaction = new PlayerTransactionEntity({
            playerId: player.id,
            fromTeamId: auction.teamId,
            toTeamId: buyerTeam.id,
            price: amount,
            season,
            transactionDate: new Date(),
            auctionId: auction.id,
        });
        await manager.save(transaction);

        return auction;
    }

    // This should be called by a cron job to finalize expired auctions
    async finalizeExpiredAuctions(): Promise<void> {
        const now = new Date();
        const expiredAuctions = await this.auctionRepo.find({
            where: { status: AuctionStatus.ACTIVE },
        });

        for (const auction of expiredAuctions) {
            if (auction.expiresAt <= now) {
                if (auction.currentBidderId) {
                    // Has winner - complete the sale
                    await this.dataSource.transaction(async (manager) => {
                        const buyerTeam = await manager.findOneOrFail(TeamEntity, {
                            where: { id: auction.currentBidderId },
                        });
                        await this.completeBuyout(manager, auction, buyerTeam, auction.currentPrice);
                    });
                } else {
                    // No bids - mark as expired
                    auction.status = AuctionStatus.EXPIRED;
                    auction.endsAt = now;
                    await this.auctionRepo.save(auction);
                }
            }
        }
    }
}
