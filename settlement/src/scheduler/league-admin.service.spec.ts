import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { LeagueAdminService } from './league-admin.service';
import { LOGGER_SERVICE } from '@goalxi/logger';
import { LOGGER_SERVICE_PROVIDER } from '../test-utils/test-logger';
import {
  LeagueEntity,
  LeagueStandingEntity,
  TeamEntity,
  YouthLeagueEntity,
  YouthTeamEntity,
  MatchEntity,
  Uuid,
} from '@goalxi/database';

describe('LeagueAdminService', () => {
  let service: LeagueAdminService;
  let leagueRepo: jest.Mocked<Repository<LeagueEntity>>;
  let standingRepo: jest.Mocked<Repository<LeagueStandingEntity>>;
  let teamRepo: jest.Mocked<Repository<TeamEntity>>;
  let youthLeagueRepo: jest.Mocked<Repository<YouthLeagueEntity>>;
  let youthTeamRepo: jest.Mocked<Repository<YouthTeamEntity>>;
  let dataSource: { getRepository: jest.Mock };

  const mockLeagueRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const mockStandingRepo = {
    findOne: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };
  const mockTeamRepo = { findOne: jest.fn(), save: jest.fn() };
  const mockYouthLeagueRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const mockYouthTeamRepo = { create: jest.fn(), save: jest.fn() };

  const matchRepoForInfo = {
    count: jest.fn(),
    findOne: jest.fn(),
  };
  const dataSourceMock = {
    getRepository: jest.fn().mockReturnValue(matchRepoForInfo),
    // `addTeamToLeague` / `removeTeamFromLeague` now run their
    // multi-write sequences inside one transaction, so the manager must
    // hand back the SAME mocks the spec asserts on. Routing to anything
    // else would let a test pass while the transaction wrote elsewhere.
    transaction: jest.fn(async (cb: any) =>
      cb({
        getRepository: jest.fn((entity: any) => {
          switch (entity?.name) {
            case 'TeamEntity':
              return mockTeamRepo;
            case 'LeagueStandingEntity':
              return mockStandingRepo;
            case 'YouthLeagueEntity':
              return mockYouthLeagueRepo;
            case 'YouthTeamEntity':
              return mockYouthTeamRepo;
            default:
              throw new Error(
                `txManager: unmocked entity ${entity?.name}`,
              );
          }
        }),
      }),
    ),
  };

  // identity creator — `create(input)` echoes the input back so the
  // test can assert on the same shape the service is trying to persist.
  const identity = (x: any) => x;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeagueAdminService,
        LOGGER_SERVICE_PROVIDER,
        { provide: getRepositoryToken(LeagueEntity), useValue: mockLeagueRepo },
        {
          provide: getRepositoryToken(LeagueStandingEntity),
          useValue: mockStandingRepo,
        },
        { provide: getRepositoryToken(TeamEntity), useValue: mockTeamRepo },
        {
          provide: getRepositoryToken(YouthLeagueEntity),
          useValue: mockYouthLeagueRepo,
        },
        {
          provide: getRepositoryToken(YouthTeamEntity),
          useValue: mockYouthTeamRepo,
        },
        { provide: DataSource, useValue: dataSourceMock },
      ],
    }).compile();

    service = module.get<LeagueAdminService>(LeagueAdminService);
    leagueRepo = module.get(getRepositoryToken(LeagueEntity));
    standingRepo = module.get(getRepositoryToken(LeagueStandingEntity));
    teamRepo = module.get(getRepositoryToken(TeamEntity));
    youthLeagueRepo = module.get(getRepositoryToken(YouthLeagueEntity));
    youthTeamRepo = module.get(getRepositoryToken(YouthTeamEntity));
    dataSource = dataSourceMock;

    jest.clearAllMocks();
    mockLeagueRepo.create.mockImplementation(identity);
    mockYouthLeagueRepo.create.mockImplementation(identity);
    mockStandingRepo.create.mockImplementation(identity);
    mockYouthTeamRepo.create.mockImplementation(identity);
    // Reset the nested dataSource.getRepository — clearAllMocks above
    // wipes both the outer spy and the nested match repo's counts.
    dataSource.getRepository.mockReturnValue(matchRepoForInfo);
  });

  describe('createLeague', () => {
    it('creates both the senior and youth league', async () => {
      mockLeagueRepo.findOne.mockResolvedValue(null);
      mockLeagueRepo.save.mockResolvedValue({} as LeagueEntity);
      mockYouthLeagueRepo.save.mockResolvedValue({} as YouthLeagueEntity);

      const league = await service.createLeague('Test League', 2, 1);

      expect(league).toBeDefined();
      expect(league.name).toBe('Test League');
      expect(league.tier).toBe(2);
      expect(league.tierDivision).toBe(1);
      // Both senior + youth league persisted.
      expect(mockLeagueRepo.save).toHaveBeenCalledTimes(1);
      expect(mockYouthLeagueRepo.save).toHaveBeenCalledTimes(1);
    });

    it('rejects duplicate league names', async () => {
      mockLeagueRepo.findOne.mockResolvedValue({
        id: 'existing',
      } as LeagueEntity);

      await expect(service.createLeague('Duplicate', 1, 1)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockLeagueRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('addTeamToLeague', () => {
    it('rejects when the team does not exist', async () => {
      mockTeamRepo.findOne.mockResolvedValue(null);

      await expect(
        service.addTeamToLeague(
          'missing-team' as Uuid,
          'any-league' as Uuid,
          1,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when the league is already at maxTeams', async () => {
      mockTeamRepo.findOne.mockResolvedValue({
        id: 't' as Uuid,
        name: 'Team',
      } as TeamEntity);
      mockLeagueRepo.findOne.mockResolvedValue({
        id: 'l' as Uuid,
        name: 'L',
        tier: 1,
        maxTeams: 2,
      } as LeagueEntity);
      mockStandingRepo.count.mockResolvedValue(2);

      await expect(
        service.addTeamToLeague('t' as Uuid, 'l' as Uuid, 1),
      ).rejects.toThrow(/full/);
    });

    it('rejects when the team is already in the league this season', async () => {
      mockTeamRepo.findOne.mockResolvedValue({
        id: 't' as Uuid,
        name: 'T',
      } as TeamEntity);
      mockLeagueRepo.findOne.mockResolvedValue({
        id: 'l' as Uuid,
        name: 'L',
        tier: 1,
        maxTeams: 16,
      } as LeagueEntity);
      mockStandingRepo.count.mockResolvedValue(5);
      mockStandingRepo.findOne.mockResolvedValue({
        teamId: 't',
        leagueId: 'l',
      } as any);

      await expect(
        service.addTeamToLeague('t' as Uuid, 'l' as Uuid, 1),
      ).rejects.toThrow(/already in league/);
    });

    it('happy path: updates team.leagueId, creates standing, and (if a youth league exists) a youth team', async () => {
      mockTeamRepo.findOne.mockResolvedValue({
        id: 't' as Uuid,
        name: 'Team',
      } as TeamEntity);
      mockLeagueRepo.findOne.mockResolvedValue({
        id: 'l' as Uuid,
        name: 'L',
        tier: 2,
        maxTeams: 16,
      } as LeagueEntity);
      mockStandingRepo.count.mockResolvedValue(7);
      mockStandingRepo.findOne.mockResolvedValue(null);
      mockTeamRepo.save.mockResolvedValue({} as TeamEntity);
      mockStandingRepo.save.mockResolvedValue({} as LeagueStandingEntity);

      mockYouthLeagueRepo.findOne.mockResolvedValue({
        id: 'yl' as Uuid,
        parentTier: 2,
        name: 'L Youth League',
      } as unknown as YouthLeagueEntity);
      mockYouthTeamRepo.save.mockResolvedValue(
        {} as unknown as YouthTeamEntity,
      );

      await service.addTeamToLeague('t' as Uuid, 'l' as Uuid, 3);

      // The team's leagueId was updated.
      const teamSave = mockTeamRepo.save.mock.calls[0][0] as TeamEntity;
      expect(teamSave.leagueId).toBe('l');

      // A standing was created with position = currentTeams + 1.
      const standingCreate = mockStandingRepo.create.mock.calls[0][0];
      expect(standingCreate.position).toBe(8);
      expect(standingCreate.season).toBe(3);

      // A youth team was created against the tier's youth league.
      const youthCreate = mockYouthTeamRepo.create.mock.calls[0][0];
      expect(youthCreate.teamId).toBe('t');
      expect(youthCreate.youthLeagueId).toBe('yl');
    });
  });

  describe('removeTeamFromLeague', () => {
    it('rejects when the team does not exist', async () => {
      mockTeamRepo.findOne.mockResolvedValue(null);
      await expect(service.removeTeamFromLeague('x' as Uuid)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('happy path: clears team.leagueId and deletes standings', async () => {
      mockTeamRepo.findOne.mockResolvedValue({
        id: 't' as Uuid,
        name: 'Team',
        leagueId: 'l' as Uuid,
      } as unknown as TeamEntity);

      await service.removeTeamFromLeague('t' as Uuid);

      expect(mockStandingRepo.delete).toHaveBeenCalledWith({ teamId: 't' });
      const saved = mockTeamRepo.save.mock.calls[0][0] as TeamEntity;
      expect(saved.leagueId).toBeNull();
    });
  });

  describe('getLeagueSeasonInfo', () => {
    it('returns match counts and the highest week seen', async () => {
      mockLeagueRepo.findOne.mockResolvedValue({
        id: 'l' as Uuid,
        name: 'L',
      } as LeagueEntity);
      matchRepoForInfo.count
        .mockResolvedValueOnce(120) // total
        .mockResolvedValueOnce(100); // completed
      matchRepoForInfo.findOne.mockResolvedValue({ week: 12 } as any);

      const info = await service.getLeagueSeasonInfo('l' as Uuid, 1);

      expect(info).toEqual({
        totalMatches: 120,
        completedMatches: 100,
        currentWeek: 12,
        isComplete: false,
      });
    });

    it('marks season complete when every match is done', async () => {
      mockLeagueRepo.findOne.mockResolvedValue({
        id: 'l' as Uuid,
        name: 'L',
      } as LeagueEntity);
      matchRepoForInfo.count
        .mockResolvedValueOnce(120)
        .mockResolvedValueOnce(120);
      matchRepoForInfo.findOne.mockResolvedValue({ week: 15 } as any);

      const info = await service.getLeagueSeasonInfo('l' as Uuid, 1);

      expect(info.isComplete).toBe(true);
      expect(info.currentWeek).toBe(15);
    });

    it('reports 0-week season when the league has no matches at all', async () => {
      mockLeagueRepo.findOne.mockResolvedValue({
        id: 'l' as Uuid,
        name: 'L',
      } as LeagueEntity);
      matchRepoForInfo.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      matchRepoForInfo.findOne.mockResolvedValue(null);

      const info = await service.getLeagueSeasonInfo('l' as Uuid, 1);

      // 0 total → not "complete" (would otherwise flip the flag
      // because 0 >= 0 is true).
      expect(info.isComplete).toBe(false);
      expect(info.currentWeek).toBe(0);
    });
  });
});

/**
 * Atomicity of the league-membership writes.
 *
 * `addTeamToLeague` used to run three writes with no transaction:
 * `team.leagueId = leagueId`, the standing row, and (conditionally) the
 * youth team. A failure after the first left a team pointing at a league
 * it had no ladder entry in — and `promotion-relegation` / `playoff`
 * both select by `standing.position === N`, so the phantom team was
 * invisible to selection while still consuming a `maxTeams` slot.
 *
 * `removeTeamFromLeague` had the mirror problem in inverted order: it
 * deleted the standing row FIRST, then cleared `team.leagueId`. A
 * failure in between left a team with no league still occupying a slot.
 */
describe('LeagueAdminService — atomic league membership', () => {
  let service: LeagueAdminService;
  let teamRepo: any;
  let standingRepo: any;
  let youthLeagueRepo: any;
  let youthTeamRepo: any;
  let transactionShouldThrow: boolean;

  const identity = (x: any) => x;
  const emptyRepo = { findOne: jest.fn().mockResolvedValue(null) };

  const manager = {
    getRepository: jest.fn((entity: any) => {
      switch (entity?.name) {
        case 'TeamEntity':
          return teamRepo;
        case 'LeagueStandingEntity':
          return standingRepo;
        case 'YouthLeagueEntity':
          return youthLeagueRepo;
        case 'YouthTeamEntity':
          return youthTeamRepo;
        default:
          throw new Error(`unmocked ${entity?.name}`);
      }
    }),
  };

  const dataSource = {
    getRepository: jest.fn().mockReturnValue(emptyRepo),
    transaction: jest.fn(async (cb: any) => {
      if (transactionShouldThrow) throw new Error('ROLLBACK');
      return cb(manager);
    }),
  };

  beforeEach(async () => {
    transactionShouldThrow = false;
    jest.clearAllMocks();

    teamRepo = { findOne: jest.fn(), save: jest.fn(identity) };
    standingRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(3),
      create: jest.fn(identity),
      save: jest.fn(identity),
      delete: jest.fn(),
    };
    youthLeagueRepo = { findOne: jest.fn().mockResolvedValue(null), create: jest.fn(identity), save: jest.fn(identity) };
    youthTeamRepo = { create: jest.fn(identity), save: jest.fn(identity) };

    teamRepo.findOne.mockResolvedValue({ id: 't', name: 'Team', leagueId: null });

    const module = await Test.createTestingModule({
      providers: [
        LeagueAdminService,
        { provide: LOGGER_SERVICE, useValue: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), log: jest.fn() } },
        { provide: getRepositoryToken(LeagueEntity), useValue: { findOne: jest.fn().mockResolvedValue({ id: 'l', name: 'L', tier: 1, maxTeams: 16 }), create: jest.fn(), save: jest.fn() } },
        { provide: getRepositoryToken(LeagueStandingEntity), useValue: standingRepo },
        { provide: getRepositoryToken(TeamEntity), useValue: teamRepo },
        { provide: getRepositoryToken(YouthLeagueEntity), useValue: youthLeagueRepo },
        { provide: getRepositoryToken(YouthTeamEntity), useValue: youthTeamRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<LeagueAdminService>(LeagueAdminService);
  });

  it('wraps the three addTeamToLeague writes in one transaction', async () => {
    youthLeagueRepo.findOne.mockResolvedValue({ id: 'yl', parentTier: 1 });

    await service.addTeamToLeague('t' as any, 'l' as any, 1);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    // team.leagueId, the standing row, and the youth team all go through
    // the transaction's manager — none through the injected repositories.
    expect(manager.getRepository).toHaveBeenCalled();
  });

  it('propagates a rollback out of addTeamToLeague', async () => {
    transactionShouldThrow = true;

    await expect(
      service.addTeamToLeague('t' as any, 'l' as any, 1),
    ).rejects.toThrow('ROLLBACK');
  });

  it('clears team.leagueId BEFORE deleting the standing row on removal', async () => {
    // The original order deleted the row first, so a failure in between
    // left a team with no league still holding a ladder slot.
    const order: string[] = [];
    teamRepo.save.mockImplementation(async () => {
      order.push('clear-league-id');
      return {};
    });
    standingRepo.delete.mockImplementation(async () => {
      order.push('delete-standing');
      return {};
    });

    await service.removeTeamFromLeague('t' as any);

    expect(order).toEqual(['clear-league-id', 'delete-standing']);
  });

  it('wraps the two removeTeamFromLeague writes in one transaction', async () => {
    await service.removeTeamFromLeague('t' as any);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(teamRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ leagueId: null }),
    );
    expect(standingRepo.delete).toHaveBeenCalledWith({ teamId: 't' });
  });
});
