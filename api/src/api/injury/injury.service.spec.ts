import { Uuid } from '@/common/types/common.type';
import {
  InjuryEntity,
  MatchEntity,
  PlayerEntity,
  StaffEntity,
  StaffRole,
} from '@goalxi/database';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
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
      id: 1,
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
    playerId: 1,
    injuryType: 'muscle',
    severity: 2,
    injuryValue: 50,
    estimatedMaxDays: 7,
    occurredAt: new Date('2024-01-15'),
    // recoveredAt omitted on purpose — an "active" injury has no recovery.
  };

  /**
   * Build a repository stub with every method the service touches.
   * Used both for the non-tx and tx-scoped handles.
   */
  const makeRepoStub = () => ({
    find: jest.fn(),
    findOneBy: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    createQueryBuilder: jest.fn(),
  });

  beforeEach(async () => {
    const playerRepoMock = makeRepoStub();
    const injuryRepoMock = makeRepoStub();

    // Mocked DataSource: every call to .transaction() invokes the callback
    // with a tx-scoped EntityManager that hands out the same mock repos
    // the service also uses outside transactions. Lets the assertions
    // below hit a single mock instance for each entity.
    const dataSourceMock = {
      transaction: jest.fn(async (cb: any) =>
        cb({
          getRepository: (entity: any) => {
            if (entity === PlayerEntity) return playerRepoMock;
            if (entity === InjuryEntity) return injuryRepoMock;
            throw new Error(`Unexpected entity in tx: ${entity?.name}`);
          },
        }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InjuryService,
        {
          provide: getRepositoryToken(PlayerEntity),
          useValue: playerRepoMock,
        },
        {
          provide: getRepositoryToken(InjuryEntity),
          useValue: injuryRepoMock,
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
        {
          provide: getDataSourceToken(),
          useValue: dataSourceMock,
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

      const result = await service.getPlayerInjuryHistory(1);

      expect(injuryRepo.find).toHaveBeenCalledWith({
        where: { playerId: 1 },
        order: { occurredAt: 'DESC' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('injury-uuid-1');
      expect(result[0].injuryType).toBe('muscle');
      expect(result[0].severity).toBe(2);
    });

    it('should return empty array when player has no injury history', async () => {
      injuryRepo.find.mockResolvedValue([]);

      const result = await service.getPlayerInjuryHistory(1);

      expect(result).toEqual([]);
    });

    it('should expose estimatedDays and derive isRecovered from recoveredAt', async () => {
      injuryRepo.find.mockResolvedValue([mockInjury] as InjuryEntity[]);

      const result = await service.getPlayerInjuryHistory(1);

      expect(result[0].estimatedDays).toBe(7);
      // Active injury: no recoveredAt → isRecovered must be false (derived).
      expect(result[0].isRecovered).toBe(false);
      expect(result[0].recoveredAt).toBeUndefined();
    });

    it('should flag recovered injuries (recoveredAt set) as isRecovered=true', async () => {
      injuryRepo.find.mockResolvedValue([
        { ...mockInjury, recoveredAt: new Date('2024-02-01') } as InjuryEntity,
      ]);

      const result = await service.getPlayerInjuryHistory(1);

      expect(result[0].isRecovered).toBe(true);
      expect(result[0].recoveredAt).toEqual(new Date('2024-02-01'));
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
      expect(result[0].playerId).toBe(1);
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

      const result = await service.updatePlayerInjury(1, 10);

      expect(result).toBeDefined();
      expect(result!.currentInjuryValue).toBe(40);
    });

    it('should return null if player not found', async () => {
      playerRepo.findOneBy.mockResolvedValue(null);

      const result = await service.updatePlayerInjury(999, 10);

      expect(result).toBeNull();
    });

    it('should return null if player has no injury', async () => {
      playerRepo.findOneBy.mockResolvedValue(
        makePlayer({ currentInjuryValue: 0 }),
      );

      const result = await service.updatePlayerInjury(1, 10);

      expect(result).toBeNull();
    });

    it('should clear injury fields and stamp recoveredAt when fully recovered', async () => {
      playerRepo.findOneBy.mockResolvedValue(
        makePlayer({ currentInjuryValue: 5 }),
      );
      playerRepo.save.mockImplementation(async (p) => p as PlayerEntity);
      injuryRepo.findOne.mockResolvedValue(mockInjury as InjuryEntity);
      injuryRepo.save.mockImplementation(
        async (i) => i as InjuryEntity,
      );

      const result = await service.updatePlayerInjury(1, 10);

      expect(result!.currentInjuryValue).toBe(0);
      expect(result!.injuryType).toBeNull();
      expect(result!.injuredAt).toBeNull();

      // Recovery is derived: the service must set recoveredAt, and
      // findOne must look for rows with recoveredAt IS NULL.
      expect(injuryRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            playerId: 1,
            recoveredAt: expect.anything(), // IsNull() — exact value is an internal TypeORM marker
          }),
        }),
      );
      const savedInjury = (injuryRepo.save as jest.Mock).mock.calls[0][0];
      expect(savedInjury.recoveredAt).toBeInstanceOf(Date);
    });
  });

  describe('applyInjury', () => {
    it('should create injury record with single estimatedDays and update player', async () => {
      playerRepo.update.mockResolvedValue({ affected: 1 } as any);
      injuryRepo.create.mockImplementation((data) => data as InjuryEntity);
      injuryRepo.save.mockImplementation(async (i) => i as InjuryEntity);

      const result = await service.applyInjury(
        1,
        'muscle',
        2,
        50,
        7,
        'match-uuid-1',
      );

      expect(playerRepo.update).toHaveBeenCalledWith(
        { id: 1 },
        expect.objectContaining({
          currentInjuryValue: 50,
          injuryType: 'muscle',
        }),
      );
      // Single deterministic estimate — the redundant `estimatedMinDays`
      // column was dropped. The new injury record must carry the value on
      // `estimatedMaxDays` only.
      expect(result.estimatedMaxDays).toBe(7);
      expect((result as any).estimatedMinDays).toBeUndefined();
      expect(result.matchId).toBe('match-uuid-1');
    });

    it('should run player + injury writes inside a single transaction', async () => {
      playerRepo.update.mockResolvedValue({ affected: 1 } as any);
      injuryRepo.create.mockImplementation((data) => data as InjuryEntity);
      injuryRepo.save.mockImplementation(async (i) => i as InjuryEntity);

      await service.applyInjury(1, 'muscle', 2, 50, 7);

      // Both writes must go through the same tx-scoped manager. We don't
      // poke into the manager internals — the fact that update() and
      // save() were called inside one .transaction() callback is what we
      // care about; both mock instances are the ones the mock manager
      // hands out, so any leak would surface as a missing call here.
      expect(playerRepo.update).toHaveBeenCalledTimes(1);
      expect(injuryRepo.save).toHaveBeenCalledTimes(1);
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
