import {
  FINANCE_CONSTANTS,
  MatchEntity,
  SEAT_DEMOLISH_REFUND_RATE,
  STADIUM_COST_PER_SEAT,
  StadiumEntity,
  TeamEntity,
  getTicketMultiplier,
} from '@goalxi/database';
import { LOGGER_SERVICE } from '@goalxi/logger';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FinanceService } from '../finance/finance.service';
import { StadiumService } from './stadium.service';

describe('StadiumService — §5.3 summary & rename', () => {
  let service: StadiumService;
  let stadiumRepository: jest.Mocked<Repository<StadiumEntity>>;
  let matchRepository: jest.Mocked<Repository<MatchEntity>>;
  let teamRepository: jest.Mocked<Repository<TeamEntity>>;

  const OWNER = 'user-owner';

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

  const completedMatch = (attendance: number | null) =>
    ({
      id: `match-${attendance}`,
      scheduledAt: new Date('2026-10-01T12:00:00Z'),
      completedAt: new Date('2026-10-01T14:00:00Z'),
      homeScore: 2,
      awayScore: 1,
      attendance,
      awayTeam: { name: 'Away FC' },
    }) as unknown as MatchEntity;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StadiumService,
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
            find: jest.fn().mockResolvedValue([]),
            createQueryBuilder: jest.fn(() => ({
              select: jest.fn().mockReturnThis(),
              addSelect: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              getRawOne: jest
                .fn()
                .mockResolvedValue({ maxSeason: 3, maxWeek: 4 }),
              getRawMany: jest.fn().mockResolvedValue([]),
            })),
          },
        },
        {
          provide: getRepositoryToken(TeamEntity),
          useValue: {
            findOne: jest.fn().mockResolvedValue({
              id: 'team-1',
              userId: OWNER,
              league: { tier: 2 },
            }),
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
    teamRepository = module.get(getRepositoryToken(TeamEntity));
  });

  describe('getSummary', () => {
    it('prices the sell-out ceiling with the league-tier multiplier', async () => {
      stadiumRepository.findOne.mockResolvedValue(
        mockStadium({ capacity: 10000 }),
      );

      const summary = await service.getSummary('team-1');

      // Tier 2 → ×1.6 on the base price, the same multiplier
      // `match-completion.service` uses when it settles TICKET_INCOME.
      const price = Math.round(
        FINANCE_CONSTANTS.TICKET_PRICE * getTicketMultiplier(2),
      );
      expect(price).toBe(32);
      expect(summary).toMatchObject({
        teamId: 'team-1',
        name: 'Home Stadium',
        capacity: 10000,
        isBuilt: true,
        tier: 2,
        ticketPrice: price,
        maxMatchdayRevenue: 10000 * price,
        seatAdjustCost: STADIUM_COST_PER_SEAT,
        seatDemolishRefund: Math.floor(
          STADIUM_COST_PER_SEAT * SEAT_DEMOLISH_REFUND_RATE,
        ),
      });
    });

    it('reports 0 estimated revenue and no fill rate before any match is played', async () => {
      stadiumRepository.findOne.mockResolvedValue(mockStadium());

      const summary = await service.getSummary('team-1');

      expect(summary?.currentSeasonAvgAttendance).toBeNull();
      expect(summary?.lastHomeFillRate).toBeNull();
      expect(summary?.estMatchdayRevenue).toBe(0);
    });

    it('averages only matches that actually recorded an attendance', async () => {
      stadiumRepository.findOne.mockResolvedValue(
        mockStadium({ capacity: 10000 }),
      );
      matchRepository.find.mockResolvedValue([
        completedMatch(8000),
        completedMatch(null), // pre-migration row: unknown, must not be invented
        completedMatch(9000),
      ]);

      const summary = await service.getSummary('team-1');

      expect(summary?.currentSeasonAvgAttendance).toBe(8500);
      expect(summary?.estMatchdayRevenue).toBe(8500 * 32);
      // Fill rate comes from the most recent match, which DID record one.
      expect(summary?.lastHomeFillRate).toBeCloseTo(0.8, 5);
    });

    it('falls back to the base price when the team has no league', async () => {
      stadiumRepository.findOne.mockResolvedValue(mockStadium());
      teamRepository.findOne.mockResolvedValue({
        id: 'team-1',
        userId: null,
        league: null,
      } as unknown as TeamEntity);

      const summary = await service.getSummary('team-1');

      expect(summary?.tier).toBeNull();
      expect(summary?.ticketPrice).toBe(FINANCE_CONSTANTS.TICKET_PRICE);
    });

    it('should return null for non-existent stadium', async () => {
      stadiumRepository.findOne.mockResolvedValue(null);
      const summary = await service.getSummary('team-missing');
      expect(summary).toBeNull();
    });
  });

  describe('getRecentHomeMatches', () => {
    it('leaves attendance null instead of fabricating capacity × 0.7', async () => {
      stadiumRepository.findOne.mockResolvedValue(
        mockStadium({ capacity: 10000 }),
      );
      matchRepository.find.mockResolvedValue([completedMatch(null)]);

      const [row] = await service.getRecentHomeMatches('team-1');

      expect(row.attendance).toBeNull();
      expect(row.fillRate).toBeNull();
      expect(row.opponentName).toBe('Away FC');
      expect(row.result).toBe('W');
    });
  });

  describe('rename', () => {
    it('should update the name field', async () => {
      const stadium = mockStadium();
      stadiumRepository.findOne.mockResolvedValue(stadium);
      stadiumRepository.save.mockResolvedValue(stadium);

      const result = await service.rename('team-1', 'Old Trafford', OWNER);

      expect(stadium.name).toBe('Old Trafford');
      expect(stadiumRepository.save).toHaveBeenCalledWith(stadium);
      expect(result.name).toBe('Old Trafford');
    });

    it('should throw BadRequestException if stadium not found', async () => {
      stadiumRepository.findOne.mockResolvedValue(null);
      await expect(service.rename('team-1', 'Foo', OWNER)).rejects.toThrow();
    });

    it('rejects a caller who does not own the club', async () => {
      teamRepository.findOne.mockResolvedValue({
        id: 'team-1',
        userId: 'someone-else',
      } as TeamEntity);

      await expect(
        service.rename('team-1', 'Hijacked Arena', OWNER),
      ).rejects.toThrow(/only manage your own club/);
      expect(stadiumRepository.save).not.toHaveBeenCalled();
    });

    it('should write a 0-amount audit transaction so the timeline picks it up', async () => {
      const stadium = mockStadium({ name: 'Old Name' });
      stadiumRepository.findOne.mockResolvedValue(stadium);
      stadiumRepository.save.mockResolvedValue(stadium);

      await service.rename('team-1', 'New Name', OWNER);

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
