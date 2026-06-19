import {
  MatchEntity,
  SEAT_DEMOLISH_REFUND_RATE,
  STADIUM_COST_PER_SEAT,
  StadiumConstructionEntity,
  StadiumConstructionKind,
  StadiumConstructionStatus,
  StadiumEntity,
  TeamEntity,
} from '@goalxi/database';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { NotificationService } from '../notification/notification.service';
import { StadiumConstructionProcessor } from './stadium-construction.processor';

describe('StadiumConstructionProcessor', () => {
  let processor: StadiumConstructionProcessor;
  let constructionRepo: jest.Mocked<Repository<StadiumConstructionEntity>>;
  let teamRepo: jest.Mocked<Repository<TeamEntity>>;
  let notificationService: jest.Mocked<NotificationService>;
  let dataSource: { transaction: jest.Mock };

  const mockConstruction = (
    overrides: Partial<StadiumConstructionEntity> = {},
  ): StadiumConstructionEntity =>
    ({
      id: 'construction-1',
      teamId: 'team-1',
      kind: StadiumConstructionKind.EXPAND,
      deltaSeats: 5_000,
      startingCapacity: 10_000,
      endingCapacity: 15_000,
      totalWeeks: 1,
      remainingWeeks: 1,
      cost: 5_000 * STADIUM_COST_PER_SEAT,
      refund: 0,
      status: StadiumConstructionStatus.IN_PROGRESS,
      seasonStarted: 1,
      weekStarted: 1,
      ...overrides,
    }) as StadiumConstructionEntity;

  beforeEach(async () => {
    const txManager = {
      getRepository: jest.fn().mockReturnValue({
        findOne: jest.fn(),
        save: jest.fn(),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        create: jest.fn((x: any) => x),
      }),
    };
    dataSource = {
      transaction: jest.fn(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
        (cb: any) => cb(txManager),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StadiumConstructionProcessor,
        {
          provide: getRepositoryToken(StadiumConstructionEntity),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(StadiumEntity),
          useValue: { findOne: jest.fn(), save: jest.fn() },
        },
        {
          provide: getRepositoryToken(TeamEntity),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(MatchEntity),
          useValue: {
            createQueryBuilder: jest.fn(() => ({
              select: jest.fn().mockReturnThis(),
              addSelect: jest.fn().mockReturnThis(),
              getRawOne: jest
                .fn()
                .mockResolvedValue({ maxSeason: 1, maxWeek: 1 }),
            })),
          },
        },
        {
          provide: NotificationService,
          useValue: { create: jest.fn() },
        },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    processor = module.get<StadiumConstructionProcessor>(
      StadiumConstructionProcessor,
    );

    constructionRepo = module.get(
      getRepositoryToken(StadiumConstructionEntity),
    );

    teamRepo = module.get(getRepositoryToken(TeamEntity));
    notificationService = module.get(NotificationService);
  });

  it('returns early summary when no in-flight projects', async () => {
    constructionRepo.find.mockResolvedValueOnce([]);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result = await processor.process({ id: 'job-1' } as any);

    expect(result).toEqual({
      ticked: 0,
      completed: 0,
      durationMs: expect.any(Number),
    });
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('decrements remainingWeeks for projects with >1 week left', async () => {
    const row = mockConstruction({ remainingWeeks: 3 });
    constructionRepo.find.mockResolvedValueOnce([row]);
    constructionRepo.save.mockResolvedValue(row);

    const result = await processor.process({ id: 'job-2' } as any);

    expect(row.remainingWeeks).toBe(2);
    expect(result.ticked).toBe(1);
    expect(result.completed).toBe(0);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('applies capacity change on completion tick', async () => {
    const row = mockConstruction({
      id: 'c1' as any,
      kind: StadiumConstructionKind.EXPAND,
      deltaSeats: 5_000,
      startingCapacity: 10_000,
      endingCapacity: 15_000,
      remainingWeeks: 1,
    });
    constructionRepo.find.mockResolvedValueOnce([row]);

    const stadium = mockStadiumEntity({ capacity: 10_000 });
    const financeRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };
    const txManager = makeTxManager(stadium, financeRepo);
    dataSource.transaction.mockImplementationOnce(async (cb: any) =>
      cb(txManager),
    );

    teamRepo.findOne.mockResolvedValueOnce(
      mockTeam({ userId: 'user-1', isBot: false }),
    );

    const result = await processor.process({ id: 'job-3' } as any);

    expect(result.completed).toBe(1);
    expect(stadium.capacity).toBe(15_000);
    expect(notificationService.create).toHaveBeenCalledWith(
      'user-1',
      'STADIUM_CONSTRUCTION_COMPLETED',
      'notification.stadiumConstructionCompleted',
      expect.objectContaining({ delta: 5_000, newCapacity: 15_000 }),
    );
  });

  it('credits finance refund and records transaction on demolish completion', async () => {
    const row = mockConstruction({
      id: 'c2' as any,
      kind: StadiumConstructionKind.DEMOLISH,
      deltaSeats: 10_000,
      startingCapacity: 25_000,
      endingCapacity: 15_000,
      remainingWeeks: 1,
      cost: 10_000 * STADIUM_COST_PER_SEAT,
    });
    constructionRepo.find.mockResolvedValueOnce([row]);

    const stadium = mockStadiumEntity({ capacity: 25_000 });
    const finance = { balance: 50_000 };
    const financeRepo = {
      findOne: jest.fn().mockResolvedValue(finance),
      save: jest.fn(),
    };
    const transactionSave = jest.fn();
    const txManager = makeTxManager(stadium, financeRepo, {
      save: transactionSave,
      create: jest.fn((x: any) => x),
    });
    dataSource.transaction.mockImplementationOnce(async (cb: any) =>
      cb(txManager),
    );

    teamRepo.findOne.mockResolvedValueOnce(mockTeam({ isBot: true }));

    await processor.process({ id: 'job-4' } as any);

    const expectedRefund = Math.floor(
      10_000 * STADIUM_COST_PER_SEAT * SEAT_DEMOLISH_REFUND_RATE,
    );
    expect(stadium.capacity).toBe(15_000);
    expect(finance.balance).toBe(50_000 + expectedRefund);
    expect(financeRepo.save).toHaveBeenCalled();
    expect(transactionSave).toHaveBeenCalledWith(
      expect.objectContaining({ amount: expectedRefund, type: 'OTHER_INCOME' }),
    );
    expect(notificationService.create).not.toHaveBeenCalled(); // bot team
  });

  // ───── helpers ───────────────────────────────────────────────────────────

  function mockStadiumEntity(overrides: Record<string, unknown> = {}) {
    return {
      id: 'stadium-1',
      teamId: 'team-1',
      capacity: 10_000,
      isBuilt: true,
      name: 'Home Stadium',
      ...overrides,
    } as StadiumEntity;
  }

  function mockTeam(overrides: Record<string, unknown> = {}) {
    return {
      id: 'team-1',
      userId: null,
      isBot: false,
      ...overrides,
    } as TeamEntity;
  }

  function makeTxManager(
    stadium: any,
    financeRepo: any,
    transactionRepoOverride?: any,
  ) {
    const saves: any[] = [];
    const txRepo = transactionRepoOverride ?? {
      save: jest.fn((x: any) => {
        saves.push(x);
        return x;
      }),
      create: jest.fn((x: any) => x),
    };
    const constructionSave = jest.fn();
    return {
      getRepository: (Entity: any) => {
        if (Entity.name === 'StadiumEntity')
          return {
            findOne: jest.fn().mockResolvedValue(stadium),
            save: jest.fn(),
          };
        if (Entity.name === 'FinanceEntity') return financeRepo;
        if (Entity.name === 'TransactionEntity') return txRepo;
        if (Entity.name === 'StadiumConstructionEntity')
          return { save: constructionSave, create: jest.fn((x: any) => x) };
        return { save: jest.fn(), create: jest.fn((x: any) => x) };
      },
    };
  }
});
