import {
  NotificationRedisService,
  NotificationType,
} from '@/api/notification/notification-redis.service';
import { Uuid } from '@/common/types/common.type';
import { AuctionRedisRepository } from '@/redis/auction-redis.repository';
import {
  AuctionEntity,
  AuctionStatus,
  FinanceEntity,
  MatchEntity,
  PlayerEntity,
  PlayerEventEntity,
  TeamEntity,
  TransferTransactionEntity,
  TransferTransactionStatus,
  TransferTransactionType,
} from '@goalxi/database';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { DataSource, In, MoreThanOrEqual, Repository } from 'typeorm';
import { AUCTION_CONFIG, calculateMinBidIncrement } from './auction.constants';
import { CreateAuctionReqDto } from './dto/create-auction.req.dto';
import { PlaceBidReqDto } from './dto/place-bid.req.dto';

interface TransferSettlementJobData {
  type: 'BUYOUT' | 'AUCTION_COMPLETE';
  transactionId: string;
  auctionId: string;
  playerId: number;
  buyerTeamId: string;
  sellerTeamId: string;
  amount: number;
  season: number;
  timestamp: number;
  /** Inbound X-Request-Id (or generated `req-<uuid>`). Propagated by the
   *  settlement worker so all settlement-side logs share the trace. */
  traceId?: string;
}

