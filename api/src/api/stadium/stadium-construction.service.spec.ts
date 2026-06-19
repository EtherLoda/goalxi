import {
  MatchEntity,
  STADIUM_COST_PER_SEAT,
  StadiumConstructionEntity,
  StadiumConstructionKind,
  StadiumConstructionStatus,
  StadiumEntity,
} from '@goalxi/database';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { StadiumConstructionService } from './stadium-construction.service';

describe('StadiumConstructionService', () => {
  let service: StadiumConstructionService;
  let constructionRepo: jest.Mocked<Repository<StadiumConstructionEntity>>;
  let stadiumRepo: jest.Mocked<Repository<StadiumEntity>>;
  let dataSource: { transaction: jest.Mock };

  const mockStadium = (overrides: Record<string, unknown> = {}) =>
    ({
      id: 'stadium-1',
      teamId: 'team-1',
      capacity: 10_000,
      isBuilt: true,
      name: 'Home Stadium',
      ...overrides,
    }) as StadiumEntity;

  const mockConstruction = (
    overrides: Partial<StadiumConstructionEntity> = {},
  ): StadiumConstructionEntity =>
    ({
      id: 'construction-1',
      teamId: 'team-1' as any,
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
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as StadiumConstructionEntity;

  beforeEach(async () => {
    dataSource = {
      transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StadiumConstructionService,
        {
          provide: getRepositoryToken(StadiumConstructionEntity),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn((x) => x),
          },
        },
        {
          provide: getRepositoryToken(StadiumEntity),
          useValue: { findOne: jest.fn(), save: jest.fn() },
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
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<StadiumConstructionService>(
      StadiumConstructionService,
    );
    constructionRepo = module.get(
      getRepositoryToken(StadiumConstructionEntity),
    );
    stadiumRepo = module.get(getRepositoryToken(StadiumEntity));
  });

  describe('start — validation', () => {
    it.each([0, -1, 499, 100_001, 1.5])(
      'rejects delta %s with BadRequestException',
      async (delta) => {
        await expect(
          service.start(
            'team-1',
            StadiumConstructionKind.EXPAND,
            delta as number,
          ),
        ).rejects.toThrow(/must be/);
      },
    );

    it('rejects when stadium missing', async () => {
      stadiumRepo.findOne.mockResolvedValue(null);
      await expect(
        service.start('team-missing', StadiumConstructionKind.EXPAND, 5_000),
      ).rejects.toThrow(/Stadium not found/);
    });

    it('rejects expand that pushes capacity past the 200k ceiling', async () => {
      stadiumRepo.findOne.mockResolvedValue(mockStadium({ capacity: 195_000 }));
      await expect(
        service.start('team-1', StadiumConstructionKind.EXPAND, 10_000),
      ).rejects.toThrow(/Cannot expand past/);
    });

    it('rejects demolish that drops capacity below 1 000', async () => {
      stadiumRepo.findOne.mockResolvedValue(mockStadium({ capacity: 1_500 }));
      await expect(
        service.start('team-1', StadiumConstructionKind.DEMOLISH, 1_000),
      ).rejects.toThrow(/at least 1,000/);
    });

    it('rejects a second concurrent construction with 409', async () => {
      stadiumRepo.findOne.mockResolvedValue(mockStadium());
      constructionRepo.findOne.mockResolvedValue(mockConstruction());
      await expect(
        service.start('team-1', StadiumConstructionKind.EXPAND, 5_000),
      ).rejects.toThrow(/already has a construction/);
    });
  });

  describe('start — happy path', () => {
    it('queues an EXPAND, computes weeks, deducts finance, persists row', async () => {
      stadiumRepo.findOne.mockResolvedValue(mockStadium({ capacity: 10_000 }));
      constructionRepo.findOne.mockResolvedValueOnce(null); // no existing
      constructionRepo.save.mockResolvedValue(mockConstruction());

      const financeRepo = {
        findOne: jest.fn().mockResolvedValue({ balance: 100_000 }),
        save: jest.fn(),
      };
      const transactionRepo = {
        save: jest.fn(),
        create: jest.fn((x: any) => x),
      };
      const constructionTxRepo = {
        create: jest.fn((x) => x),
        save: jest.fn((x) => x),
      };
      dataSource.transaction.mockImplementationOnce(async (cb: any) =>
        cb({
          getRepository: (Entity: any) => {
            if (Entity.name === 'StadiumConstructionEntity')
              return constructionTxRepo;
            if (Entity.name === 'FinanceEntity') return financeRepo;
            if (Entity.name === 'TransactionEntity') return transactionRepo;
            return { save: jest.fn(), create: jest.fn((x) => x) };
          },
        }),
      );

      const result = await service.start(
        'team-1',
        StadiumConstructionKind.EXPAND,
        5_000,
      );

      expect(result.weeks).toBe(1); // 5000 seats / 5000 per week = 1
      expect(result.cost).toBe(5_000 * STADIUM_COST_PER_SEAT);
      expect(financeRepo.findOne).toHaveBeenCalled();
      expect(financeRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          balance: 100_000 - 5_000 * STADIUM_COST_PER_SEAT,
        }),
      );
      expect(transactionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: -(5_000 * STADIUM_COST_PER_SEAT),
          type: 'OTHER_EXPENSE',
        }),
      );
    });

    it('queues a DEMOLISH without deducting funds (refund fires on completion)', async () => {
      stadiumRepo.findOne.mockResolvedValue(mockStadium({ capacity: 25_000 }));
      constructionRepo.findOne.mockResolvedValueOnce(null);
      constructionRepo.save.mockResolvedValue(
        mockConstruction({
          kind: StadiumConstructionKind.DEMOLISH,
          deltaSeats: 10_000,
          startingCapacity: 25_000,
          endingCapacity: 15_000,
          totalWeeks: 1,
        }),
      );

      const result = await service.start(
        'team-1',
        StadiumConstructionKind.DEMOLISH,
        10_000,
      );

      expect(result.weeks).toBe(1); // 10000 / 10000 per week
      expect(result.cost).toBe(10_000 * STADIUM_COST_PER_SEAT);
    });
  });

  describe('listForTeam', () => {
    it('returns active first, then completed (capped at 10)', async () => {
      const active = [mockConstruction({ id: 'a' as any })];
      const completed = Array.from({ length: 12 }, (_, i) =>
        mockConstruction({
          id: `c${i}` as any,
          status: StadiumConstructionStatus.COMPLETED,
        }),
      );
      constructionRepo.find
        .mockResolvedValueOnce(active)
        .mockResolvedValueOnce(completed.slice(0, 10));

      const result = await service.listForTeam('team-1');

      expect(result).toHaveLength(11);
      expect(result[0].id).toBe('a');
      expect(result[1].id).toBe('c0');
    });
  });
});
