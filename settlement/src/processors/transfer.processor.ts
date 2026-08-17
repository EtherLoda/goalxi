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

      // Execute settlement in a transaction. The settlement
      // callback captures the values the post-commit
      // notification fan-out needs (buyer / seller userId,
      // player name) into a closure-scoped object so we can
      // fire the notifications outside the transaction.
      const settledContext: {
        buyerUserId?: string;
        sellerUserId?: string;
        playerName?: string;
      } = {};
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
        // No `endsAt` here. The column used to be stamped in
        // both the buyout handler (trigger time) and here
        // (settlement complete time) — two slightly different
        // "end" timestamps landing in the same nullable
        // column, with the column being read back by no
        // business logic. The buyout handler no longer touches
        // it (K2 commit); we drop it here too, leaving
        // `endsAt` as a single-purpose "natural expiry"
        // timestamp owned by the finalize cron (EXPIRED only).
        // "When did SOLD actually happen" lives on
        // `transferTx.settledAt` below, which is the only
        // column with a real reader (the auction-history API).
        await auctionRepo.update(auctionId as Uuid, {
          status: AuctionStatus.SOLD,
          winnerId: buyerTeamId as Uuid,
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

        // 9. Release the buyer's locked cash on successful
        // settlement. `lockedCash` represents "cash committed
        // to an active bid"; once the bid becomes a paid
        // transfer the lock should come off so the team's
        // `availableFunds` (balance − lockedCash) reflects
        // reality.
        //
        // The previous version had the comparison inverted
        // (`currentBidderId !== buyerTeamId`) on the
        // AUCTION_COMPLETE branch, which was dead code: in an
        // AUCTION_COMPLETE settlement the buyer IS the
        // currentBidder (they placed the winning bid, no one
        // superseded them). The result was that the winner's
        // `lockedCash` was never decremented after a settled
        // auction, and over a season their `availableFunds`
        // drifted ever lower — a team that won 3 auctions
        // for 100k each would still show 300k of
        // permanently-locked cash even though the cash had
        // already been spent via the `buyerFinance.balance
        // -= amount` debit two steps above.
        //
        // The BUYOUT branch below already had the right
        // comparison (`=== buyerTeamId`) — AUCTION_COMPLETE
        // is just brought in line.
        if (type === 'AUCTION_COMPLETE') {
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
              `[TransferProcessor] Released ${auction.bidLockAmount} locked cash from auction winner ${buyerTeamId}`,
            );
          }
        }

        // 10. For BUYOUT, release buyer's own bid lock (the
        // L1 fix made buyout increment `lockedCash` and stamp
        // `auction.bidLockAmount`; this is the matching
        // release on success). Inside the same tx so a
        // crash between the balance debit and the lock
        // release can't strand the team.
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

        // Capture the buyer / seller userIds and the player
        // name inside the transaction so the notification
        // fan-out below runs outside the dataSource.transaction.
        // Notification creation can hit a third-party service
        // and we don't want it holding the row lock the entire
        // time.
        const buyerUserId = (
          await teamRepo.findOne({
            where: { id: buyerTeamId as Uuid },
            select: ['userId'],
          })
        )?.userId;
        const sellerUserId = (
          await teamRepo.findOne({
            where: { id: sellerTeamId as Uuid },
            select: ['userId'],
          })
        )?.userId;
        const playerName = player.name;

        this.jobLog.info(
          `[TransferProcessor] Successfully settled ${type}: Player ${playerId} transferred from Team ${sellerTeamId} to Team ${buyerTeamId} for ${amount}`,
        );

        // Publish the post-commit context back to the outer
        // closure. The transaction itself is still void — TypeORM
        // commits when the callback returns without throwing.
        Object.assign(settledContext, {
          buyerUserId,
          sellerUserId,
          playerName,
        });
      });

      // Notifications fire AFTER the settlement transaction
      // has committed, so a slow / failing notification
      // service can't roll back a settled transfer. Both
      // notifications are best-effort — a failure on either
      // is logged but does not throw.
      const { buyerUserId, sellerUserId, playerName } = settledContext;

      if (buyerUserId) {
        try {
          await this.notificationService.create(
            buyerUserId,
            NotificationType.PLAYER_PURCHASED,
            'notification.playerPurchased',
            {
              playerId,
              playerName,
              amount,
              fromTeamId: sellerTeamId,
              toTeamId: buyerTeamId,
            },
          );
        } catch (notifErr) {
          this.jobLog.warn(
            `[TransferProcessor] Buyer notification failed for transaction ${transactionId}: ${
              notifErr instanceof Error ? notifErr.message : String(notifErr)
            }`,
          );
        }
      }

      if (sellerUserId) {
        try {
          await this.notificationService.create(
            sellerUserId,
            NotificationType.PLAYER_SOLD,
            'notification.playerSold',
            {
              playerId,
              playerName,
              amount,
              fromTeamId: sellerTeamId,
              toTeamId: buyerTeamId,
            },
          );
        } catch (notifErr) {
          this.jobLog.warn(
            `[TransferProcessor] Seller notification failed for transaction ${transactionId}: ${
              notifErr instanceof Error ? notifErr.message : String(notifErr)
            }`,
          );
        }
      }
    } catch (error) {
      this.jobLog.error(
        `[TransferProcessor] Failed to process transaction ${transactionId}: ${error.message || error}`,
      );

      // Mark the transaction FAILED via a CAS so we never
      // clobber a row another worker has already taken to
      // COMPLETED. The race: our CAS claim lost (we threw
      // before settling), but a sibling worker that *won* the
      // CAS has already finished the settlement and stamped
      // COMPLETED. A naive `update(id, {FAILED})` here would
      // overwrite COMPLETED → FAILED, lying to the
      // recoverStuckSettlingAuctions path (which would then
      // CANCEL the auction that's already SOLD). The CAS
      // only fires on PENDING / PROCESSING; on a lost race
      // the other worker's COMPLETED write is the
      // authoritative truth and we skip both the FAILED
      // stamp and the cleanup tx (the sibling will/has
      // already done it).
      const failResult = await this.transferTxRepo.update(
        {
          id: transactionId as Uuid,
          status: In([
            TransferTransactionStatus.PENDING,
            TransferTransactionStatus.PROCESSING,
          ]),
        },
        {
          status: TransferTransactionStatus.FAILED,
          failureReason: error.message || 'Unknown error',
        },
      );
      if (!failResult.affected) {
        this.jobLog.warn(
          `[TransferProcessor] Transaction ${transactionId} already in terminal state, skipping FAILED + cleanup`,
        );
        throw error;
      }

      // Cleanup the surrounding state in a single transaction.
      // Before this was four independent awaits — a partial
      // failure (e.g. CANCELLED written, then the player update
      // or the lockedCash release failed) would leave the
      // player stuck on `onTransfer = true` until the next
      // restart, since the api-side recovery only runs on
      // bootstrap.
      try {
        await this.dataSource.transaction(async (manager) => {
          const txAuctionRepo = manager.getRepository(AuctionEntity);
          const txPlayerRepo = manager.getRepository(PlayerEntity);
          const txTeamRepo = manager.getRepository(TeamEntity);

          await txAuctionRepo.update(auctionId as Uuid, {
            status: AuctionStatus.CANCELLED,
          });
          await txPlayerRepo.update(playerId, {
            onTransfer: false,
          });

          // Release the buyer's locked cash if they were the
          // current high bidder. Read inside the same tx so we
          // see the post-CANCELLED auction row consistently.
          const auctionForRelease = await txAuctionRepo.findOne({
            where: { id: auctionId as Uuid },
          });
          if (
            auctionForRelease?.bidLockAmount &&
            auctionForRelease?.currentBidderId === buyerTeamId
          ) {
            await txTeamRepo.decrement(
              { id: buyerTeamId as Uuid },
              'lockedCash',
              auctionForRelease.bidLockAmount,
            );
          }
        });
      } catch (cleanupError) {
        // The settlement already failed; if the cleanup tx also
        // failed, log loudly and let the next bootstrap recover
        // (transferTx is already FAILED, so the recovery path
        // will see the FAILED state and finish the cleanup).
        this.jobLog.error(
          `[TransferProcessor] Cleanup transaction also failed for transaction ${transactionId}: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
          cleanupError instanceof Error ? cleanupError.stack : undefined,
        );
      }

      throw error;
    }
  }
}