@Injectable()
export class AuctionService implements OnModuleInit {
  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
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
    private readonly notificationRedis: NotificationRedisService,
    private readonly cls: ClsService,
  ) {}

  async onModuleInit() {
    this.logger.log('Running auction recovery on startup...');
    // `OnModuleInit` blocks Nest's bootstrap — if Redis or the DB
    // blip for a second at startup, the whole API refuses to come
    // up. Recover and extend are best-effort: log loudly, keep
    // serving traffic, and let the next cron tick (or the next
    // bid that touches the affected rows) catch up.
    try {
      await this.recoverStuckSettlingAuctions();
    } catch (err) {
      this.logger.error(
        `[AuctionRecovery] recoverStuckSettlingAuctions failed (continuing startup): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    try {
      await this.extendExpiredAuctions();
    } catch (err) {
      this.logger.error(
        `[AuctionRecovery] extendExpiredAuctions failed (continuing startup): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    this.logger.log('Auction recovery completed.');
  }

  /**
   * Find auctions stuck in SETTLING state and re-enqueue their settlement.
   * This handles cases where server crashed after setting SETTLING but before job was processed.
   *
   * The "no transaction" branch used to call `enqueueSettlement` with
   * `transactionId: ''`, which then failed inside `transfer.processor`
   * (it `findOne` for the empty id, found nothing, and threw). That
   * throw fed the worker's catch block, which set the auction to
   * CANCELLED and `player.onTransfer = false` — silently destroying a
   * legitimately-pending settlement. Now we synchronously create a
   * PENDING transaction first, so the enqueued job has a real id and
   * the worker can pick it up normally.
   *
   * Runs every 5 minutes via @Cron so a long-running server doesn't
   * need a restart to clear half-recovered state. The
   * `OnModuleInit` hook also calls this once at boot for an
   * immediate-recovery pass (so the first cron tick doesn't have
   * to wait 5 minutes for a fresh deploy).
   */
  @Cron('0 */5 * * * *') // Every 5 minutes
  async recoverStuckSettlingAuctions(): Promise<void> {
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
        // No transaction exists - we crashed between setting SETTLING
        // and enqueuing the job. Create the PENDING transaction
        // synchronously here, then enqueue the job with a real id.
        this.logger.warn(
          `Auction ${auction.id} has SETTLING but no transaction, creating tx and re-enqueuing`,
        );
        await this.recreateAndEnqueueSettlement(auction);
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
        await this.playerRepo.update(auction.playerId, {
          onTransfer: false,
        });
      }
      // PENDING/PROCESSING will be picked up by settlement processor when it runs
    }
  }

  /**
   * Recovery helper for the "SETTLING but no transaction" branch of
   * `recoverStuckSettlingAuctions`. Builds a fresh PENDING
   * `TransferTransactionEntity` for the auction and enqueues a real
   * settlement job keyed by that transaction's id. Replaces the old
   * `enqueueSettlement` path that passed `transactionId: ''` and
   * blew up inside the worker.
   */
  private async recreateAndEnqueueSettlement(
    auction: AuctionEntity,
  ): Promise<void> {
    const type: 'BUYOUT' | 'AUCTION_COMPLETE' = auction.currentBidderId
      ? 'AUCTION_COMPLETE'
      : 'BUYOUT';
    const amount = auction.currentBidderId
      ? auction.currentPrice
      : auction.buyoutPrice;
    const buyerTeamId = auction.currentBidderId || auction.teamId;
    const transactionType =
      type === 'BUYOUT'
        ? TransferTransactionType.BUYOUT
        : TransferTransactionType.AUCTION_COMPLETE;
    const currentSeason = await this.getCurrentSeason();

    // Create the PENDING transaction first so the worker has a
    // real id to look up. If this throws, the auction is left
    // in SETTLING and the next onModuleInit will retry.
    const transaction = await this.dataSource.transaction(async (manager) => {
      const transferTxRepo = manager.getRepository(TransferTransactionEntity);
      const tx = transferTxRepo.create({
        auctionId: auction.id,
        playerId: auction.playerId,
        fromTeamId: auction.teamId,
        toTeamId: buyerTeamId,
        amount,
        type: transactionType,
        status: TransferTransactionStatus.PENDING,
        season: currentSeason,
      });
      return transferTxRepo.save(tx);
    });

    // Use the shared jobData builder so the two call sites
    // (this + `enqueueSettlement`) can never drift in what they
    // hand to the worker.
    const jobData = this.buildSettlementJobData(
      auction,
      transaction.id,
      currentSeason,
    );
    await this.transferQueue.add('transfer-settlement', jobData, {
      jobId: `transfer-settlement-${transaction.id}-${type}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });
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
   * Resolve the current season by querying the `match` table for
   * `MAX(season)`. Falls back to 1 when the table is empty
   * (fresh database, pre-scheduler).
   *
   * Replaces three ad-hoc copies of the same `createQueryBuilder('match', 'match')`
   * pattern (this was a real bug — passing `'match'` as the
   * table name let TypeORM generate a valid query only by
   * coincidence because the entity alias and the table name
   * happen to be the same string).
   */
  private async getCurrentSeason(): Promise<number> {
    const row = await this.dataSource
      .getRepository(MatchEntity)
      .createQueryBuilder('m')
      .select('MAX(m.season)', 'maxSeason')
      .getRawOne<{ maxSeason: number | null }>();
    return row?.maxSeason ?? 1;
  }

  /**
   * Build the `TransferSettlementJobData` payload for an
   * auction. Pure function — no I/O. Centralises the
   * "BUYOUT vs AUCTION_COMPLETE" branching and the
   * buyerTeamId / amount derivation so the two call sites
   * (`enqueueSettlement` and `recreateAndEnqueueSettlement`)
   * can't drift.
   */
  private buildSettlementJobData(
    auction: AuctionEntity,
    transactionId: string,
    currentSeason: number,
  ): TransferSettlementJobData {
    const type: 'BUYOUT' | 'AUCTION_COMPLETE' = auction.currentBidderId
      ? 'AUCTION_COMPLETE'
      : 'BUYOUT';
    const amount = auction.currentBidderId
      ? auction.currentPrice
      : auction.buyoutPrice;
    const buyerTeamId = auction.currentBidderId || auction.teamId;
    return {
      type,
      transactionId,
      auctionId: auction.id,
      playerId: auction.playerId,
      buyerTeamId,
      sellerTeamId: auction.teamId,
      amount,
      season: currentSeason,
      timestamp: Date.now(),
      traceId: this.cls.get<string>('traceId'),
    };
  }

  /**
   * Enqueue a settlement job for an auction.
   *
   * NOTE: this method now requires the caller to have already
   * created the `TransferTransactionEntity` and pass its id via
   * `transactionId`. The previous version accepted an empty
   * transactionId and let the worker discover the missing tx,
   * which then threw and turned the auction into CANCELLED.
   * `recreateAndEnqueueSettlement` is the new entry point used by
   * `recoverStuckSettlingAuctions`; `buyout` and
   * `finalizeExpiredAuctions` create the tx in their own
   * transactions and then call this with the real id.
   */
  private async enqueueSettlement(
    auction: AuctionEntity,
    transactionId: string,
    currentSeason: number,
  ): Promise<void> {
    const jobData = this.buildSettlementJobData(
      auction,
      transactionId,
      currentSeason,
    );
    // Business jobId — BullMQ rejects duplicate jobIds, so a
    // re-delivery (or our own recovery path running twice) can't
    // enqueue duplicates of the same settlement.
    await this.transferQueue.add('transfer-settlement', jobData, {
      jobId: `transfer-settlement-${transactionId}-${jobData.type}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });
  }

  async findAllInFlight() {
    // ACTIVE = still taking bids; SETTLING = locked, worker
    // about to (or currently) finalising. Both are "in flight"
    // and worth showing to a marketplace UI; pure-terminal
    // rows (SOLD / EXPIRED / CANCELLED) are filtered out.
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
    this.logger.log(
      `[Auction] createAuction start userId=${userId} playerId=${dto.playerId} startPrice=${dto.startPrice} buyoutPrice=${dto.buyoutPrice}`,
    );

    const team = await this.teamRepo.findOneBy({ userId });
    if (!team) throw new NotFoundException('User has no team');
    // Bot teams don't actually have a user-driven auction flow;
    // refuse up front so a misconfigured bot doesn't pollute
    // the marketplace.
    if (team.isBot) {
      throw new BadRequestException('Bot teams cannot list players');
    }

    const player = await this.playerRepo.findOneBy({
      id: dto.playerId,
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

    this.logger.log(
      `[Auction] createAuction success auctionId=${savedAuction.id} playerId=${player.id} sellerTeamId=${team.id} durationHours=${durationHours}`,
    );

    return savedAuction;
  }

  async placeBid(
    userId: Uuid,
    auctionId: Uuid,
    dto: PlaceBidReqDto,
  ): Promise<{ auction: AuctionEntity; lockedAmount: number }> {
    this.logger.log(
      `[Auction] placeBid start userId=${userId} auctionId=${auctionId} amount=${dto.amount}`,
    );
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
      // Re-read the bidder team's `lockedCash` under the row's
      // own pessimistic lock so the available-funds check sees
      // the freshest value (a sibling bid that just took the
      // team's money and decremented/re-incremented lockedCash
      // might still be in flight; the row-level lock makes us
      // wait for it).
      const lockedBidderTeam = await teamRepo
        .createQueryBuilder('team')
        .where('team.id = :id', { id: bidderTeam.id })
        .setLock('pessimistic_write')
        .getOne();
      const availableFunds =
        (bidderFinance?.balance || 0) - (lockedBidderTeam?.lockedCash ?? 0);
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

      // Lock new bidder's cash atomically. The old in-memory
      // `bidderTeam.lockedCash += dto.amount; save(bidderTeam)`
      // pattern is a read-modify-write race — two concurrent
      // bids from the same team can both read the same
      // `lockedCash` value, both increment in memory, and the
      // second `save` clobbers the first. `increment` goes
      // straight to a single SQL `lockedCash = lockedCash + :n`
      // so the writes serialize at the database.
      await teamRepo.increment(
        { id: bidderTeam.id },
        'lockedCash',
        dto.amount,
      );

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

      this.logger.log(
        `[Auction] placeBid success auctionId=${auctionId} bidderTeamId=${bidderTeam.id} playerId=${auction.playerId} newPrice=${dto.amount} lockedAmount=${dto.amount}`,
      );

      // Notify previous bidder that they were outbid
      if (previousBidder) {
        const previousTeam = await this.teamRepo.findOne({
          where: { id: previousBidder as Uuid },
          relations: ['user'],
        });
        const player = await this.playerRepo.findOne({
          where: { id: auction.playerId },
        });

        if (previousTeam?.userId && player) {
          await this.notificationRedis.create({
            userId: previousTeam.userId,
            type: NotificationType.AUCTION_OUTBID,
            messageKey: 'notification.auctionOutbid',
            data: {
              auctionId,
              playerId: auction.playerId,
              playerName: player.name,
              amount: dto.amount,
            },
          });
        }
      }

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
    this.logger.log(
      `[Auction] buyout start userId=${userId} auctionId=${auctionId}`,
    );
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
      // Account for already-locked cash from other concurrent
      // bids. Without this, a buyer with concurrent active bids
      // can over-spend their balance. `placeBid` does the same
      // check (so the two paths behave identically).
      const lockedBuyerTeam = await teamRepo
        .createQueryBuilder('team')
        .where('team.id = :id', { id: buyerTeam.id })
        .setLock('pessimistic_write')
        .getOne();
      const availableFunds =
        buyerFinance.balance - (lockedBuyerTeam?.lockedCash ?? 0);
      if (availableFunds < auction.buyoutPrice) {
        throw new BadRequestException(
          `Insufficient funds. Available: ${availableFunds}, Required: ${auction.buyoutPrice}`,
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
      const currentSeason = await this.getCurrentSeason();

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

      // Enqueue settlement job. The business jobId prevents a
      // BullMQ re-delivery (or our own recovery path running
      // twice) from enqueuing duplicates of the same settlement.
      await this.enqueueSettlement(auction, transaction.id, currentSeason);

      this.logger.log(
        `[Auction] buyout queued settlement transactionId=${transaction.id} auctionId=${auction.id} buyerTeamId=${buyerTeam.id} sellerTeamId=${auction.teamId} playerId=${auction.playerId} amount=${auction.buyoutPrice}`,
      );

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
    // Cap the per-tick batch so a pathological market state
    // (tens of thousands of ACTIVE auctions somehow) doesn't
    // OOM the api process. The next tick picks up where this
    // one left off because ACTIVE rows that expired but weren't
    // processed this tick remain ACTIVE on the next minute.
    const expiredAuctions = await this.auctionRepo.find({
      where: { status: AuctionStatus.ACTIVE },
      order: { expiresAt: 'ASC' },
      take: 500,
    });

    if (expiredAuctions.length === 0) {
      return;
    }

    this.logger.log(
      `[Auction] finalizeExpiredAuctions scanning ${expiredAuctions.length} active auctions`,
    );

    for (const auction of expiredAuctions) {
      if (auction.expiresAt <= now) {
        // Acquire settlement lock to prevent concurrent settlement
        const lockAcquired = await this.auctionRedisRepo.acquireSettlementLock(
          auction.id,
        );
        if (!lockAcquired) {
          this.logger.debug(
            `[Auction] finalizeExpiredAuctions skipped (lock held) auctionId=${auction.id}`,
          );
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
            this.logger.debug(
              `[Auction] finalizeExpiredAuctions skipped (existing tx ${existingTx.id}) auctionId=${auction.id}`,
            );
            continue;
          }

          // Get bid state from Redis for final cleanup of team bid sets
          const redisState = await this.auctionRedisRepo.getAuctionState(
            auction.id,
          );

          if (auction.currentBidderId) {
            this.logger.log(
              `[Auction] finalizeExpiredAuctions winner found auctionId=${auction.id} playerId=${auction.playerId} winnerTeamId=${auction.currentBidderId} sellerTeamId=${auction.teamId} price=${auction.currentPrice}`,
            );
            // Has winner - create transaction and enqueue
            await this.dataSource.transaction(async (manager) => {
              const auctionRepo = manager.getRepository(AuctionEntity);
              const transferTxRepo = manager.getRepository(
                TransferTransactionEntity,
              );

              // Get current season
              const currentSeason = await this.getCurrentSeason();

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

              // Enqueue settlement job. The business jobId prevents a
              // BullMQ re-delivery (or our own recovery path running
              // twice) from enqueuing duplicates of the same settlement.
              await this.enqueueSettlement(
                auction,
                transaction.id,
                currentSeason,
              );
            });
          } else {
            // No bids - mark as expired and reset player's onTransfer.
            // Both writes go through the same transaction so a
            // partial failure can't leave the player off-market
            // while the auction is still ACTIVE (or vice versa).
            this.logger.log(
              `[Auction] finalizeExpiredAuctions no bids auctionId=${auction.id} playerId=${auction.playerId} sellerTeamId=${auction.teamId}`,
            );
            await this.dataSource.transaction(async (manager) => {
              const txPlayerRepo = manager.getRepository(PlayerEntity);
              const txAuctionRepo = manager.getRepository(AuctionEntity);

              const player = await txPlayerRepo.findOne({
                where: { id: auction.playerId },
              });
              if (player) {
                player.onTransfer = false;
                await txPlayerRepo.save(player);
              }

              auction.status = AuctionStatus.EXPIRED;
              auction.endsAt = now;
              await txAuctionRepo.save(auction);
            });
          }

          // Cleanup Redis data for this auction — and the per-team
          // bid sets — in a single pipeline. The previous two-pass
          // cleanup (cleanupAuction + per-team removeTeamBid loop)
          // could leave team:{id}:bids containing a stale
          // auctionId if the first pass succeeded and the loop
          // was interrupted. Pipeline them so a partial failure
          // either lands both or rolls both back at the
          // connection level.
          const teamIds =
            redisState?.bidHistory?.map((bid) => bid.teamId) ?? [];
          await this.auctionRedisRepo.cleanupAuctionWithBids(
            auction.id,
            teamIds,
          );
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
