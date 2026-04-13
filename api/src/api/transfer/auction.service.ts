import { Uuid } from '@/common/types/common.type';
import {
  AuctionEntity,
  AuctionStatus,
  PlayerEntity,
  PlayerHistoryEntity,
  TeamEntity,
  TransferTransactionEntity,
  TransferTransactionStatus,
  TransferTransactionType,
} from '@goalxi/database';
import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { DataSource, In, Repository } from 'typeorm';
import { FinanceService } from '../finance/finance.service';
import { AUCTION_CONFIG, calculateMinBidIncrement } from './auction.constants';
import { CreateAuctionReqDto } from './dto/create-auction.req.dto';
import { PlaceBidReqDto } from './dto/place-bid.req.dto';

interface TransferSettlementJobData {
  type: 'BUYOUT' | 'AUCTION_COMPLETE';
  transactionId: string;
  auctionId: string;
  playerId: string;
  buyerTeamId: string;
  sellerTeamId: string;
  amount: number;
  timestamp: number;
}

@Injectable()
export class AuctionService implements OnModuleInit {
  private readonly logger = new Logger(AuctionService.name);

  constructor(
    @InjectRepository(AuctionEntity)
    private readonly auctionRepo: Repository<AuctionEntity>,
    @InjectRepository(PlayerEntity)
    private readonly playerRepo: Repository<PlayerEntity>,
    @InjectRepository(TeamEntity)
    private readonly teamRepo: Repository<TeamEntity>,
    @InjectRepository(PlayerHistoryEntity)
    private readonly historyRepo: Repository<PlayerHistoryEntity>,
    @InjectRepository(TransferTransactionEntity)
    private readonly transferTxRepo: Repository<TransferTransactionEntity>,
    private readonly financeService: FinanceService,
    @InjectQueue('transfer-settlement')
    private readonly transferQueue: Queue<TransferSettlementJobData>,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    this.logger.log('Running auction recovery on startup...');
    await this.recoverStuckSettlingAuctions();
    await this.extendExpiredAuctions();
    this.logger.log('Auction recovery completed.');
  }

  /**
   * Find auctions stuck in SETTLING state and re-enqueue their settlement.
   * This handles cases where server crashed after setting SETTLING but before job was processed.
   */
  private async recoverStuckSettlingAuctions(): Promise<void> {
    const settlingAuctions = await this.auctionRepo.find({
      where: { status: AuctionStatus.SETTLING },
    });

    if (settlingAuctions.length === 0) {
      return;
    }

    this.logger.log(
      `Found ${settlingAuctions.length} auctions in SETTLING state`,
    );

    for (const auction of settlingAuctions) {
      // Check if there's a transaction for this auction
      const tx = await this.transferTxRepo.findOne({
        where: { auctionId: auction.id },
        order: { createdAt: 'DESC' },
      });

      if (!tx) {
        // No transaction exists - re-enqueue settlement
        this.logger.warn(
          `Auction ${auction.id} has SETTLING but no transaction, re-enqueuing`,
        );
        await this.enqueueSettlement(auction);
      } else if (tx.status === TransferTransactionStatus.COMPLETED) {
        // Already completed - just update auction status to SOLD
        this.logger.log(
          `Auction ${auction.id} already completed, updating to SOLD`,
        );
        await this.auctionRepo.update(auction.id, {
          status: AuctionStatus.SOLD,
        });
      } else if (tx.status === TransferTransactionStatus.FAILED) {
        // Failed - reset auction and player
        this.logger.log(`Auction ${auction.id} settlement failed, resetting`);
        await this.auctionRepo.update(auction.id, {
          status: AuctionStatus.CANCELLED,
        });
        await this.playerRepo.update(auction.playerId as Uuid, {
          onTransfer: false,
        });
      }
      // PENDING/PROCESSING will be picked up by settlement processor when it runs
    }
  }

