import {
  AuctionEntity,
  AuctionStatus,
  PlayerEntity,
  PlayerEventEntity,
  TeamEntity,
  TransferTransactionEntity,
} from '@goalxi/database';
import { LOGGER_SERVICE } from '@goalxi/logger';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { DataSource } from 'typeorm';
import { AuctionRedisRepository } from '../../redis/auction-redis.repository';
import { FinanceService } from '../finance/finance.service';
import { NotificationRedisService } from '../notification/notification-redis.service';
import { AuctionService } from './auction.service';

/**
 * Settlement enqueue must happen AFTER the transaction commits.
 *
 * ## The bug
 *
 * `enqueueSettlement` is a **Redis** write. It was issued from inside the
 * `dataSource.transaction` callback that created the
 * `TransferTransactionEntity` row.
 *
 * If the transaction then rolled back — any failure after the enqueue,
 * including a commit-time constraint or connection error — the job would
 * reference a `transactionId` that never existed. `TransferProcessor`
 * would `findOne` it, find nothing, throw
 * `Transaction <id> not found`, and burn all 3 `attempts` (exponential
 * backoff). The auction stayed `SETTLING` with a player frozen on
 * transfer, permanently.
 *
 * ## Why "after commit" is the safe direction
 *
 * The reverse window — the process dying between commit and enqueue — is
 * recoverable, because `recoverStuckSettlingAuctions` (5-min cron)
 * re-enqueues from **Postgres**, not Redis. An enqueue published inside
 * the transaction has no such recovery path.
 */
describe('AuctionService — settlement enqueue ordering', () => {
  let service: AuctionService;
  let auctionRepo: any;
  let transferQueue: { add: jest.Mock };
  let transactionShouldThrow: boolean;
  let addWhileInsideTransaction: boolean;

  /** True while the transaction callback is executing. */
  let insideTransaction = false;

  const expiredAuction = {
    id: 'auction-1',
    playerId: 'player-1',
    teamId: 'seller-team',
    currentBidderId: 'buyer-team',
    currentPrice: 5_000_000,
    expiresAt: new Date(Date.now() - 1000),
    status: AuctionStatus.ACTIVE,
    bidLockAmount: 5_000_000,
  } as any;

  beforeEach(async () => {
    transactionShouldThrow = false;
    addWhileInsideTransaction = false;
    insideTransaction = false;

    transferQueue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };

    const txManager = {
      create: jest.fn((_e: any, o: any) => ({ ...o, id: 'tx-1' })),
      save: jest.fn(async (o: any) => o),
      getRepository: jest.fn((entity: any) => {
        switch (entity?.name) {
          case 'AuctionEntity':
            return {
              update: jest.fn().mockResolvedValue({ affected: 1 }),
              save: jest.fn(async (o: any) => o),
            };
          case 'TransferTransactionEntity':
            return {
              create: jest.fn((o: any) => ({ ...o, id: 'tx-1' })),
              save: jest.fn(async (o: any) => o),
            };
          case 'PlayerEntity':
            return {
              findOne: jest.fn().mockResolvedValue(null),
              save: jest.fn(),
            };
          default:
            throw new Error(`unmocked ${entity?.name}`);
        }
      }),
    };

    const dataSource = {
      transaction: jest.fn(async (cb: any) => {
        insideTransaction = true;
        try {
          const out = await cb(txManager);
          // Fail at COMMIT time, after every write in the callback has
          // already been issued. Throwing before the callback would not
          // exercise the bug at all: the enqueue simply never ran, so
          // the old in-transaction code would pass.
          if (transactionShouldThrow) {
            throw new Error('ROLLBACK: commit failed');
          }
          return out;
        } finally {
          insideTransaction = false;
        }
      }),
      // `getCurrentSeason()` reads MAX(season) off the match table.
      getRepository: jest.fn((entity: any) => {
        if (entity?.name !== 'MatchEntity') {
          throw new Error(`dataSource.getRepository: unmocked ${entity?.name}`);
        }
        return {
          createQueryBuilder: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnThis(),
            getRawOne: jest.fn().mockResolvedValue({ maxSeason: 3 }),
          }),
        };
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuctionService,
        {
          provide: LOGGER_SERVICE,
          useValue: {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
            info: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: getRepositoryToken(AuctionEntity),
          useValue: {
            find: jest.fn().mockResolvedValue([expiredAuction]),
            findOne: jest.fn().mockResolvedValue(expiredAuction),
            update: jest.fn().mockResolvedValue({ affected: 1 }),
            save: jest.fn(async (o: any) => o),
          },
        },
        {
          provide: getRepositoryToken(PlayerEntity),
          useValue: { findOne: jest.fn(), save: jest.fn() },
        },
        {
          provide: getRepositoryToken(TeamEntity),
          useValue: { findOne: jest.fn(), save: jest.fn() },
        },
        { provide: getRepositoryToken(PlayerEventEntity), useValue: {} },
        { provide: FinanceService, useValue: {} },
        {
          provide: getRepositoryToken(TransferTransactionEntity),
          useValue: { findOne: jest.fn(), save: jest.fn(), create: jest.fn() },
        },
        { provide: 'BullQueue_transfer-settlement', useValue: transferQueue },
        {
          provide: AuctionRedisRepository,
          useValue: {
            getAuctionState: jest.fn().mockResolvedValue(null),
            acquireSettlementLock: jest.fn().mockResolvedValue(true),
            releaseSettlementLock: jest.fn().mockResolvedValue(undefined),
            cleanupAuction: jest.fn().mockResolvedValue(undefined),
            placeBid: jest.fn().mockResolvedValue(undefined),
            addTeamBid: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: NotificationRedisService, useValue: { push: jest.fn() } },
        {
          provide: ClsService,
          useValue: { get: jest.fn(), set: jest.fn(), run: jest.fn() },
        },
      ],
    }).compile();

    // Wrap the queue so we can record whether `add` happened while the
    // transaction was still open.
    const innerAdd = transferQueue.add.getMockImplementation()!;
    transferQueue.add.mockImplementation(async (...args: any[]) => {
      if (insideTransaction) addWhileInsideTransaction = true;
      return innerAdd(...args);
    });

    service = module.get<AuctionService>(AuctionService);
    auctionRepo = module.get(getRepositoryToken(AuctionEntity));
  });

  it('does NOT enqueue when the transaction rolls back', async () => {
    // Note: `finalizeExpiredAuctions` fans out with `Promise.allSettled`,
    // so a per-auction failure never rejects — it is logged and the batch
    // continues. That is deliberate, and it is exactly why the assertion
    // has to be "no job was published", not "it threw".
    transactionShouldThrow = true;

    await service.finalizeExpiredAuctions();

    expect(transferQueue.add).not.toHaveBeenCalled();
  });

  it('never calls the queue from inside the transaction callback', async () => {
    // The general invariant, independent of whether this particular tick
    // happens to fail: an enqueue issued while the transaction is open
    // can outlive a rollback.
    await service.finalizeExpiredAuctions();

    expect(addWhileInsideTransaction).toBe(false);
  });

  it('enqueues once after a successful commit', async () => {
    await service.finalizeExpiredAuctions();

    expect(transferQueue.add).toHaveBeenCalledTimes(1);
    expect(transferQueue.add).toHaveBeenCalledWith(
      'transfer-settlement',
      expect.objectContaining({ transactionId: 'tx-1' }),
      expect.objectContaining({ jobId: expect.any(String) }),
    );
  });
});
