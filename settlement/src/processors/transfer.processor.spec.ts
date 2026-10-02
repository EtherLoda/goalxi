import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Job } from 'bullmq';
import { TransferProcessor } from './transfer.processor';
import { LOGGER_SERVICE_PROVIDER, mockLogger } from '../test-utils/test-logger';
import { NotificationService } from '../notification/notification.service';
import {
  AuctionEntity,
  AuctionStatus,
  PlayerEntity,
  PlayerEventEntity,
  PlayerTransactionEntity,
  TeamEntity,
  FinanceEntity,
  TransactionEntity,
  TransferTransactionEntity,
  TransferTransactionStatus,
  Uuid,
} from '@goalxi/database';

/**
 * `TransferProcessor` is the worker that moves money and players between
 * clubs. It had **zero** tests.
 *
 * That matters more than the usual "untested file" complaint: every
 * branch here either moves a balance or is a concurrency guard whose
 * failure mode is silent and permanent. The hazards pinned:
 *
 *   - the claim CAS. Two workers racing one row must produce exactly one
 *     settlement; a regression double-pays a club.
 *   - the FAILED-path CAS. A naive `update(id, { FAILED })` would
 *     overwrite a sibling worker's `COMPLETED`, after which the recovery
 *     cron CANCELS an auction that is already SOLD.
 *   - the balance check. It must read under a write lock and must
 *     account for `lockedCash` — a club with £2m committed to active
 *     bids does not have £2m to spend.
 *   - post-commit notifications. They must never roll back a transfer
 *     that has already settled.
 *
 * DI note: only `transferTxRepo` and `notificationService` are read off
 * `this`. The other seven injected repositories are dead constructor
 * parameters and are stubbed with `{}`; the settlement path goes through
 * `manager.getRepository(...)`.
 */