  /**
   * Extend auctions that expired during server downtime.
   * Bidders get compensated for the time they couldn't bid.
   */
  private async extendExpiredAuctions(): Promise<void> {
    const DOWNTIME_EXTENSION_MINUTES = 5; // Minimum 5 minutes extension

    const activeAuctions = await this.auctionRepo.find({
      where: { status: AuctionStatus.ACTIVE },
    });

    const now = new Date();
    let extendedCount = 0;

    for (const auction of activeAuctions) {
      if (auction.expiresAt < now) {
        const downtimeMs = now.getTime() - auction.expiresAt.getTime();
        const extensionMs = Math.max(
          DOWNTIME_EXTENSION_MINUTES * 60 * 1000,
          downtimeMs,
        );
        auction.expiresAt = new Date(now.getTime() + extensionMs);
        await this.auctionRepo.save(auction);
        extendedCount++;
      }
    }

    if (extendedCount > 0) {
      this.logger.log(
        `Extended ${extendedCount} auctions that expired during downtime`,
      );
    }
  }

  /**
   * Enqueue a settlement job for an auction.
   */
  private async enqueueSettlement(auction: AuctionEntity): Promise<void> {
    const now = new Date();
    const type = auction.currentBidderId ? 'AUCTION_COMPLETE' : 'BUYOUT';
    const amount = auction.currentBidderId
      ? auction.currentPrice
      : auction.buyoutPrice;
    const buyerTeamId = auction.currentBidderId || auction.teamId;

    const jobData: TransferSettlementJobData = {
      type,
      transactionId: '', // Will be created in the settlement
      auctionId: auction.id,
      playerId: auction.playerId,
      buyerTeamId,
      sellerTeamId: auction.teamId,
      amount,
      timestamp: now.getTime(),
    };

    await this.transferQueue.add('transfer-settlement', jobData, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    });
  }

  async findAllActive() {
    // Include both ACTIVE and SETTLING auctions
    const auctions = await this.auctionRepo.find({
      where: [
        { status: AuctionStatus.ACTIVE },
        { status: AuctionStatus.SETTLING },
      ],
      relations: ['player', 'team', 'currentBidder'],
      order: { expiresAt: 'ASC' },
    });

    // Enrich bidHistory with team names
    for (const auction of auctions) {
      if (auction.bidHistory && auction.bidHistory.length > 0) {
        const teamIds = [
          ...new Set(auction.bidHistory.map((bid: any) => bid.teamId)),
        ];
        const teams = await this.teamRepo.find({
          where: { id: In(teamIds) },
          select: ['id', 'name'],
        });
        const teamMap = new Map(teams.map((t) => [t.id, t.name]));

        auction.bidHistory = auction.bidHistory.map((bid: any) => ({
          ...bid,
          teamName: teamMap.get(bid.teamId) || 'Unknown Team',
        }));
      }

      // Compute player age from getExactAge() method and add to player object
      if (auction.player) {
        const [age, ageDays] = auction.player.getExactAge();
        // Convert to plain object with computed age fields for serialization
        auction.player = {
          ...auction.player,
          age,
          ageDays,
        } as any;
      }
    }

    return auctions;
  }

  async createAuction(
    userId: Uuid,
    dto: CreateAuctionReqDto,
  ): Promise<AuctionEntity> {
    const team = await this.teamRepo.findOneBy({ userId });
    if (!team) throw new NotFoundException('User has no team');

    const player = await this.playerRepo.findOneBy({
      id: dto.playerId as Uuid,
    });
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
      throw new BadRequestException(
        'Buyout price must be higher than start price',
      );
    }

    const now = new Date();
    const durationHours =
      dto.durationHours ?? AUCTION_CONFIG.DEFAULT_DURATION_HOURS;
    const endsAt = new Date(now.getTime() + durationHours * 60 * 60 * 1000);

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

    // Mark player as on transfer
    player.onTransfer = true;
    await this.playerRepo.save(player);

    return this.auctionRepo.save(auction);
  }

  async placeBid(
    userId: Uuid,
    auctionId: Uuid,
    dto: PlaceBidReqDto,
  ): Promise<{ auction: AuctionEntity; lockedAmount: number }> {
    return this.dataSource.transaction(async (manager) => {
      const auctionRepo = manager.getRepository(AuctionEntity);
      const teamRepo = manager.getRepository(TeamEntity);

      const bidderTeam = await teamRepo.findOne({
        where: { userId },
      });
      if (!bidderTeam) throw new NotFoundException('Bidder team not found');

      // Use pessimistic lock to prevent concurrent bid conflicts
      const auction = await manager
        .createQueryBuilder(AuctionEntity, 'auction')
        .where('auction.id = :id', { id: auctionId })
        .setLock('pessimistic_write')
        .getOne();
      if (!auction) throw new NotFoundException('Auction not found');
      if (auction.status !== AuctionStatus.ACTIVE)
        throw new BadRequestException('Auction is not active');
      if (auction.teamId === bidderTeam.id)
        throw new BadRequestException('Cannot bid on your own auction');

      const now = new Date();
      if (now > auction.expiresAt) {
        throw new BadRequestException('Auction has ended');
      }

      // Calculate minimum bid
      const hasBids = auction.bidHistory && auction.bidHistory.length > 0;
      const isFirstBid =
        !hasBids || (auction.currentPrice === auction.startPrice && !hasBids);

      const minBid = isFirstBid
        ? auction.startPrice
        : auction.currentPrice + calculateMinBidIncrement(auction.currentPrice);

      if (dto.amount < minBid) {
        throw new BadRequestException(`Minimum bid is ${minBid}`);
      }

      // Check available funds (cash - lockedCash)
      const availableCash = bidderTeam.cash - bidderTeam.lockedCash;
      if (availableCash < dto.amount) {
        throw new BadRequestException(
          `Insufficient funds. Available: ${availableCash}, Required: ${dto.amount}`,
        );
      }

      // If there's a previous bidder, release their locked cash
      if (auction.currentBidderId && auction.bidLockAmount) {
        await teamRepo.decrement(
          { id: auction.currentBidderId },
          'lockedCash',
          auction.bidLockAmount,
        );
      }

      // Lock new bidder's cash
      bidderTeam.lockedCash += dto.amount;
      await teamRepo.save(bidderTeam);

      // Update auction
      auction.currentPrice = dto.amount;
      auction.currentBidderId = bidderTeam.id;
      auction.bidLockAmount = dto.amount;
      auction.bidHistory.push({
        teamId: bidderTeam.id,
        amount: dto.amount,
        timestamp: now.toISOString(),
      });

      // Extend time if needed
      const timeLeft = auction.expiresAt.getTime() - now.getTime();
      const thresholdMs =
        AUCTION_CONFIG.EXTENSION_THRESHOLD_MINUTES * 60 * 1000;
      if (timeLeft < thresholdMs) {
        auction.expiresAt = new Date(now.getTime() + thresholdMs);
      }

      await auctionRepo.save(auction);

      return { auction, lockedAmount: dto.amount };
    });
  }

  async buyout(
    userId: Uuid,
    auctionId: Uuid,
  ): Promise<{
    success: boolean;
    transactionId: string;
    status: string;
    message: string;
  }> {
    return this.dataSource.transaction(async (manager) => {
      const auctionRepo = manager.getRepository(AuctionEntity);
      const teamRepo = manager.getRepository(TeamEntity);
      const transferTxRepo = manager.getRepository(TransferTransactionEntity);

      const buyerTeam = await teamRepo.findOne({
        where: { userId },
      });
      if (!buyerTeam) throw new NotFoundException('Buyer team not found');

      // Use pessimistic lock to prevent concurrent buyout conflicts
      const auction = await manager
        .createQueryBuilder(AuctionEntity, 'auction')
        .where('auction.id = :id', { id: auctionId })
        .setLock('pessimistic_write')
        .getOne();
      if (!auction) throw new NotFoundException('Auction not found');
      if (auction.status !== AuctionStatus.ACTIVE)
        throw new BadRequestException('Auction is not active');
      if (auction.teamId === buyerTeam.id)
        throw new BadRequestException('Cannot buy your own auction');

      const now = new Date();
      if (now > auction.expiresAt) {
        throw new BadRequestException('Auction has ended');
      }

      // Check available funds
      const availableCash = buyerTeam.cash - buyerTeam.lockedCash;
      if (availableCash < auction.buyoutPrice) {
        throw new BadRequestException(
          `Insufficient funds. Available: ${availableCash}, Required: ${auction.buyoutPrice}`,
        );
      }

      // If buyer had a bid on this auction, release the lock first
      if (auction.currentBidderId === buyerTeam.id && auction.bidLockAmount) {
        buyerTeam.lockedCash -= auction.bidLockAmount;
        await teamRepo.save(buyerTeam);
      }

      // Create transfer transaction
      const transaction = manager.create(TransferTransactionEntity, {
        auctionId: auction.id,
        playerId: auction.playerId,
        fromTeamId: auction.teamId,
        toTeamId: buyerTeam.id,
        amount: auction.buyoutPrice,
        type: TransferTransactionType.BUYOUT,
        status: TransferTransactionStatus.PENDING,
      });
      await manager.save(transaction);

      // Update auction status
      auction.status = AuctionStatus.SETTLING;
      auction.currentBidderId = buyerTeam.id;
      auction.currentPrice = auction.buyoutPrice;
      auction.endsAt = new Date();
      auction.bidHistory.push({
        teamId: buyerTeam.id,
        amount: auction.buyoutPrice,
        timestamp: now.toISOString(),
      });
      await auctionRepo.save(auction);

      // Enqueue settlement job
      const jobData: TransferSettlementJobData = {
        type: 'BUYOUT',
        transactionId: transaction.id,
        auctionId: auction.id,
        playerId: auction.playerId,
        buyerTeamId: buyerTeam.id,
        sellerTeamId: auction.teamId,
        amount: auction.buyoutPrice,
        timestamp: now.getTime(),
      };
      await this.transferQueue.add('transfer-settlement', jobData, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      });

      return {
        success: true,
        transactionId: transaction.id,
        status: 'PROCESSING',
        message:
          'Buyout is being processed. Player will be transferred shortly.',
      };
    });
  }

  // Called by cron job to finalize expired auctions
  @Cron('0 * * * * *') // Every minute
  async finalizeExpiredAuctions(): Promise<void> {
    const now = new Date();
    const expiredAuctions = await this.auctionRepo.find({
      where: { status: AuctionStatus.ACTIVE },
    });

    for (const auction of expiredAuctions) {
      if (auction.expiresAt <= now) {
        // Check if auction already has a pending/processing transaction (idempotency)
        const existingTx = await this.transferTxRepo.findOne({
          where: { auctionId: auction.id },
          order: { createdAt: 'DESC' },
        });

        if (
          existingTx &&
          existingTx.status !== TransferTransactionStatus.FAILED
        ) {
          // Already has a transaction that's not failed, skip
          continue;
        }

        if (auction.currentBidderId) {
          // Has winner - create transaction and enqueue
          await this.dataSource.transaction(async (manager) => {
            const auctionRepo = manager.getRepository(AuctionEntity);
            const transferTxRepo = manager.getRepository(
              TransferTransactionEntity,
            );

            // Create transfer transaction
            const transaction = manager.create(TransferTransactionEntity, {
              auctionId: auction.id,
              playerId: auction.playerId,
              fromTeamId: auction.teamId,
              toTeamId: auction.currentBidderId,
              amount: auction.currentPrice,
              type: TransferTransactionType.AUCTION_COMPLETE,
              status: TransferTransactionStatus.PENDING,
            });
            await manager.save(transaction);

            // Update auction status
            await auctionRepo.update(auction.id, {
              status: AuctionStatus.SETTLING,
            });

            // Enqueue settlement job
            const jobData: TransferSettlementJobData = {
              type: 'AUCTION_COMPLETE',
              transactionId: transaction.id,
              auctionId: auction.id,
              playerId: auction.playerId,
              buyerTeamId: auction.currentBidderId,
              sellerTeamId: auction.teamId,
              amount: auction.currentPrice,
              timestamp: now.getTime(),
            };
            await this.transferQueue.add('transfer-settlement', jobData, {
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 1000,
              },
            });
          });
        } else {
          // No bids - mark as expired and reset player's onTransfer
          const player = await this.playerRepo.findOne({
            where: { id: auction.playerId as Uuid },
          });
          if (player) {
            player.onTransfer = false;
            await this.playerRepo.save(player);
          }

          auction.status = AuctionStatus.EXPIRED;
          auction.endsAt = now;
          await this.auctionRepo.save(auction);
        }
      }
    }
  }
}
