import { Uuid } from '@/common/types/common.type';
import { AuctionRedisRepository } from '@/redis/auction-redis.repository';
import {
  AuctionEntity,
  AuctionStatus,
  FinanceEntity,
  PlayerEntity,
  PlayerEventEntity,
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
import { DataSource, In, MoreThanOrEqual, Repository } from 'typeorm';
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
  season: number;
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
    @InjectRepository(PlayerEventEntity)
    private readonly historyRepo: Repository<PlayerEventEntity>,
    @InjectRepository(TransferTransactionEntity)
    private readonly transferTxRepo: Repository<TransferTransactionEntity>,
    @InjectQueue('transfer-settlement')
    private readonly transferQueue: Queue<TransferSettlementJobData>,
    private readonly dataSource: DataSource,
    private readonly auctionRedisRepo: AuctionRedisRepository,
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

    // Get current season
    const seasonResult = await this.transferTxRepo.manager
      .createQueryBuilder('match', 'match')
      .select('MAX(match.season)', 'maxSeason')
      .getRawOne();
    const season = seasonResult?.maxSeason || 1;

    const jobData: TransferSettlementJobData = {
      type,
      transactionId: '', // Will be created in the settlement
      auctionId: auction.id,
      playerId: auction.playerId,
      buyerTeamId,
      sellerTeamId: auction.teamId,
      amount,
      season,
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

    // Enrich bidHistory from Redis
    for (const auction of auctions) {
      const redisState = await this.auctionRedisRepo.getAuctionState(
        auction.id,
      );

      if (redisState && redisState.bidHistory.length > 0) {
        // Enrich bidHistory with team names
        const teamIds = [
          ...new Set(redisState.bidHistory.map((bid) => bid.teamId)),
        ];
        const teams = await this.teamRepo.find({
          where: { id: In(teamIds) },
          select: ['id', 'name'],
        });
        const teamMap = new Map(teams.map((t) => [t.id, t.name]));

        auction.bidHistory = redisState.bidHistory.map((bid) => ({
          ...bid,
          teamName: teamMap.get(bid.teamId as Uuid) || 'Unknown Team',
        }));
      } else {
        auction.bidHistory = [];
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

  async findMyBids(teamId: Uuid) {
    // Get auction IDs that this team has bid on from Redis
    const auctionIds = await this.auctionRedisRepo.getTeamBidAuctions(teamId);

    if (auctionIds.length === 0) {
      return [];
    }

    // Find auctions where this team has placed bids
    const auctions = await this.auctionRepo
      .createQueryBuilder('auction')
      .leftJoinAndSelect('auction.player', 'player')
      .leftJoinAndSelect('auction.team', 'team')
      .leftJoinAndSelect('auction.currentBidder', 'currentBidder')
      .where('auction.id IN (:...auctionIds)', { auctionIds })
      .andWhere('auction.status IN (:...statuses)', {
        statuses: [AuctionStatus.ACTIVE, AuctionStatus.SETTLING],
      })
      .orderBy('auction.expiresAt', 'ASC')
      .getMany();

    // Enrich with computed fields
    return this.enrichAuctions(auctions);
  }

  async findMyListings(teamId: Uuid) {
    // Find auctions where this team listed the player
    const auctions = await this.auctionRepo.find({
      where: [
        { teamId, status: AuctionStatus.ACTIVE },
        { teamId, status: AuctionStatus.SETTLING },
      ],
      relations: ['player', 'team', 'currentBidder'],
      order: { expiresAt: 'ASC' },
    });

    return this.enrichAuctions(auctions);
  }

  private async enrichAuctions(auctions: AuctionEntity[]) {
    for (const auction of auctions) {
      // Get bidHistory from Redis
      const redisState = await this.auctionRedisRepo.getAuctionState(
        auction.id,
      );

      if (redisState && redisState.bidHistory.length > 0) {
        const teamIds = [
          ...new Set(redisState.bidHistory.map((bid) => bid.teamId)),
        ];
        const teams = await this.teamRepo.find({
          where: { id: In(teamIds) },
          select: ['id', 'name'],
        });
        const teamMap = new Map(teams.map((t) => [t.id, t.name]));

        auction.bidHistory = redisState.bidHistory.map((bid) => ({
          ...bid,
          teamName: teamMap.get(bid.teamId as Uuid) || 'Unknown Team',
        }));
      } else {
        auction.bidHistory = [];
      }

      if (auction.player) {
        const [age, ageDays] = (auction.player as PlayerEntity).getExactAge();
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

    const savedAuction = await this.auctionRepo.save(auction);

    // Initialize Redis state for the auction
    await this.auctionRedisRepo.initializeAuction(savedAuction.id, endsAt);

    return savedAuction;
  }

  async placeBid(
    userId: Uuid,
    auctionId: Uuid,
    dto: PlaceBidReqDto,
  ): Promise<{ auction: AuctionEntity; lockedAmount: number }> {
    return this.dataSource.transaction(async (manager) => {
      const auctionRepo = manager.getRepository(AuctionEntity);
      const teamRepo = manager.getRepository(TeamEntity);
      const financeRepo = manager.getRepository(FinanceEntity);

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

      // Get current bid state from Redis
      const redisState = await this.auctionRedisRepo.getAuctionState(auctionId);
      const currentBid = redisState?.currentBid || auction.startPrice;
      const isFirstBid =
        !redisState?.bidHistory.length && currentBid === auction.startPrice;

      // Calculate minimum bid
      const minBid = isFirstBid
        ? auction.startPrice
        : currentBid + calculateMinBidIncrement(currentBid);

      if (dto.amount < minBid) {
        throw new BadRequestException(`Minimum bid is ${minBid}`);
      }

      // Check available funds from FinanceEntity.balance (minus already locked bid amounts)
      // Use pessimistic lock to prevent TOCTOU race conditions
      const bidderFinance = await manager
        .createQueryBuilder(FinanceEntity, 'finance')
        .where('finance.teamId = :teamId', { teamId: bidderTeam.id })
        .setLock('pessimistic_write')
        .getOne();
      const availableFunds =
        (bidderFinance?.balance || 0) - bidderTeam.lockedCash;
      if (availableFunds < dto.amount) {
        throw new BadRequestException(
          `Insufficient funds. Available: ${availableFunds}, Required: ${dto.amount}`,
        );
      }

      // Release previous bidder's locked cash (from Redis state)
      if (redisState?.currentBidder && redisState.lockAmount) {
        await teamRepo.decrement(
          { id: redisState.currentBidder as Uuid },
          'lockedCash',
          redisState.lockAmount,
        );
      }

      // Lock new bidder's cash
      bidderTeam.lockedCash += dto.amount;
      await teamRepo.save(bidderTeam);

      // Write to Redis (bid history and current state)
      const { previousBidder } = await this.auctionRedisRepo.placeBid(
        auctionId,
        bidderTeam.id,
        dto.amount,
        auction.expiresAt,
      );

      // Track team bid for findMyBids query
      await this.auctionRedisRepo.addTeamBid(
        auctionId,
        bidderTeam.id,
        auction.expiresAt,
      );

      // Update auction in PostgreSQL (currentPrice, currentBidderId, bidLockAmount)
      auction.currentPrice = dto.amount;
      auction.currentBidderId = bidderTeam.id;
      auction.bidLockAmount = dto.amount;

      // Extend time if needed
      const timeLeft = auction.expiresAt.getTime() - now.getTime();
      const thresholdMs =
        AUCTION_CONFIG.EXTENSION_THRESHOLD_MINUTES * 60 * 1000;
      if (timeLeft < thresholdMs) {
        auction.expiresAt = new Date(now.getTime() + thresholdMs);
        // Update expiresAt in Redis for correct TTL calculation
        await this.auctionRedisRepo.updateExpiresAt(
          auctionId,
          auction.expiresAt,
        );
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
      const financeRepo = manager.getRepository(FinanceEntity);
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

      // Check available funds from FinanceEntity.balance (with pessimistic lock to prevent TOCTOU)
      const buyerFinance = await manager
        .createQueryBuilder(FinanceEntity, 'finance')
        .where('finance.teamId = :teamId', { teamId: buyerTeam.id })
        .setLock('pessimistic_write')
        .getOne();
      if (!buyerFinance) {
        throw new NotFoundException('Buyer finance record not found');
      }
      if (buyerFinance.balance < auction.buyoutPrice) {
        throw new BadRequestException(
          `Insufficient funds. Available: ${buyerFinance.balance}, Required: ${auction.buyoutPrice}`,
        );
      }

      // Release previous bidder's lock if exists
      const redisState = await this.auctionRedisRepo.getAuctionState(auctionId);
      if (
        redisState?.currentBidder &&
        redisState.currentBidder !== buyerTeam.id
      ) {
        await teamRepo.decrement(
          { id: redisState.currentBidder as Uuid },
          'lockedCash',
          redisState.lockAmount,
        );
      }

      // Write buyout to Redis
      await this.auctionRedisRepo.placeBid(
        auctionId,
        buyerTeam.id,
        auction.buyoutPrice,
        auction.expiresAt,
      );

      // Track team bid for findMyBids
      await this.auctionRedisRepo.addTeamBid(
        auctionId,
        buyerTeam.id,
        auction.expiresAt,
      );

      // Get current season
      const seasonResult = await manager
        .createQueryBuilder('match', 'match')
        .select('MAX(match.season)', 'maxSeason')
        .getRawOne();
      const currentSeason = seasonResult?.maxSeason || 1;

      // Create transfer transaction
      const transaction = manager.create(TransferTransactionEntity, {
        auctionId: auction.id,
        playerId: auction.playerId,
        fromTeamId: auction.teamId,
        toTeamId: buyerTeam.id,
        amount: auction.buyoutPrice,
        type: TransferTransactionType.BUYOUT,
        status: TransferTransactionStatus.PENDING,
        season: currentSeason,
      });
      await manager.save(transaction);

      // Update auction status
      auction.status = AuctionStatus.SETTLING;
      auction.currentBidderId = buyerTeam.id;
      auction.currentPrice = auction.buyoutPrice;
      auction.endsAt = new Date();
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
        season: currentSeason,
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
        // Acquire settlement lock to prevent concurrent settlement
        const lockAcquired = await this.auctionRedisRepo.acquireSettlementLock(
          auction.id,
        );
        if (!lockAcquired) {
          continue; // Another process is settling this auction
        }

        try {
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

          // Get bid state from Redis for final cleanup of team bid sets
          const redisState = await this.auctionRedisRepo.getAuctionState(
            auction.id,
          );

          if (auction.currentBidderId) {
            // Has winner - create transaction and enqueue
            await this.dataSource.transaction(async (manager) => {
              const auctionRepo = manager.getRepository(AuctionEntity);
              const transferTxRepo = manager.getRepository(
                TransferTransactionEntity,
              );

              // Get current season
              const seasonResult = await manager
                .createQueryBuilder('match', 'match')
                .select('MAX(match.season)', 'maxSeason')
                .getRawOne();
              const currentSeason = seasonResult?.maxSeason || 1;

              // Create transfer transaction
              const transaction = manager.create(TransferTransactionEntity, {
                auctionId: auction.id,
                playerId: auction.playerId,
                fromTeamId: auction.teamId,
                toTeamId: auction.currentBidderId,
                amount: auction.currentPrice,
                type: TransferTransactionType.AUCTION_COMPLETE,
                status: TransferTransactionStatus.PENDING,
                season: currentSeason,
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
                season: currentSeason,
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

          // Cleanup Redis data for this auction
          await this.auctionRedisRepo.cleanupAuction(auction.id);

          // Cleanup team bid sets
          if (redisState?.bidHistory) {
            for (const bid of redisState.bidHistory) {
              await this.auctionRedisRepo.removeTeamBid(auction.id, bid.teamId);
            }
          }
        } finally {
          await this.auctionRedisRepo.releaseSettlementLock(auction.id);
        }
      }
    }
  }

  async findMyPurchases(
    teamId: Uuid,
    date?: string,
    season?: number,
    page = 1,
    limit = 20,
  ) {
    const queryDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(queryDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(queryDate);
    endOfDay.setHours(23, 59, 59, 999);

    const whereCondition: any = {
      toTeamId: teamId,
    };

    // If no date provided, return all time; otherwise filter by day
    if (date) {
      whereCondition.createdAt = MoreThanOrEqual(startOfDay);
    }

    const transactions = await this.transferTxRepo.find({
      where: whereCondition,
      relations: ['player', 'fromTeam', 'toTeam', 'auction'],
      order: { createdAt: 'DESC' },
    });

    // Filter by season if provided
    const seasonFiltered = season
      ? transactions.filter((t) => t.season === season)
      : transactions;

    // Also get transactions where settledAt is today (for SETTLING->COMPLETED)
    const settledToday = await this.transferTxRepo
      .createQueryBuilder('tx')
      .leftJoinAndSelect('tx.player', 'player')
      .leftJoinAndSelect('tx.fromTeam', 'fromTeam')
      .leftJoinAndSelect('tx.toTeam', 'toTeam')
      .leftJoinAndSelect('tx.auction', 'auction')
      .where('tx.toTeamId = :teamId', { teamId })
      .andWhere('tx.settledAt >= :startOfDay', { startOfDay })
      .andWhere('tx.settledAt <= :endOfDay', { endOfDay })
      .orderBy('tx.settledAt', 'DESC')
      .getMany();

    // Merge and deduplicate
    const allTransactions: TransferTransactionEntity[] = [];
    for (const tx of seasonFiltered) {
      if (!allTransactions.find((t) => t.id === tx.id)) {
        allTransactions.push(tx);
      }
    }
    for (const tx of settledToday) {
      if (!allTransactions.find((t) => t.id === tx.id)) {
        if (!season || tx.season === season) {
          allTransactions.push(tx);
        }
      }
    }

    // Enrich player with computed age fields
    for (const tx of allTransactions) {
      if (tx.player) {
        const [age, ageDays] = (tx.player as PlayerEntity).getExactAge();
        tx.player = {
          ...tx.player,
          age,
          ageDays,
        } as any;
      }
    }

    // Sort by createdAt descending
    allTransactions.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    // Paginate
    const total = allTransactions.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const items = allTransactions.slice(offset, offset + limit);

    return {
      items,
      meta: { total, page, limit, totalPages },
    };
  }

  async findMySales(
    teamId: Uuid,
    date?: string,
    season?: number,
    page = 1,
    limit = 20,
  ) {
    const queryDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(queryDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(queryDate);
    endOfDay.setHours(23, 59, 59, 999);

    const whereCondition: any = {
      fromTeamId: teamId,
    };

    // If no date provided, return all time; otherwise filter by day
    if (date) {
      whereCondition.createdAt = MoreThanOrEqual(startOfDay);
    }

    const transactions = await this.transferTxRepo.find({
      where: whereCondition,
      relations: ['player', 'fromTeam', 'toTeam', 'auction'],
      order: { createdAt: 'DESC' },
    });

    // Filter by season if provided
    const seasonFiltered = season
      ? transactions.filter((t) => t.season === season)
      : transactions;

    // Also get transactions where settledAt is today
    const settledToday = await this.transferTxRepo
      .createQueryBuilder('tx')
      .leftJoinAndSelect('tx.player', 'player')
      .leftJoinAndSelect('tx.fromTeam', 'fromTeam')
      .leftJoinAndSelect('tx.toTeam', 'toTeam')
      .leftJoinAndSelect('tx.auction', 'auction')
      .where('tx.fromTeamId = :teamId', { teamId })
      .andWhere('tx.settledAt >= :startOfDay', { startOfDay })
      .andWhere('tx.settledAt <= :endOfDay', { endOfDay })
      .orderBy('tx.settledAt', 'DESC')
      .getMany();

    // Merge and deduplicate
    const allTransactions: TransferTransactionEntity[] = [];
    for (const tx of seasonFiltered) {
      if (!allTransactions.find((t) => t.id === tx.id)) {
        allTransactions.push(tx);
      }
    }
    for (const tx of settledToday) {
      if (!allTransactions.find((t) => t.id === tx.id)) {
        if (!season || tx.season === season) {
          allTransactions.push(tx);
        }
      }
    }

    // Enrich player with computed age fields
    for (const tx of allTransactions) {
      if (tx.player) {
        const [age, ageDays] = (tx.player as PlayerEntity).getExactAge();
        tx.player = {
          ...tx.player,
          age,
          ageDays,
        } as any;
      }
    }

    // Sort by createdAt descending
    allTransactions.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    // Paginate
    const total = allTransactions.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const items = allTransactions.slice(offset, offset + limit);

    return {
      items,
      meta: { total, page, limit, totalPages },
    };
  }
}