describe('TransferProcessor', () => {
  const TX_ID = 'tx-1' as Uuid;
  const AUCTION_ID = 'auction-1' as Uuid;
  const BUYER = 'buyer-team' as Uuid;
  const SELLER = 'seller-team' as Uuid;
  const PLAYER_ID = 42;
  const FEE = 1_000_000;

  let processor: TransferProcessor;

  let transferTxRepo: { findOne: jest.Mock; update: jest.Mock };
  let notificationService: { create: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  let repos: Record<string, any>;
  let managerCreate: jest.Mock;
  let financeQuery: { where: jest.Mock; setLock: jest.Mock; getOne: jest.Mock };
  let rows: Record<string, any>;
  let txCalls: number;
  /** When set, the settlement transaction (call 1) throws. */
  let settlementError: Error | null;

  const finance = (teamId: string, balance: number) => ({
    id: `fin-${teamId}`,
    teamId,
    balance,
  });

  const job = (over: Record<string, unknown> = {}) =>
    ({
      data: {
        type: 'AUCTION_COMPLETE',
        transactionId: TX_ID,
        auctionId: AUCTION_ID,
        playerId: PLAYER_ID,
        buyerTeamId: BUYER,
        sellerTeamId: SELLER,
        amount: FEE,
        season: 1,
        traceId: 'trace-1',
        ...over,
      },
    }) as unknown as Job<any>;

  /** The single `update` call whose patch sets `status`. */
  const updateSetting = (status: string) =>
    transferTxRepo.update.mock.calls.find((c) => c[1]?.status === status);

  /** Rows written through `manager.create(Entity, row)`. */
  const createdWith = (entityName: string) =>
    managerCreate.mock.calls
      .filter((c) => c[0]?.name === entityName)
      .map((c) => c[1]);

  const resetRows = () => {
    rows = {
      buyerTeam: { id: BUYER, userId: 'buyer-user', lockedCash: 0 },
      sellerTeam: { id: SELLER, userId: 'seller-user' },
      'team:buyer-team': { id: BUYER, userId: 'buyer-user', lockedCash: 0 },
      'team:seller-team': { id: SELLER, userId: 'seller-user' },
      'finance:buyer-team': finance(BUYER, 5_000_000),
      'finance:seller-team': finance(SELLER, 1_000_000),
      player: {
        id: PLAYER_ID,
        name: 'Test Player',
        teamId: SELLER,
        onTransfer: true,
      },
      auction: {
        id: AUCTION_ID,
        bidLockAmount: FEE,
        currentBidderId: BUYER,
      },
    };
  };

  /** Fake `transfer_transaction` row, so the CAS criteria are load-bearing. */
  let txRow: Record<string, any>;

  /**
   * Minimal stand-in for TypeORM's conditional `update(criteria, patch)`.
   *
   * The whole point of the processor's concurrency handling is the
   * `where` clause — `status: In([PENDING, PROCESSING])` is what stops a
   * losing worker from stamping FAILED over a sibling's COMPLETED. A mock
   * that just returns a fixed `affected` cannot see that clause at all,
   * and deleting it would leave every test green. So this evaluates the
   * criteria against a fake row instead.
   *
   * `FindOperator._value` is TypeORM-internal, but it is the only way to
   * read back an `In([...])` operand without a real DataSource.
   */
  const casUpdate = jest.fn();

  /** Body of {@link casUpdate}; reinstalled on every `beforeEach`. */
  const applyCas = async (criteria: any, patch: any) => {
    if (!txRow) return { affected: 0 }; // row vanished
    const wanted = criteria?.status;
    const allowed = !wanted
      ? null // unconditional
      : Array.isArray(wanted)
        ? wanted
        : Array.isArray(wanted?._value)
          ? wanted._value
          : [wanted];

    if (allowed && !allowed.includes(txRow.status)) {
      return { affected: 0 };
    }
    Object.assign(txRow, patch);
    return { affected: 1 };
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // `clearAllMocks` drops recorded calls but NOT implementations, so a
    // test that swaps this out would otherwise leak into the next one.
    casUpdate.mockImplementation(applyCas);
    mockLogger.child.mockReturnValue(mockLogger);
    resetRows();

    repos = {
      AuctionEntity: {
        update: jest.fn().mockResolvedValue({ affected: 1 }),
        findOne: jest.fn(async () => rows.auction),
      },
      PlayerEntity: {
        findOne: jest.fn(async () => rows.player),
        save: jest.fn(async (r: any) => r),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      },
      TeamEntity: {
        findOne: jest.fn(async ({ where }: any) => rows[`team:${where.id}`]),
        decrement: jest.fn().mockResolvedValue({ affected: 1 }),
      },
      FinanceEntity: { save: jest.fn(async (r: any) => r) },
      TransactionEntity: { save: jest.fn(async (r: any) => r) },
      PlayerEventEntity: { save: jest.fn(async (r: any) => r) },
      PlayerTransactionEntity: { save: jest.fn(async (r: any) => r) },
    };

    // Finance rows are reached via a query builder — that is where the
    // pessimistic lock is taken — so route by the bound `:teamId`.
    let boundTeamId = '';
    financeQuery = {
      where: jest.fn((_w: string, params: any) => {
        boundTeamId = String(params?.teamId ?? '');
        return financeQuery;
      }),
      setLock: jest.fn(() => financeQuery),
      getOne: jest.fn(async () => rows[`finance:${boundTeamId}`]),
    };

    managerCreate = jest.fn((_e: any, row: any) => row);
    const manager = {
      getRepository: jest.fn((entity: any) => repos[entity?.name]),
      createQueryBuilder: jest.fn(() => financeQuery),
      create: managerCreate,
      save: jest.fn(async (r: any) => r),
    };

    txCalls = 0;
    settlementError = null;
    dataSource = {
      transaction: jest.fn(async (cb: any) => {
        txCalls++;
        // Mirrors TypeORM: a throwing callback rolls back and rethrows.
        // Only the settlement (call 1) can fail; the cleanup (call 2)
        // must still run.
        if (txCalls === 1 && settlementError) throw settlementError;
        return cb(manager);
      }),
    };

    transferTxRepo = {
      findOne: jest.fn(async () => txRow),
      update: casUpdate,
    };

    // Default: an unclaimed PENDING row, which is claimable.
    txRow = {
      id: TX_ID,
      status: TransferTransactionStatus.PENDING,
      claimedAt: null,
      failureReason: null,
    };

    notificationService = { create: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LOGGER_SERVICE_PROVIDER,
        TransferProcessor,
        { provide: DataSource, useValue: dataSource },
        { provide: NotificationService, useValue: notificationService },
        {
          provide: getRepositoryToken(TransferTransactionEntity),
          useValue: transferTxRepo,
        },
        // Dead constructor params — stubbed so Nest can resolve them.
        { provide: getRepositoryToken(AuctionEntity), useValue: {} },
        { provide: getRepositoryToken(PlayerEntity), useValue: {} },
        { provide: getRepositoryToken(TeamEntity), useValue: {} },
        { provide: getRepositoryToken(PlayerEventEntity), useValue: {} },
        { provide: getRepositoryToken(PlayerTransactionEntity), useValue: {} },
        { provide: getRepositoryToken(FinanceEntity), useValue: {} },
        { provide: getRepositoryToken(TransactionEntity), useValue: {} },
      ],
    }).compile();

    processor = module.get<TransferProcessor>(TransferProcessor);
  });

  describe('claim / idempotency', () => {
    it('throws when the transaction row does not exist', async () => {
      txRow = null as any;
      await expect(processor.process(job())).rejects.toThrow(/not found/);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('skips a COMPLETED transaction without touching any row', async () => {
      txRow = { id: TX_ID, status: TransferTransactionStatus.COMPLETED };

      await processor.process(job());

      // A duplicate BullMQ delivery must be a complete no-op.
      expect(casUpdate).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('refuses to take over a FAILED transaction', async () => {
      txRow = {
        id: TX_ID,
        status: TransferTransactionStatus.FAILED,
        failureReason: 'insufficient balance',
      };

      await expect(processor.process(job())).rejects.toThrow(
        /previously failed: insufficient balance/,
      );
      // Re-running cannot fix a terminal row, and must not start a
      // cleanup transaction for one.
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('refuses when a fresh PROCESSING claim belongs to another worker', async () => {
      txRow = {
        id: TX_ID,
        status: TransferTransactionStatus.PROCESSING,
        claimedAt: new Date(),
      };

      await expect(processor.process(job())).rejects.toThrow(
        /already being processed/,
      );
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('takes over a stale PROCESSING claim (crashed-worker escape hatch)', async () => {
      txRow = {
        id: TX_ID,
        status: TransferTransactionStatus.PROCESSING,
        claimedAt: new Date(Date.now() - 11 * 60 * 1000),
      };

      await processor.process(job());

      expect(updateSetting(TransferTransactionStatus.PROCESSING)).toBeTruthy();
      expect(updateSetting(TransferTransactionStatus.COMPLETED)).toBeTruthy();
    });

    it('aborts settlement when the claim CAS affects no rows', async () => {
      // Both racers see "claimable"; only one UPDATE lands.
      casUpdate.mockResolvedValue({ affected: 0 });

      await expect(processor.process(job())).rejects.toThrow(/CAS race/);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('balance safety', () => {
    it('throws when the buyer team is missing', async () => {
      rows['team:buyer-team'] = null;
      await expect(processor.process(job())).rejects.toThrow(/Buyer team/);
    });

    it('throws when the buyer has no finance row', async () => {
      rows['finance:buyer-team'] = null;
      await expect(processor.process(job())).rejects.toThrow(
        /Buyer finance record not found/,
      );
    });

    it('throws when the seller has no finance row', async () => {
      rows['finance:seller-team'] = null;
      await expect(processor.process(job())).rejects.toThrow(
        /Seller finance record not found/,
      );
    });

    it('rejects a buyer whose balance is short', async () => {
      rows['finance:buyer-team'] = finance(BUYER, FEE - 1);
      await expect(processor.process(job())).rejects.toThrow(
        /insufficient balance/,
      );
    });

    it('subtracts lockedCash before deciding affordability', async () => {
      // £2m on hand but £2m committed to active bids, so a £1m fee is
      // not affordable. This is what stops a club over-committing across
      // concurrent auctions.
      rows['team:buyer-team'] = {
        id: BUYER,
        userId: 'buyer-user',
        lockedCash: 2_000_000,
      };
      rows['finance:buyer-team'] = finance(BUYER, 2_000_000);

      await expect(processor.process(job())).rejects.toThrow(
        /insufficient balance/,
      );
    });

    it('reads the balance under a pessimistic write lock', async () => {
      await processor.process(job());

      // Without the lock, two concurrent settlements read the same
      // balance and one increment is silently lost.
      expect(financeQuery.setLock).toHaveBeenCalledWith('pessimistic_write');
    });
  });

  describe('settlement', () => {
    it('debits the buyer and credits the seller by exactly `amount`', async () => {
      await processor.process(job());

      expect(rows['finance:buyer-team'].balance).toBe(5_000_000 - FEE);
      expect(rows['finance:seller-team'].balance).toBe(1_000_000 + FEE);
    });

    it('records the fee as a matched debit/credit pair that nets to zero', async () => {
      await processor.process(job());

      const ledger = createdWith('TransactionEntity');
      const amounts = ledger.map((r: any) => r.amount);
      expect(amounts).toEqual([-FEE, FEE]);
      expect(amounts.reduce((a: number, b: number) => a + b, 0)).toBe(0);
      expect(ledger[0].type).not.toBe(ledger[1].type);
    });

    it('moves the player to the buyer and clears onTransfer', async () => {
      await processor.process(job());

      expect(repos.PlayerEntity.save).toHaveBeenCalled();
      expect(rows.player.teamId).toBe(BUYER);
      expect(rows.player.onTransfer).toBe(false);
    });

    it('marks the auction SOLD with the buyer as winner', async () => {
      await processor.process(job());

      const sold = repos.AuctionEntity.update.mock.calls.find(
        (c: any[]) => c[1]?.status === AuctionStatus.SOLD,
      );
      expect(sold).toBeTruthy();
      expect(sold![1]).toEqual(expect.objectContaining({ winnerId: BUYER }));
    });

    it('leaves auction.endsAt alone (single-purpose column)', async () => {
      await processor.process(job());

      const sold = repos.AuctionEntity.update.mock.calls.find(
        (c: any[]) => c[1]?.status === AuctionStatus.SOLD,
      );
      // It used to be stamped by both the buyout handler and here, giving
      // one nullable column two different meanings.
      expect(sold![1].endsAt).toBeUndefined();
    });

    it('stamps the transaction COMPLETED with a settledAt', async () => {
      await processor.process(job());

      const done = updateSetting(TransferTransactionStatus.COMPLETED);
      expect(done).toBeTruthy();
      expect(done![1].settledAt).toBeInstanceOf(Date);
    });

    it('writes a TRANSFER player event carrying the full deal', async () => {
      await processor.process(job());

      expect(createdWith('PlayerEventEntity')).toEqual([
        expect.objectContaining({
          playerId: PLAYER_ID,
          details: expect.objectContaining({
            fromTeamId: SELLER,
            toTeamId: BUYER,
            price: FEE,
            auctionId: AUCTION_ID,
          }),
        }),
      ]);
    });

    it('writes a player transaction row linking both clubs', async () => {
      await processor.process(job());

      expect(createdWith('PlayerTransactionEntity')).toEqual([
        expect.objectContaining({
          playerId: PLAYER_ID,
          fromTeamId: SELLER,
          toTeamId: BUYER,
          price: FEE,
        }),
      ]);
    });

    it("releases the buyer's lockedCash on AUCTION_COMPLETE", async () => {
      await processor.process(job());

      // Regression guard: the old comparison was inverted, so the
      // winner's lockedCash was never released and their availableFunds
      // drifted lower every season.
      expect(repos.TeamEntity.decrement).toHaveBeenCalledWith(
        { id: BUYER },
        'lockedCash',
        FEE,
      );
    });
  });

  describe('failure path', () => {
    beforeEach(() => {
      settlementError = new Error('settlement exploded');
    });

    it('stamps FAILED with the reason and rethrows', async () => {
      await expect(processor.process(job())).rejects.toThrow(
        'settlement exploded',
      );

      const failed = updateSetting(TransferTransactionStatus.FAILED);
      expect(failed).toBeTruthy();
      expect(failed![1].failureReason).toBe('settlement exploded');
    });

    it('cancels the auction and un-freezes the player in one cleanup tx', async () => {
      await expect(processor.process(job())).rejects.toThrow();

      // Settlement (rolled back) + cleanup = two transactions.
      expect(dataSource.transaction).toHaveBeenCalledTimes(2);

      const cancelled = repos.AuctionEntity.update.mock.calls.find(
        (c: any[]) => c[1]?.status === AuctionStatus.CANCELLED,
      );
      expect(cancelled).toBeTruthy();
      expect(repos.PlayerEntity.update).toHaveBeenCalledWith(PLAYER_ID, {
        onTransfer: false,
      });
    });

    it("releases the buyer's locked cash during cleanup", async () => {
      await expect(processor.process(job())).rejects.toThrow();

      expect(repos.TeamEntity.decrement).toHaveBeenCalledWith(
        { id: BUYER },
        'lockedCash',
        FEE,
      );
    });

    it('skips the cleanup when the FAILED CAS affects no rows', async () => {
      // A sibling worker settled the row (COMPLETED) while ours was
      // failing. The FAILED CAS filters on
      // `status IN (PENDING, PROCESSING)`, so it must affect 0 rows and
      // the cleanup must be skipped — otherwise we CANCEL an auction
      // that is already SOLD. This is the regression the CAS exists for.
      dataSource.transaction.mockImplementation(async () => {
        txRow = { ...txRow, status: TransferTransactionStatus.COMPLETED };
        throw new Error('settlement exploded');
      });

      await expect(processor.process(job())).rejects.toThrow(
        'settlement exploded',
      );

      expect(txRow.status).toBe(TransferTransactionStatus.COMPLETED);
      // No second transaction, so no CANCELLED write.
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      const cancelled = repos.AuctionEntity.update.mock.calls.find(
        (c: any[]) => c[1]?.status === AuctionStatus.CANCELLED,
      );
      expect(cancelled).toBeUndefined();
    });
  });

  describe('notifications', () => {
    it('notifies both clubs after the transaction commits', async () => {
      await processor.process(job());

      expect(notificationService.create).toHaveBeenCalledTimes(2);
      expect(notificationService.create).toHaveBeenCalledWith(
        'buyer-user',
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ amount: FEE }),
      );
      expect(notificationService.create).toHaveBeenCalledWith(
        'seller-user',
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ amount: FEE }),
      );
    });

    it('does not roll back a settled transfer when a notification fails', async () => {
      notificationService.create.mockRejectedValue(new Error('redis down'));

      // Resolves, not rejects: the money already moved.
      await expect(processor.process(job())).resolves.toBeUndefined();
      expect(rows['finance:buyer-team'].balance).toBe(5_000_000 - FEE);
    });
  });
});
