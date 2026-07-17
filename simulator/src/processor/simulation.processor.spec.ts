import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { DataSource, Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LOGGER_SERVICE } from '@goalxi/logger';
import { SimulationProcessor } from './simulation.processor';
import { NotificationService } from '../notification/notification.service';
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
  let mockLogger: { warn: jest.Mock; info: jest.Mock; error: jest.Mock; log: jest.Mock; debug: jest.Mock };

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
    getExactAge: () => [25, 0],
  }));

  beforeEach(async () => {
    const mockTransactionManager = {
      save: jest.fn().mockResolvedValue({}),
      create: jest.fn((entity, data) => data),
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
      // `manager.query` powers the atomic claim in process() — the default
      // returns a one-row array so the happy-path tests still pass. Tests
      // that want to simulate a losing claim override this per-test.
      query: jest.fn().mockResolvedValue([{ id: 'match-1' }]),
      // `manager.findOne` is used by the player career-stats and competition-
      // stats paths inside runSimulation. Default to null so those branches
      // fall back to "create new row" without a 500.
      findOne: jest.fn().mockResolvedValue(null),
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
            // `update` powers the lease-release in the process() finally
            // block. Default to a successful no-op so existing tests don't
            // have to care.
            update: jest.fn().mockResolvedValue({ affected: 1 }),
          },
        },
        {
          provide: getRepositoryToken(MatchEventEntity),
          useValue: {
            save: jest.fn(),
            find: jest.fn().mockResolvedValue([]),
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
        {
          // NotificationService constructor pulls in ConfigService + Redis.
          // Replace the whole class with a no-op stub for the unit test.
          provide: NotificationService,
          useValue: {
            create: jest.fn().mockResolvedValue(undefined),
            createWithTime: jest.fn().mockResolvedValue(undefined),
            deleteExpired: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          // Shared @goalxi/logger pino instance.
          provide: LOGGER_SERVICE,
          useValue: { log: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), child: jest.fn(function () { return this; }) },
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
    // Expose the logger so inner `describe('process', ...)` blocks can assert
    // on warn/info calls without re-resolving the test module.
    mockLogger = module.get(LOGGER_SERVICE) as any;

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
    beforeEach(() => {
      mockLogger.warn.mockClear();
      mockLogger.info.mockClear();
      mockLogger.error.mockClear();
    });
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
      // Reset match status so the runSimulation path is exercised, even if
      // a prior test left the shared mockMatch with status=COMPLETED.
      matchRepository.findOne.mockResolvedValue({
        ...mockMatch,
        status: MatchStatus.TACTICS_LOCKED,
      } as any);

      await processor.process(mockJob);

      expect(dataSource.transaction).toHaveBeenCalled();
    });

    // Regression: the processor used to filter starters with
    // `(pid as any) in homePlayerIds`, which checks the Set's own
    // properties (`size`/`add`/`has`) rather than its values. That
    // flagged every UUID as "missing", dropped both teams to zero
    // valid starters, and the roster-forfeit gate ran a 0-0 walkover
    // even when the DB had all the players.
    it('should not flag known lineup players as missing (Set.has vs `in`)', async () => {
      // Downstream mocks for runSimulation are partial (e.g. manager.findOne),
      // but the missing-player filter runs BEFORE that — so we only need to
      // observe the logger. Swallow anything else.
      try {
        await processor.process(mockJob);
      } catch {
        /* ignore — we only care about the warn() calls */
      }

      // mockPlayers contains every ID referenced by mockHomeTactics /
      // mockAwayTactics — none of them should be reported as missing.
      const missingWarnings = mockLogger.warn.mock.calls.filter(
        (c: unknown[]) =>
          typeof c[0] === 'string' && c[0].includes('missing players'),
      );
      expect(missingWarnings).toEqual([]);
    });

    it('should warn only for genuinely missing player ids', async () => {
      // Mix in two unknown ids into the home lineup.
      tacticsRepository.findOne.mockImplementation(async ({ where }: any) => {
        if (where?.teamId === 'team-1') {
          return {
            ...mockHomeTactics,
            lineup: { ...mockHomeTactics.lineup, CD: 'ghost-1', LB: 'ghost-2' },
          } as any;
        }
        if (where?.teamId === 'team-2') return mockAwayTactics as any;
        return null;
      });

      try {
        await processor.process(mockJob);
      } catch {
        /* ignore — we only care about the warn() calls */
      }

      const missingWarnings = mockLogger.warn.mock.calls.filter(
        (c: unknown[]) =>
          typeof c[0] === 'string' && c[0].includes('missing players'),
      );
      // Exactly one warning, naming both ghost ids.
      expect(missingWarnings).toHaveLength(1);
      expect(missingWarnings[0][0]).toContain('ghost-1');
      expect(missingWarnings[0][0]).toContain('ghost-2');
      expect(missingWarnings[0][0]).toContain('Home lineup');
    });

    // [RFC sim-worker-lock] Regression: a second concurrent worker that
    // loses the atomic claim must bail out BEFORE running the engine. The
    // old guard only checked status=COMPLETED, but the worker never sets
    // that itself, so two workers could both pass the guard and bulk-insert
    // events for the same match — producing 4× snapshots per minute.
    it('skips when another worker already holds the simulation lease', async () => {
      // Mock the manager.query UPDATE...RETURNING to return zero rows —
      // that's what the DB returns when another worker already set
      // simulation_started_at.
      const txManager = (dataSource.transaction as jest.Mock).mock.calls[0]?.[0];
      // The transaction callback in process() will receive the manager
      // returned by dataSource.transaction. We override dataSource itself
      // for this test to make the claim return zero rows.
      const originalTransaction = dataSource.transaction.getMockImplementation();
      (dataSource.transaction as jest.Mock).mockImplementation(
        async (cb: any) => {
          const manager = {
            query: jest.fn().mockResolvedValue([]),
            save: jest.fn().mockResolvedValue({}),
            create: jest.fn((entity: any, data: any) => data),
            delete: jest.fn().mockResolvedValue({ affected: 0 }),
            createQueryBuilder: jest.fn(() => ({
              where: jest.fn().mockReturnThis(),
              getMany: jest.fn().mockResolvedValue(mockPlayers),
              insert: jest.fn().mockReturnThis(),
              into: jest.fn().mockReturnThis(),
              values: jest.fn().mockReturnThis(),
              execute: jest.fn().mockResolvedValue({ identifiers: [] }),
            })),
          };
          return cb(manager);
        },
      );

      try {
        await processor.process(mockJob);
      } finally {
        if (originalTransaction) {
          (dataSource.transaction as jest.Mock).mockImplementation(
            originalTransaction,
          );
        }
      }

      // The losing worker must skip without invoking the engine —
      // i.e. no tactics fetch, no player fetch, no event bulk-insert.
      expect(tacticsRepository.findOne).not.toHaveBeenCalled();
      expect(playerRepository.find).not.toHaveBeenCalled();
      // And it must log a warning so the duplicate job shows up in logs.
      const skipWarnings = mockLogger.warn.mock.calls.filter(
        (c: unknown[]) =>
          typeof c[0] === 'string' &&
          c[0].includes('simulation already in flight'),
      );
      expect(skipWarnings).toHaveLength(1);
      // The lease-release UPDATE should NOT fire on the skip path —
      // releasing a lease we never held would clobber another worker's
      // timestamp and let a third worker squeeze in.
      const releaseCalls = matchRepository.update.mock.calls.filter(
        (c: unknown[]) => {
          const arg = c[1] as { simulationStartedAt?: unknown } | undefined;
          return arg?.simulationStartedAt === null;
        },
      );
      expect(releaseCalls).toHaveLength(0);
    });

    it('releases the lease after a successful simulation', async () => {
      // Reset match status so the runSimulation path is exercised.
      matchRepository.findOne.mockResolvedValue({
        ...mockMatch,
        status: MatchStatus.TACTICS_LOCKED,
      } as any);

      await processor.process(mockJob);

      // Lease-release UPDATE must fire with simulationStartedAt: null.
      const releaseCalls = matchRepository.update.mock.calls.filter(
        (c: unknown[]) => {
          const arg = c[1] as { simulationStartedAt?: unknown } | undefined;
          return arg?.simulationStartedAt === null;
        },
      );
      expect(releaseCalls).toHaveLength(1);
      // And the claim UPDATE must have been issued against the DB.
      // dataSource.transaction gets called at least twice: once for the
      // claim, once for the persist transaction in runSimulation.
      expect(dataSource.transaction.mock.calls.length).toBeGreaterThanOrEqual(
        2,
      );
    });
  });
});
