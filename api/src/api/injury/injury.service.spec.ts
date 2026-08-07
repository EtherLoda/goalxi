import { Uuid } from '@/common/types/common.type';
import {
  InjuryEntity,
  MatchEntity,
  PlayerEntity,
  StaffEntity,
  StaffRole,
  TeamEntity,
} from '@goalxi/database';
import { ForbiddenException } from '@nestjs/common';
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
  let teamRepo: jest.Mocked<Repository<TeamEntity>>;

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

  beforeEach(async () => {
    const playerRepoMock = {
      find: jest.fn(),
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<PlayerEntity>>;
    const injuryRepoMock = {
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
    } as unknown as jest.Mocked<Repository<InjuryEntity>>;
    const staffRepoMock = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<StaffEntity>>;
    const matchRepoMock = {
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<MatchEntity>>;
    const teamRepoMock = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<TeamEntity>>;

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
          useValue: staffRepoMock,
        },
        {
          provide: getRepositoryToken(MatchEntity),
          useValue: matchRepoMock,
        },
        {
          provide: getRepositoryToken(TeamEntity),
          useValue: teamRepoMock,
        },
      ],
    }).compile();

    service = module.get<InjuryService>(InjuryService);
    playerRepo = module.get(getRepositoryToken(PlayerEntity));
    injuryRepo = module.get(getRepositoryToken(InjuryEntity));
    staffRepo = module.get(getRepositoryToken(StaffEntity));
    matchRepo = module.get(getRepositoryToken(MatchEntity));
    teamRepo = module.get(getRepositoryToken(TeamEntity));
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

  describe('assertUserOwnsTeam (P1-#4)', () => {
    it('passes when the user owns the team', async () => {
      teamRepo.findOne.mockResolvedValue({ id: 'team-uuid-1' } as TeamEntity);

      await expect(
        service.assertUserOwnsTeam('user-1' as Uuid, 'team-uuid-1' as Uuid),
      ).resolves.toBeUndefined();

      expect(teamRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'team-uuid-1',
            userId: 'user-1',
          }),
        }),
      );
    });

    it('throws ForbiddenException when the team does not exist for the user', async () => {
      teamRepo.findOne.mockResolvedValue(null);

      await expect(
        service.assertUserOwnsTeam('user-1' as Uuid, 'team-uuid-1' as Uuid),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('assertUserOwnsPlayer (P1-#4)', () => {
    it('passes when the player is on a team owned by the user', async () => {
      playerRepo.findOne.mockResolvedValue({
        id: 1,
        teamId: 'team-uuid-1',
      } as PlayerEntity);
      teamRepo.findOne.mockResolvedValue({ id: 'team-uuid-1' } as TeamEntity);

      await expect(
        service.assertUserOwnsPlayer('user-1' as Uuid, 1),
      ).resolves.toBeUndefined();

      expect(playerRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1 } }),
      );
      expect(teamRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'team-uuid-1',
            userId: 'user-1',
          }),
        }),
      );
    });

    it('throws ForbiddenException when the player is not found', async () => {
      playerRepo.findOne.mockResolvedValue(null);

      await expect(
        service.assertUserOwnsPlayer('user-1' as Uuid, 1),
      ).rejects.toThrow(ForbiddenException);
      // Don't even hit the team lookup — saves a query on the
      // rejection path.
      expect(teamRepo.findOne).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the player is a free agent', async () => {
      playerRepo.findOne.mockResolvedValue({
        id: 1,
        teamId: null,
      } as unknown as PlayerEntity);

      await expect(
        service.assertUserOwnsPlayer('user-1' as Uuid, 1),
      ).rejects.toThrow(ForbiddenException);
      expect(teamRepo.findOne).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the user does not own the player\u0027s team', async () => {
      playerRepo.findOne.mockResolvedValue({
        id: 1,
        teamId: 'team-uuid-1',
      } as PlayerEntity);
      // The user lookup returns null → reject.
      teamRepo.findOne.mockResolvedValue(null);

      await expect(
        service.assertUserOwnsPlayer('user-1' as Uuid, 1),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
