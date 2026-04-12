import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Job } from 'bullmq';
import {
  AuctionEntity,
  AuctionStatus,
  PlayerEntity,
  PlayerHistoryEntity,
  PlayerHistoryType,
  PlayerTransactionEntity,
  TeamEntity,
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
    @InjectRepository(PlayerHistoryEntity)
    private readonly historyRepo: Repository<PlayerHistoryEntity>,
    @InjectRepository(PlayerTransactionEntity)
    private readonly playerTxRepo: Repository<PlayerTransactionEntity>,
    @InjectRepository(TransferTransactionEntity)
    private readonly transferTxRepo: Repository<TransferTransactionEntity>,
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
        const historyRepo = manager.getRepository(PlayerHistoryEntity);
        const playerTxRepo = manager.getRepository(PlayerTransactionEntity);

        // 1. Re-verify buyer has enough available cash
        const buyer = await teamRepo.findOne({
          where: { id: buyerTeamId as Uuid },
        });
        if (!buyer) {
          throw new Error(`Buyer team ${buyerTeamId} not found`);
        }

        const buyerAvailable = buyer.cash - buyer.lockedCash;
        if (buyerAvailable < amount) {
          throw new Error(
            `Insufficient funds: available ${buyerAvailable}, required ${amount}`,
          );
        }

        // 2. Deduct cash from buyer (NOT lockedCash - that's for bids)
        buyer.cash -= amount;
        await teamRepo.save(buyer);

        // 3. Add cash to seller
        const seller = await teamRepo.findOne({
          where: { id: sellerTeamId as Uuid },
        });
        if (!seller) {
          throw new Error(`Seller team ${sellerTeamId} not found`);
        }
        seller.cash += amount;
        await teamRepo.save(seller);

        // 4. Update player team
        const player = await playerRepo.findOne({
          where: { id: playerId as Uuid },
        });
        if (!player) {
          throw new Error(`Player ${playerId} not found`);
        }
        player.teamId = buyerTeamId;
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

        // 7. Create player history
        const history = manager.create(PlayerHistoryEntity, {
          playerId: playerId as Uuid,
          season: 1, // TODO: Get current season dynamically
          date: new Date(),
          eventType: PlayerHistoryType.TRANSFER,
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
          season: 1,
          transactionDate: new Date(),
          auctionId: auctionId as Uuid,
        });
        await manager.save(playerTx);

        this.logger.log(
          `[TransferProcessor] Successfully settled ${type}: Player ${playerId} transferred from Team ${sellerTeamId} to Team ${buyerTeamId} for ${amount}`,
        );
      });

      // 9. If buyer had a bid on this auction, release the locked amount
      if (type === 'AUCTION_COMPLETE') {
        const auction = await this.auctionRepo.findOne({
          where: { id: auctionId as Uuid },
        });
        if (
          auction &&
          auction.bidLockAmount &&
          auction.currentBidderId &&
          auction.currentBidderId !== buyerTeamId
        ) {
          // Release previous bidder's locked cash
          await this.teamRepo.decrement(
            { id: auction.currentBidderId as Uuid },
            'lockedCash',
            auction.bidLockAmount,
          );
          this.logger.log(
            `[TransferProcessor] Released ${auction.bidLockAmount} locked cash from previous bidder ${auction.currentBidderId}`,
          );
        }
      }

      // 10. For BUYOUT, also release any previous bid lock from this buyer if exists
      if (type === 'BUYOUT') {
        const auction = await this.auctionRepo.findOne({
          where: { id: auctionId as Uuid },
        });
        if (
          auction &&
          auction.bidLockAmount &&
          auction.currentBidderId === buyerTeamId
        ) {
          // Release the bid lock amount
          await this.teamRepo.decrement(
            { id: buyerTeamId as Uuid },
            'lockedCash',
            auction.bidLockAmount,
          );
          this.logger.log(
            `[TransferProcessor] Released ${auction.bidLockAmount} bid lock from buyer ${buyerTeamId}`,
          );
        }
      }
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

      // Release buyer's locked cash if they had a bid
      await this.teamRepo.decrement(
        { id: buyerTeamId as Uuid },
        'lockedCash',
        amount,
      );

      throw error;
    }
  }
}
