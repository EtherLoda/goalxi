import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
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

export interface TransferSettlementJobData {
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
@Processor('transfer-settlement')
export class TransferProcessor extends WorkerHost {
  private readonly logger = new Logger(TransferProcessor.name);

  constructor(
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
    } = job.data;

    this.logger.log(
      `[TransferProcessor] Processing ${type} for transaction ${transactionId}`,
    );

    try {
      // Idempotency check
      const existingTx = await this.transferTxRepo.findOne({
        where: { id: transactionId as Uuid },
      });

      if (!existingTx) {
        this.logger.error(
          `[TransferProcessor] Transaction ${transactionId} not found`,
        );
        throw new Error(`Transaction ${transactionId} not found`);
      }

      if (existingTx.status === TransferTransactionStatus.COMPLETED) {
        this.logger.warn(
          `[TransferProcessor] Transaction ${transactionId} already completed, skipping`,
        );
        return;
      }

      if (existingTx.status === TransferTransactionStatus.PROCESSING) {
        this.logger.warn(
          `[TransferProcessor] Transaction ${transactionId} already being processed`,
        );
        throw new Error(`Transaction ${transactionId} already being processed`);
      }

      // Update transaction status to PROCESSING
      await this.transferTxRepo.update(transactionId as Uuid, {
        status: TransferTransactionStatus.PROCESSING,
      });

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

        const buyerFinance = await financeRepo.findOne({
          where: { teamId: buyerTeamId as Uuid },
        });
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

        // 3. Credit to seller
        const sellerFinance = await financeRepo.findOne({
          where: { teamId: sellerTeamId as Uuid },
        });
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
          where: { id: playerId as Uuid },
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
          playerId: playerId as Uuid,
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
          playerId: playerId as Uuid,
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
            this.logger.log(
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
            this.logger.log(
              `[TransferProcessor] Released ${auction.bidLockAmount} bid lock from buyer ${buyerTeamId}`,
            );
          }
        }

        this.logger.log(
          `[TransferProcessor] Successfully settled ${type}: Player ${playerId} transferred from Team ${sellerTeamId} to Team ${buyerTeamId} for ${amount}`,
        );
      });
    } catch (error) {
      this.logger.error(
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
      await this.playerRepo.update(playerId as Uuid, {
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
