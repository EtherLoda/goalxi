import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { DataSource, Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SimulationProcessor } from './simulation.processor';
import {
  MatchEntity,
  MatchEventEntity,
  MatchTeamStatsEntity,
  MatchTacticsEntity,
  PlayerEntity,
  PlayerEventEntity,
  PlayerCompetitionStatsEntity,
  TeamEntity,
  MatchStatus,
  MatchType,
  InjuryEntity,
  StaffEntity,
} from '@goalxi/database';

describe('SimulationProcessor', () => {
  let processor: SimulationProcessor;
  let matchRepository: jest.Mocked<Repository<MatchEntity>>;
  let eventRepository: jest.Mocked<Repository<MatchEventEntity>>;
  let statsRepository: jest.Mocked<Repository<MatchTeamStatsEntity>>;
  let playerRepository: jest.Mocked<Repository<PlayerEntity>>;
  let tacticsRepository: jest.Mocked<Repository<MatchTacticsEntity>>;
  let teamRepository: jest.Mocked<Repository<TeamEntity>>;
  let injuryRepository: jest.Mocked<Repository<InjuryEntity>>;
  let dataSource: jest.Mocked<DataSource>;

  const mockMatch = {
    id: 'match-1',
    homeTeamId: 'team-1',
    awayTeamId: 'team-2',
    type: MatchType.LEAGUE,
    status: MatchStatus.TACTICS_LOCKED,
    homeTeam: { id: 'team-1', name: 'HomeFC', benchConfig: {} },
    awayTeam: { id: 'team-2', name: 'AwayFC', benchConfig: {} },
    scheduledAt: new Date('2026-03-30T15:00:00Z'),
  };

  const mockJob = {
    data: {
      matchId: 'match-1',
      homeTactics: {
        formation: '4-4-2',
        lineup: [{ playerId: 'p1' }],
        substitutions: [],
      },
      awayTactics: {
        formation: '4-3-3',
        lineup: [{ playerId: 'p2' }],
        substitutions: [],
      },
      homeForfeit: false,
      awayForfeit: false,
    },
  } as Job;

  const mockHomeTactics = {
    id: 'htact-1',
    matchId: 'match-1',
    teamId: 'team-1',
    formation: '4-4-2',
    lineup: {
      GK: 'p1',
      CD: 'p2',
      LB: 'p3',
      RB: 'p4',
      CM: 'p5',
      LW: 'p6',
      RW: 'p7',
      AM: 'p8',
      CF: 'p9',
      CD2: 'p10',
      CD3: 'p11',
    },
    substitutions: [],
    instructions: {},
  };

  const mockAwayTactics = {
    id: 'atact-1',
    matchId: 'match-1',
    teamId: 'team-2',
    formation: '4-3-3',
    lineup: {
      GK: 'p12',
      CD: 'p13',
      LB: 'p14',
      RB: 'p15',
      CM: 'p16',
      LW: 'p17',
      RW: 'p18',
      AM: 'p19',
      CF: 'p20',
      CD2: 'p21',
      CD3: 'p22',
    },
    substitutions: [],
    instructions: {},
  };

  const mockHomeTeam = { id: 'team-1', name: 'HomeFC', benchConfig: {} };
  const mockAwayTeam = { id: 'team-2', name: 'AwayFC', benchConfig: {} };

  const mockPlayers = Array.from({ length: 22 }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Player ${i + 1}`,
    currentSkills: {
      pace: 70,
      strength: 70,
      stamina: 80,
      jumping: 70,
      finishing: 70,
      longShots: 70,
      composure: 70,
      positioning: 70,
      passing: 70,
      dribbling: 70,
      crossing: 70,
      tackling: 70,
      marking: 70,
      gk_reflexes: 70,
      gk_handling: 70,
    },
    currentStamina: 3,
    form: 5,
    experience: 10,
    careerStats: {},
    exactAge: [25, 0],
    appearance: 100,
  }));

  beforeEach(async () => {
    const mockTransactionManager = {
      save: jest.fn().mockResolvedValue({}),
      create: jest.fn((entity, data) => data),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockPlayers),
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ identifiers: [] }),
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SimulationProcessor,
        {
          provide: getRepositoryToken(MatchEntity),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(MatchEventEntity),
          useValue: {
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(MatchTeamStatsEntity),
          useValue: {
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PlayerEntity),
          useValue: {
            find: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(MatchTacticsEntity),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(TeamEntity),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(InjuryEntity),
          useValue: {
            find: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(StaffEntity),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: getRepositoryToken(PlayerEventEntity),
          useValue: {
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PlayerCompetitionStatsEntity),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            save: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn((callback) =>
              callback(mockTransactionManager),
            ),
          },
        },
      ],
    }).compile();

    processor = module.get<SimulationProcessor>(SimulationProcessor);
    matchRepository = module.get(getRepositoryToken(MatchEntity));
    eventRepository = module.get(getRepositoryToken(MatchEventEntity));
    statsRepository = module.get(getRepositoryToken(MatchTeamStatsEntity));
    playerRepository = module.get(getRepositoryToken(PlayerEntity));
    tacticsRepository = module.get(getRepositoryToken(MatchTacticsEntity));
    teamRepository = module.get(getRepositoryToken(TeamEntity));
    injuryRepository = module.get(getRepositoryToken(InjuryEntity));
    dataSource = module.get(DataSource);

    // Default mocks for successful simulation
    matchRepository.findOne.mockResolvedValue(mockMatch as any);
    tacticsRepository.findOne.mockImplementation(async ({ where }: any) => {
      if (where?.teamId === 'team-1') return mockHomeTactics as any;
      if (where?.teamId === 'team-2') return mockAwayTactics as any;
      return null;
    });
    teamRepository.findOne.mockImplementation(async ({ where }: any) => {
      if (where?.id === 'team-1') return mockHomeTeam as any;
      if (where?.id === 'team-2') return mockAwayTeam as any;
      return null;
    });
    playerRepository.find.mockResolvedValue(mockPlayers as any[]);
    matchRepository.save.mockResolvedValue(mockMatch as any);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('process', () => {
    it('should return silently if match not found', async () => {
      matchRepository.findOne.mockResolvedValue(null);

      await expect(processor.process(mockJob)).resolves.toBeUndefined();
    });

    it('should handle home team forfeit', async () => {
      const forfeitJob = {
        ...mockJob,
        data: { ...mockJob.data, homeForfeit: true },
      } as Job;

      matchRepository.findOne.mockResolvedValue({ ...mockMatch } as any);

      await processor.process(forfeitJob);

      expect(matchRepository.save).toHaveBeenCalled();
      const savedMatch = matchRepository.save.mock.calls[0][0] as any;
      expect(savedMatch.homeScore).toBe(0);
      expect(savedMatch.awayScore).toBe(3);
      expect(savedMatch.status).toBe(MatchStatus.COMPLETED);
    });

    it('should handle away team forfeit', async () => {
      const forfeitJob = {
        ...mockJob,
        data: { ...mockJob.data, awayForfeit: true },
      } as Job;

      matchRepository.findOne.mockResolvedValue({ ...mockMatch } as any);

      await processor.process(forfeitJob);

      expect(matchRepository.save).toHaveBeenCalled();
      const savedMatch = matchRepository.save.mock.calls[0][0] as any;
      expect(savedMatch.homeScore).toBe(3);
      expect(savedMatch.awayScore).toBe(0);
      expect(savedMatch.status).toBe(MatchStatus.COMPLETED);
    });

    it('should handle both teams forfeit (0-0)', async () => {
      const forfeitJob = {
        ...mockJob,
        data: { ...mockJob.data, homeForfeit: true, awayForfeit: true },
      } as Job;

      matchRepository.findOne.mockResolvedValue({ ...mockMatch } as any);

      await processor.process(forfeitJob);

      expect(matchRepository.save).toHaveBeenCalled();
      const savedMatch = matchRepository.save.mock.calls[0][0] as any;
      expect(savedMatch.homeScore).toBe(0);
      expect(savedMatch.awayScore).toBe(0);
    });

    it('should run normal simulation when no forfeit', async () => {
      await processor.process(mockJob);

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(tacticsRepository.findOne).toHaveBeenCalled();
      expect(teamRepository.findOne).toHaveBeenCalled();
      expect(playerRepository.find).toHaveBeenCalled();
    });

    it('should use transaction for database operations', async () => {
      await processor.process(mockJob);

      expect(dataSource.transaction).toHaveBeenCalled();
    });
  });
});
