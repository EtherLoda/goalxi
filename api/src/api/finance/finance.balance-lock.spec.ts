import {
  FanEntity,
  FinanceEntity,
  PlayerEntity,
  StadiumEntity,
  StaffEntity,
  TeamEntity,
  TransactionEntity,
  Uuid,
} from '@goalxi/database';
import { LOGGER_SERVICE } from '@goalxi/logger';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { FinanceService } from './finance.service';

/**
 * Balance updates must read under a write lock.
 *
 * ## The bug
 *
 * `processTransaction` did `findOneBy({ teamId })` → `balance += amount`
 * → `save`, all inside `dataSource.transaction`. The transaction did not
 * help. At READ COMMITTED (Postgres' default) each statement takes a
 * fresh snapshot, so two concurrent settlements for the same club both
 * read the same starting balance, both compute `balance + amount`, and
 * the second `save` silently discards the first increment.
 *
 * The money was not lost from the ledger — both `transaction` rows
 * existed — so the books did not reconcile with the balance, and the
 * `match-completion` / `auction` / prize paths all funnel through here.
 *
 * ## What the test asserts
 *
 * That the balance read carries `lock: { mode: 'pessimistic_write' }`.
 * This is the third site to write that read-modify-write; the other two
 * (`league-award.addPrizeToTeam`, `auction.service`) already do.
 */
describe('FinanceService — balance read-modify-write', () => {
  let service: FinanceService;
  let financeRepo: { findOne: jest.Mock; save: jest.Mock };
  let transactionRepo: { create: jest.Mock; save: jest.Mock };
  let managerGetRepository: jest.Mock;

  beforeEach(async () => {
    financeRepo = {
      findOne: jest.fn().mockResolvedValue({
        teamId: 'team-1',
        balance: 1_000,
      } as any),
      save: jest.fn(async (f: any) => f),
    };
    transactionRepo = {
      create: jest.fn((o: any) => o),
      save: jest.fn(async (t: any) => t),
    };

    managerGetRepository = jest.fn((entity: any) => {
      switch (entity?.name) {
        case 'FinanceEntity':
          return financeRepo;
        case 'TransactionEntity':
          return transactionRepo;
        default:
          throw new Error(`unmocked ${entity?.name}`);
      }
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinanceService,
        {
          provide: LOGGER_SERVICE,
          useValue: { log: jest.fn(), error: jest.fn(), warn: jest.fn() },
        },
        {
          provide: getDataSourceToken(),
          useValue: {
            transaction: jest.fn(async (cb: any) =>
              cb({
                getRepository: managerGetRepository,
                create: (e: any, o: any) => o,
              }),
            ),
          },
        },
        { provide: getRepositoryToken(FinanceEntity), useValue: {} },
        { provide: getRepositoryToken(TransactionEntity), useValue: {} },
        { provide: getRepositoryToken(TeamEntity), useValue: {} },
        { provide: getRepositoryToken(FanEntity), useValue: {} },
        { provide: getRepositoryToken(StadiumEntity), useValue: {} },
        { provide: getRepositoryToken(StaffEntity), useValue: {} },
        { provide: getRepositoryToken(PlayerEntity), useValue: {} },
      ],
    }).compile();

    service = module.get<FinanceService>(FinanceService);
  });

  it('reads the balance under a pessimistic write lock', async () => {
    await service.processTransaction(
      'team-1' as Uuid,
      500,
      'TICKET_INCOME' as any,
      1,
      3,
    );

    expect(financeRepo.findOne).toHaveBeenCalledWith({
      where: { teamId: 'team-1' },
      lock: { mode: 'pessimistic_write' },
    });
  });

  it('does not use the unlocked findOneBy for the balance', async () => {
    // `findOneBy` takes no options, so it can never carry a lock. Its
    // presence here would mean the read-modify-write slipped back.
    await service.processTransaction(
      'team-1' as Uuid,
      500,
      'TICKET_INCOME' as any,
      1,
      3,
    );

    expect((financeRepo as any).findOneBy).toBeUndefined();
  });

  it('still writes both the balance and a ledger row', async () => {
    await service.processTransaction(
      'team-1' as Uuid,
      500,
      'TICKET_INCOME' as any,
      1,
      3,
    );

    expect(financeRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ balance: 1_500 }),
    );
    expect(transactionRepo.save).toHaveBeenCalledTimes(1);
  });

  it('raises NotFoundException when the club has no finance row', async () => {
    financeRepo.findOne.mockResolvedValue(null);

    await expect(
      service.processTransaction(
        'team-1' as Uuid,
        500,
        'TICKET_INCOME' as any,
        1,
        3,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('processWeeklySettlementAtomic', () => {
    it('also locks the finance row it accumulates onto in memory', async () => {
      // This path is a WIDER read-modify-write than `processTransaction`:
      // it reads the balance once, then applies one sponsorship add and
      // four expense subtracts to the in-memory entity, and saves once at
      // the end. Without a lock the overlap window is the whole method.
      const teamRepo = {
        findOne: jest.fn().mockResolvedValue({
          id: 'team-1',
          league: { tier: 1 },
        } as any),
      };
      const emptyRepo = {
        find: jest.fn().mockResolvedValue([]),
        findOne: jest.fn().mockResolvedValue(null),
      };

      managerGetRepository.mockImplementation((entity: any) => {
        switch (entity?.name) {
          case 'FinanceEntity':
            return financeRepo;
          case 'TransactionEntity':
            return transactionRepo;
          case 'TeamEntity':
            return teamRepo;
          default:
            return emptyRepo;
        }
      });

      await service.processWeeklySettlementAtomic('team-1' as Uuid, 1, 3, {
        getRepository: managerGetRepository,
      } as any);

      expect(financeRepo.findOne).toHaveBeenCalledWith({
        where: { teamId: 'team-1' },
        lock: { mode: 'pessimistic_write' },
      });
    });
  });
});
