import { Uuid } from '@/common/types/common.type';
import {
  InjuryEntity,
  MatchEntity,
  PlayerEntity,
  StaffEntity,
  StaffRole,
} from '@goalxi/database';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjuryService } from './injury.service';

describe('InjuryService', () => {
  let service: InjuryService;
  let playerRepo: jest.Mocked<Repository<PlayerEntity>>;
  let injuryRepo: jest.Mocked<Repository<InjuryEntity>>;
  let staffRepo: jest.Mocked<Repository<StaffEntity>>;
  let matchRepo: jest.Mocked<Repository<MatchEntity>>;

  // PlayerEntity.getExactAge() is consumed by getTeamInjuredPlayers — stub it.
  const makePlayer = (overrides: Partial<PlayerEntity> = {}): PlayerEntity => {
    const player = {
      id: 'player-uuid-1' as Uuid,
      name: 'Test Player',
      teamId: 'team-uuid-1' as Uuid,
      currentInjuryValue: 50,
      injuryType: 'muscle' as const,
      injuryState: null,
      injuredAt: new Date('2024-01-15'),
      getExactAge: () => [25, 0] as [number, number],
      ...overrides,
    } as unknown as PlayerEntity;
    return player;
  };

  const mockInjury: Partial<InjuryEntity> = {
    id: 'injury-uuid-1' as Uuid,
    playerId: 'player-uuid-1' as Uuid,
    injuryType: 'muscle',
    severity: 2,
    injuryValue: 50,
    estimatedMinDays: 7,
    estimatedMaxDays: 7,
    occurredAt: new Date('2024-01-15'),
    isRecovered: false,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InjuryService,
        {
          provide: getRepositoryToken(PlayerEntity),
          useValue: {
            find: jest.fn(),
            findOneBy: jest.fn(),
            findOne: jest.fn(),
            count: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(InjuryEntity),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(StaffEntity),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(MatchEntity),
          useValue: {
            find: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<InjuryService>(InjuryService);
    playerRepo = module.get(getRepositoryToken(PlayerEntity));
    injuryRepo = module.get(getRepositoryToken(InjuryEntity));
    staffRepo = module.get(getRepositoryToken(StaffEntity));
    matchRepo = module.get(getRepositoryToken(MatchEntity));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPlayerInjuryHistory', () => {
    it('should return injury history for a player', async () => {
      injuryRepo.find.mockResolvedValue([mockInjury] as InjuryEntity[]);

      const result = await service.getPlayerInjuryHistory('player-uuid-1');

      expect(injuryRepo.find).toHaveBeenCalledWith({
        where: { playerId: 'player-uuid-1' },
        order: { occurredAt: 'DESC' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('injury-uuid-1');
      expect(result[0].injuryType).toBe('muscle');
      expect(result[0].severity).toBe(2);
    });

    it('should return empty array when player has no injury history', async () => {
      injuryRepo.find.mockResolvedValue([]);

      const result = await service.getPlayerInjuryHistory('player-uuid-1');

      expect(result).toEqual([]);
    });

    it('should expose estimatedDays (collapsed from min/max columns)', async () => {
      injuryRepo.find.mockResolvedValue([mockInjury] as InjuryEntity[]);

      const result = await service.getPlayerInjuryHistory('player-uuid-1');

      expect(result[0].estimatedDays).toBe(7);
      expect(result[0].isRecovered).toBe(false);
    });
  });

  describe('getTeamInjuredPlayers', () => {
    it('should return injured players for a team', async () => {
      playerRepo.find.mockResolvedValue([makePlayer()]);
      staffRepo.findOne.mockResolvedValue(null);

      const result = await service.getTeamInjuredPlayers('team-uuid-1');

      expect(playerRepo.find).toHaveBeenCalledWith({
        where: {
          teamId: 'team-uuid-1',
          currentInjuryValue: expect.any(Object),
        },
      });
      expect(result).toHaveLength(1);
      expect(result[0].playerId).toBe('player-uuid-1');
      expect(result[0].isInjured).toBe(true);
      expect(result[0].currentInjuryValue).toBe(50);
    });

    it('should compute deterministic estimatedRecoveryDays as a single value', async () => {
      playerRepo.find.mockResolvedValue([makePlayer()]);
      staffRepo.findOne.mockResolvedValue(null);

      const result = await service.getTeamInjuredPlayers('team-uuid-1');

      expect(typeof result[0].estimatedRecoveryDays).toBe('number');
      expect(result[0].estimatedRecoveryDays).toBeGreaterThan(0);
    });

    it('should recover faster when a team doctor is present', async () => {
      playerRepo.find.mockResolvedValue([makePlayer()]);

      staffRepo.findOne.mockResolvedValueOnce(null);
      const withoutDoctor = await service.getTeamInjuredPlayers('team-uuid-1');

      staffRepo.findOne.mockResolvedValueOnce({
        level: 5,
        role: StaffRole.TEAM_DOCTOR,
        isActive: true,
      } as StaffEntity);
      const withDoctor = await service.getTeamInjuredPlayers('team-uuid-1');

      expect(withDoctor[0].estimatedRecoveryDays!).toBeLessThan(
        withoutDoctor[0].estimatedRecoveryDays!,
      );
    });

    it('should return empty array when no players are injured', async () => {
      playerRepo.find.mockResolvedValue([]);

      const result = await service.getTeamInjuredPlayers('team-uuid-1');

      expect(result).toEqual([]);
      // No need to look up the doctor if the team has no injured players.
      expect(staffRepo.findOne).not.toHaveBeenCalled();
    });

    it('should propagate injuryState (minor/severe)', async () => {
      playerRepo.find.mockResolvedValue([makePlayer({ injuryState: 'minor' })]);
      staffRepo.findOne.mockResolvedValue(null);

      const result = await service.getTeamInjuredPlayers('team-uuid-1');

      expect(result[0].injuryState).toBe('minor');
    });
  });

  describe('getTeamInjuryHistory', () => {
    /**
     * Build a chainable queryBuilder mock that returns the given injuries.
     * Mirrors TypeORM's QB API so the service can compose freely.
     */
    const mockQueryBuilderReturning = (rows: InjuryEntity[]) => {
      const qb: any = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(rows),
      };
      injuryRepo.createQueryBuilder.mockReturnValue(qb);
      return qb;
    };

    it('returns empty when query yields no rows', async () => {
      mockQueryBuilderReturning([]);

      const result = await service.getTeamInjuryHistory('team-uuid-1');

      expect(result).toEqual([]);
      expect(playerRepo.find).not.toHaveBeenCalled(); // regression: no 2-step lookup
      expect(injuryRepo.createQueryBuilder).toHaveBeenCalledWith('injury');
    });

    it('applies the default limit (20) and DESC ordering on occurredAt', async () => {
      const qb = mockQueryBuilderReturning([mockInjury as InjuryEntity]);

      await service.getTeamInjuryHistory('team-uuid-1');

      expect(qb.innerJoin).toHaveBeenCalledWith('injury.player', 'player');
      expect(qb.where).toHaveBeenCalledWith(
        'player.teamId = :teamId',
        expect.objectContaining({ teamId: 'team-uuid-1' }),
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        'injury.occurredAt >= :cutoff',
        expect.objectContaining({ cutoff: expect.any(Date) }),
      );
      expect(qb.orderBy).toHaveBeenCalledWith('injury.occurredAt', 'DESC');
      expect(qb.limit).toHaveBeenCalledWith(20);
    });

    it('honours custom limit (clamped to 100)', async () => {
      const qb = mockQueryBuilderReturning([]);

      await service.getTeamInjuryHistory('team-uuid-1', { limit: 250 });

      expect(qb.limit).toHaveBeenCalledWith(100);
    });

    it('resolves opponent name from match join', async () => {
      mockQueryBuilderReturning([
        { ...mockInjury, matchId: 'match-1' } as InjuryEntity,
      ]);
      matchRepo.find.mockResolvedValue([
        {
          id: 'match-1',
          homeTeamId: 'team-uuid-1',
          awayTeam: { name: 'Rivals FC' },
        } as unknown as MatchEntity,
      ]);

      const result = await service.getTeamInjuryHistory('team-uuid-1');

      expect(result[0].opponentName).toBe('Rivals FC');
    });
  });

  describe('getPlayersPendingRecovery', () => {
    it('should return all players with active injuries', async () => {
      playerRepo.find.mockResolvedValue([makePlayer()]);

      const result = await service.getPlayersPendingRecovery();

      expect(playerRepo.find).toHaveBeenCalledWith({
        where: { currentInjuryValue: expect.any(Object) },
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('updatePlayerInjury', () => {
    it('should reduce injury value by recovery amount', async () => {
      playerRepo.findOneBy.mockResolvedValue(
        makePlayer({ currentInjuryValue: 50 }),
      );
      playerRepo.save.mockImplementation(async (p) => p as PlayerEntity);
      injuryRepo.findOne.mockResolvedValue(mockInjury as InjuryEntity);
      injuryRepo.save.mockImplementation(async (i) => i as InjuryEntity);

      const result = await service.updatePlayerInjury('player-uuid-1', 10);

      expect(result).toBeDefined();
      expect(result!.currentInjuryValue).toBe(40);
    });

    it('should return null if player not found', async () => {
      playerRepo.findOneBy.mockResolvedValue(null);

      const result = await service.updatePlayerInjury('unknown-player', 10);

      expect(result).toBeNull();
    });

    it('should return null if player has no injury', async () => {
      playerRepo.findOneBy.mockResolvedValue(
        makePlayer({ currentInjuryValue: 0 }),
      );

      const result = await service.updatePlayerInjury('player-uuid-1', 10);

      expect(result).toBeNull();
    });

    it('should clear injury fields when fully recovered', async () => {
      playerRepo.findOneBy.mockResolvedValue(
        makePlayer({ currentInjuryValue: 5 }),
      );
      playerRepo.save.mockImplementation(async (p) => p as PlayerEntity);
      injuryRepo.findOne.mockResolvedValue(mockInjury as InjuryEntity);
      injuryRepo.save.mockImplementation(
        async (i) =>
          ({
            ...i,
            isRecovered: true,
            recoveredAt: new Date(),
          }) as InjuryEntity,
      );

      const result = await service.updatePlayerInjury('player-uuid-1', 10);

      expect(result!.currentInjuryValue).toBe(0);
      expect(result!.injuryType).toBeNull();
      expect(result!.injuredAt).toBeNull();
    });
  });

  describe('applyInjury', () => {
    it('should create injury record with single estimatedDays and update player', async () => {
      playerRepo.update.mockResolvedValue({ affected: 1 } as any);
      injuryRepo.create.mockImplementation((data) => data as InjuryEntity);
      injuryRepo.save.mockImplementation(async (i) => i as InjuryEntity);

      const result = await service.applyInjury(
        'player-uuid-1',
        'muscle',
        2,
        50,
        7,
        'match-uuid-1',
      );

      expect(playerRepo.update).toHaveBeenCalledWith(
        'player-uuid-1',
        expect.objectContaining({
          currentInjuryValue: 50,
          injuryType: 'muscle',
        }),
      );
      // legacy min/max columns both receive the single deterministic estimate
      expect(result.estimatedMinDays).toBe(7);
      expect(result.estimatedMaxDays).toBe(7);
      expect(result.matchId).toBe('match-uuid-1');
    });
  });

  describe('getInjuredCountByTeamIds', () => {
    it('should return injury count for each team', async () => {
      playerRepo.count.mockResolvedValue(3);

      const result = await service.getInjuredCountByTeamIds([
        'team-1',
        'team-2',
      ]);

      expect(result['team-1']).toBe(3);
      expect(result['team-2']).toBe(3);
    });

    it('should handle empty team list', async () => {
      const result = await service.getInjuredCountByTeamIds([]);
      expect(result).toEqual({});
    });

    it('should return 0 for teams with no injuries', async () => {
      playerRepo.count.mockResolvedValue(0);

      const result = await service.getInjuredCountByTeamIds(['team-1']);

      expect(result['team-1']).toBe(0);
    });
  });
});
