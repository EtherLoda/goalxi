import {
  MatchEntity,
  STADIUM_COST_PER_SEAT,
  STADIUM_DEMOLISH_REFUND_RATE,
  StadiumEntity,
} from '@goalxi/database';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FinanceService } from '../finance/finance.service';
import { StadiumService } from './stadium.service';

describe('StadiumService — §5.3 summary & rename', () => {
  let service: StadiumService;
  let stadiumRepository: jest.Mocked<Repository<StadiumEntity>>;
  let matchRepository: jest.Mocked<Repository<MatchEntity>>;

  const mockStadium = (overrides: Partial<StadiumEntity> = {}): StadiumEntity =>
    ({
      id: 'stadium-1',
      teamId: 'team-1',
      capacity: 10000,
      isBuilt: true,
      name: 'Home Stadium',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as StadiumEntity;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StadiumService,
        {
          provide: getRepositoryToken(StadiumEntity),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(MatchEntity),
          useValue: {
            createQueryBuilder: jest.fn(() => ({
              select: jest.fn().mockReturnThis(),
              addSelect: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              getRawOne: jest.fn().mockResolvedValue({ avgAttendance: 8000 }),
              getRawMany: jest.fn().mockResolvedValue([]),
            })),
          },
        },
        {
          provide: FinanceService,
          useValue: { processTransaction: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<StadiumService>(StadiumService);
    stadiumRepository = module.get(getRepositoryToken(StadiumEntity));
    matchRepository = module.get(getRepositoryToken(MatchEntity));
  });

  describe('getSummary', () => {
    it('should return summary with cost and refund', async () => {
      stadiumRepository.findOne.mockResolvedValue(
        mockStadium({ capacity: 10000 }),
      );

      const summary = await service.getSummary('team-1');

      expect(summary).toMatchObject({
        teamId: 'team-1',
        name: 'Home Stadium',
        capacity: 10000,
        isBuilt: true,
        buildCost: 10000 * STADIUM_COST_PER_SEAT,
        demolishRefund: Math.floor(
          10000 * STADIUM_COST_PER_SEAT * STADIUM_DEMOLISH_REFUND_RATE,
        ),
        // Theoretical max per-matchday revenue at 100% fill.
        estMatchdayRevenue: 10000 * 20,
      });
    });

    it('should return null for non-existent stadium', async () => {
      stadiumRepository.findOne.mockResolvedValue(null);
      const summary = await service.getSummary('team-missing');
      expect(summary).toBeNull();
    });
  });

  describe('rename', () => {
    it('should update the name field', async () => {
      const stadium = mockStadium();
      stadiumRepository.findOne.mockResolvedValue(stadium);
      stadiumRepository.save.mockResolvedValue(stadium);

      const result = await service.rename('team-1', 'Old Trafford');

      expect(stadium.name).toBe('Old Trafford');
      expect(stadiumRepository.save).toHaveBeenCalledWith(stadium);
      expect(result.name).toBe('Old Trafford');
    });

    it('should throw BadRequestException if stadium not found', async () => {
      stadiumRepository.findOne.mockResolvedValue(null);
      await expect(service.rename('team-x', 'Foo')).rejects.toThrow();
    });

    it('should write a 0-amount audit transaction so the timeline picks it up', async () => {
      const stadium = mockStadium({ name: 'Old Name' });
      stadiumRepository.findOne.mockResolvedValue(stadium);
      stadiumRepository.save.mockResolvedValue(stadium);

      await service.rename('team-1', 'New Name');

      const financeService = (
        service as unknown as {
          financeService: { processTransaction: jest.Mock };
        }
      ).financeService;
      expect(financeService.processTransaction).toHaveBeenCalledWith(
        'team-1',
        0,
        expect.anything(), // TransactionType
        expect.any(Number),
        expect.any(Number),
        'Stadium rename: Old Name → New Name',
      );
    });
  });
});
