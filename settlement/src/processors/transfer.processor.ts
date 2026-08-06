import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, DataSource } from 'typeorm';
import { Job } from 'bullmq';
import {
  AuctionEntity,
  AuctionStatus,
  FinanceEntity,
  PlayerEntity,
  PlayerEventEntity,
  PlayerEventType,
  PlayerTransactionEntity,
  TeamEntity,
  TransactionEntity,
  TransactionType,
  TransferTransactionEntity,
  TransferTransactionStatus,
  TransferTransactionType,
  Uuid,
} from '@goalxi/database';
import {
  NotificationService,
  NotificationType,
} from '../notification/notification.service';

export interface TransferSettlementJobData {
  type: 'BUYOUT' | 'AUCTION_COMPLETE';
  transactionId: string;
  auctionId: string;
  playerId: number;
  buyerTeamId: string;
  sellerTeamId: string;
  amount: number;
  season: number;
  timestamp: number;
  /** Inbound X-Request-Id from the api caller; propagates traceId to logs. */
  traceId?: string;
}

/**
 * How long a `PROCESSING` claim can sit untouched before a new
 * worker is allowed to take over. The Redis settlement lock in
 * the api side has a 5-minute TTL; we use 10 minutes here so a
 * slow-but-not-dead worker isn't preempted by a fresh one.
 */
const STALE_PROCESSING_MS = 10 * 60 * 1000;

@Injectable()
@Processor('transfer-settlement')
export class TransferProcessor extends WorkerHost {
  /** Active job-scoped logger, bound to the inbound traceId at process() start. */
  private jobLog!: PinoLoggerService;

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
    @InjectRepository(PlayerTransactionEntity)
    private readonly playerTxRepo: Repository<PlayerTransactionEntity>,
    @InjectRepository(TransferTransactionEntity)
    private readonly transferTxRepo: Repository<TransferTransactionEntity>,
    @InjectRepository(FinanceEntity)
    private readonly financeRepo: Repository<FinanceEntity>,
    @InjectRepository(TransactionEntity)
    private readonly transactionRepo: Repository<TransactionEntity>,
    private readonly dataSource: DataSource,
    private readonly notificationService: NotificationService,
  ) {
    super();
  }

  async process(job: Job<TransferSettlementJobData>): Promise<void> {
    const {
      type,
      transactionId,
      auctionId,
      playerId,
      buyerTeamId,
      sellerTeamId,
      amount,
      season,
      traceId,
    } = job.data;
    this.jobLog = traceId ? this.logger.child({ traceId }) : this.logger;

    this.jobLog.info(
      `[TransferProcessor] Processing ${type} for transaction ${transactionId}`,
    );

    try {
      // ── Claim (CAS) ────────────────────────────────────────────────
      // The previous implementation refused to touch any row in
      // PROCESSING, so a worker that died mid-settlement would
      // permanently jam the auction. The CAS now does two things:
      //   1. If the row is PENDING, claim it (move → PROCESSING,
      //      stamp claimedAt = now).
      //   2. If the row is already PROCESSING but the existing
      //      claimedAt is NULL (legacy) or older than
      //      STALE_PROCESSING_MS, take it over. Otherwise the
      //      claim is lost (affected = 0) and we throw — same
      //      "another worker has it" semantics as before, but
      //      with an escape hatch for crashed workers.
      const now = new Date();
      const staleCutoff = new Date(now.getTime() - STALE_PROCESSING_MS);

      const existingTx = await this.transferTxRepo.findOne({
        where: { id: transactionId as Uuid },
      });

      if (!existingTx) {
        this.jobLog.error(
          `[TransferProcessor] Transaction ${transactionId} not found`,
        );
        throw new Error(`Transaction ${transactionId} not found`);
      }

      if (existingTx.status === TransferTransactionStatus.COMPLETED) {
        this.jobLog.warn(
          `[TransferProcessor] Transaction ${transactionId} already completed, skipping`,
        );
        return;
      }

      if (existingTx.status === TransferTransactionStatus.FAILED) {
        // FAILED is terminal — re-running won't fix it (the catch
        // block already cancelled the auction). Surface as an
        // error so BullMQ doesn't infinite-retry, but don't take
        // over.
        this.jobLog.warn(
          `[TransferProcessor] Transaction ${transactionId} previously FAILED, refusing to take over`,
        );
        throw new Error(
          `Transaction ${transactionId} previously failed: ${existingTx.failureReason ?? 'unknown'}`,
        );
      }

      // Decide whether the row is up for grabs. PENDING always is;
      // PROCESSING only if the claim is stale.
      const claimable =
        existingTx.status === TransferTransactionStatus.PENDING ||
        !existingTx.claimedAt ||
        existingTx.claimedAt < staleCutoff;

      if (!claimable) {
        this.jobLog.warn(
          `[TransferProcessor] Transaction ${transactionId} is being processed by another worker (claimedAt=${existingTx.claimedAt?.toISOString() ?? 'n/a'})`,
        );
        throw new Error(`Transaction ${transactionId} already being processed`);
      }

      // Atomic claim: only succeeds if the row is still in a
      // claimable state. Two workers racing the same row both see
      // "claimable=true", but only one's UPDATE will land (the other
      // will see affected=0 and retry / give up).
      const claim = await this.transferTxRepo.update(
        {
          id: transactionId as Uuid,
          status: In([
            TransferTransactionStatus.PENDING,
            TransferTransactionStatus.PROCESSING,
          ]),
        },
        {
          status: TransferTransactionStatus.PROCESSING,
          claimedAt: new Date(),
        },
      );
      if (!claim.affected) {
        this.jobLog.warn(
          `[TransferProcessor] Transaction ${transactionId} claim lost the CAS race`,
        );
        throw new Error(`Transaction ${transactionId} claim lost the CAS race`);
      }

      // Execute settlement in a transaction
      await this.dataSource.transaction(async (manager) => {
        const auctionRepo = manager.getRepository(AuctionEntity);
        const playerRepo = manager.getRepository(PlayerEntity);
        const teamRepo = manager.getRepository(TeamEntity);
        const historyRepo = manager.getRepository(PlayerEventEntity);
        const playerTxRepo = manager.getRepository(PlayerTransactionEntity);
        const financeRepo = manager.getRepository(FinanceEntity);
        const transactionRepo = manager.getRepository(TransactionEntity);

        // 1. Verify buyer team and validate balance
        const buyer = await teamRepo.findOne({
          where: { id: buyerTeamId as Uuid },
        });
        if (!buyer) {
          throw new Error(`Buyer team ${buyerTeamId} not found`);
        }

        // Get buyer finance with pessimistic lock to prevent TOCTOU
        const buyerFinance = await manager
          .createQueryBuilder(FinanceEntity, 'finance')
          .where('finance.teamId = :teamId', { teamId: buyerTeamId })
          .setLock('pessimistic_write')
          .getOne();
        if (!buyerFinance) {
          throw new Error(
            `Buyer finance record not found for team ${buyerTeamId}`,
          );
        }

        // Validate buyer has sufficient balance (accounting for locked cash)
        const availableBalance = buyerFinance.balance - (buyer.lockedCash || 0);
        if (availableBalance < amount) {
          throw new Error(
            `Buyer team ${buyerTeamId} has insufficient balance. Available: ${availableBalance}, Required: ${amount}`,
          );
        }

        // 2. Deduct from buyer
        buyerFinance.balance -= amount;
        await financeRepo.save(buyerFinance);

        // Create transaction record for buyer (debit)
        const buyerTransaction = manager.create(TransactionEntity, {
          teamId: buyerTeamId as Uuid,
          amount: -amount,
          type: TransactionType.TRANSFER_OUT,
          season,
          description: `Transfer fee paid for player ${playerId}`,
          relatedId: transactionId,
        });
        await transactionRepo.save(buyerTransaction);

        // 3. Credit to seller (with pessimistic lock)
        const sellerFinance = await manager
          .createQueryBuilder(FinanceEntity, 'finance')
          .where('finance.teamId = :teamId', { teamId: sellerTeamId })
          .setLock('pessimistic_write')
          .getOne();
        if (!sellerFinance) {
          throw new Error(
            `Seller finance record not found for team ${sellerTeamId}`,
          );
        }

        sellerFinance.balance += amount;
        await financeRepo.save(sellerFinance);

        // Create transaction record for seller (credit)
        const sellerTransaction = manager.create(TransactionEntity, {
          teamId: sellerTeamId as Uuid,
          amount: amount,
          type: TransactionType.TRANSFER_IN,
          season,
          description: `Transfer fee received for player ${playerId}`,
          relatedId: transactionId,
        });
        await transactionRepo.save(sellerTransaction);

        // 4. Update player team
        const player = await playerRepo.findOne({
          where: { id: playerId },
        });
        if (!player) {
          throw new Error(`Player ${playerId} not found`);
        }
        player.teamId = buyerTeamId;
        player.onTransfer = false;
        await playerRepo.save(player);

        // 5. Update auction status
        await auctionRepo.update(auctionId as Uuid, {
          status: AuctionStatus.SOLD,
          winnerId: buyerTeamId as Uuid,
          endsAt: new Date(),
        });

        // 6. Complete transfer transaction
        await this.transferTxRepo.update(transactionId as Uuid, {
          status: TransferTransactionStatus.COMPLETED,
          settledAt: new Date(),
        });

        // 7. Create player event
        const history = manager.create(PlayerEventEntity, {
          playerId,
          season,
          date: new Date(),
          eventType: PlayerEventType.TRANSFER,
          details: {
            fromTeamId: sellerTeamId,
            toTeamId: buyerTeamId,
            price: amount,
            auctionId: auctionId,
          },
        });
        await manager.save(history);

        // 8. Create player transaction record
        const playerTx = manager.create(PlayerTransactionEntity, {
          playerId,
          fromTeamId: sellerTeamId as Uuid,
          toTeamId: buyerTeamId as Uuid,
          price: amount,
          season,
          transactionDate: new Date(),
          auctionId: auctionId as Uuid,
        });
        await manager.save(playerTx);

        // 9. Release previous bidder's locked cash (if any) - inside transaction
        if (type === 'AUCTION_COMPLETE') {
          const auction = await auctionRepo.findOne({
            where: { id: auctionId as Uuid },
          });
          if (
            auction &&
            auction.bidLockAmount &&
            auction.currentBidderId &&
            auction.currentBidderId !== buyerTeamId
          ) {
            await teamRepo.decrement(
              { id: auction.currentBidderId },
              'lockedCash',
              auction.bidLockAmount,
            );
            this.jobLog.info(
              `[TransferProcessor] Released ${auction.bidLockAmount} locked cash from previous bidder ${auction.currentBidderId}`,
            );
          }
        }

        // 10. For BUYOUT, release buyer's own bid lock if exists - inside transaction
        if (type === 'BUYOUT') {
          const auction = await auctionRepo.findOne({
            where: { id: auctionId as Uuid },
          });
          if (
            auction &&
            auction.bidLockAmount &&
            auction.currentBidderId === buyerTeamId
          ) {
            await teamRepo.decrement(
              { id: buyerTeamId as Uuid },
              'lockedCash',
              auction.bidLockAmount,
            );
            this.jobLog.info(
              `[TransferProcessor] Released ${auction.bidLockAmount} bid lock from buyer ${buyerTeamId}`,
            );
          }
        }

        // Create notifications for buyer and seller
        const buyerTeam = await teamRepo.findOne({
          where: { id: buyerTeamId as Uuid },
          relations: ['user'],
        });
        const sellerTeam = await teamRepo.findOne({
          where: { id: sellerTeamId as Uuid },
          relations: ['user'],
        });

        if (buyerTeam?.userId) {
          await this.notificationService.create(
            buyerTeam.userId,
            NotificationType.PLAYER_PURCHASED,
            'notification.playerPurchased',
            {
              playerId,
              playerName: player.name,
              amount,
              fromTeamId: sellerTeamId,
              toTeamId: buyerTeamId,
            },
          );
        }

        if (sellerTeam?.userId) {
          await this.notificationService.create(
            sellerTeam.userId,
            NotificationType.PLAYER_SOLD,
            'notification.playerSold',
            {
              playerId,
              playerName: player.name,
              amount,
              fromTeamId: sellerTeamId,
              toTeamId: buyerTeamId,
            },
          );
        }

        this.jobLog.info(
          `[TransferProcessor] Successfully settled ${type}: Player ${playerId} transferred from Team ${sellerTeamId} to Team ${buyerTeamId} for ${amount}`,
        );
      });
    } catch (error) {
      this.jobLog.error(
        `[TransferProcessor] Failed to process transaction ${transactionId}: ${error.message || error}`,
      );

      // Update transaction status to FAILED
      await this.transferTxRepo.update(transactionId as Uuid, {
        status: TransferTransactionStatus.FAILED,
        failureReason: error.message || 'Unknown error',
      });

      // Cancel the auction
      await this.auctionRepo.update(auctionId as Uuid, {
        status: AuctionStatus.CANCELLED,
      });

      // Reset player's onTransfer flag
      await this.playerRepo.update(playerId, {
        onTransfer: false,
      });

      // Release buyer's locked cash if they had a bid (use bidLockAmount, not transfer amount)
      const auctionForRelease = await this.auctionRepo.findOne({
        where: { id: auctionId as Uuid },
      });
      if (
        auctionForRelease?.bidLockAmount &&
        auctionForRelease?.currentBidderId === buyerTeamId
      ) {
        await this.teamRepo.decrement(
          { id: buyerTeamId as Uuid },
          'lockedCash',
          auctionForRelease.bidLockAmount,
        );
      }

      throw error;
    }
  }
}
