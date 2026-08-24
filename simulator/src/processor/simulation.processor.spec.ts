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
    lineup: {},
    lineupV2: {
      GK: 1,
      CB: 2,
      LB: 3,
      RB: 4,
      CM: 5,
      LW: 6,
      RW: 7,
      AM: 8,
      CF: 9,
      CBR: 10,
      CBL: 11,
    },
    substitutions: [],
    instructions: {},
  };

  const mockAwayTactics = {
    id: 'atact-1',
    matchId: 'match-1',
    teamId: 'team-2',
    formation: '4-3-3',
    lineup: {},
    lineupV2: {
      GK: 12,
      CB: 13,
      LB: 14,
      RB: 15,
      CM: 16,
      LW: 17,
      RW: 18,
      AM: 19,
      CF: 20,
      CBR: 21,
      CBL: 22,
    },
    substitutions: [],
    instructions: {},
  };

  const mockHomeTeam = { id: 'team-1', name: 'HomeFC', benchConfig: {} };
  const mockAwayTeam = { id: 'team-2', name: 'AwayFC', benchConfig: {} };

  const mockPlayers = Array.from({ length: 22 }, (_, i) => ({
    id: i + 1,
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
      // `manager.find` powers the batched competition-stats lookup
      // (`find({ where: { playerId: In([...]) } })`). Default to
      // an empty array so the path falls through to "all players
      // need a new row" — matches the legacy 22× findOne default
      // of "no existing row, create one" without 500-ing.
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockPlayers),
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ identifiers: [] }),
      })),
      // `applyInjuryBatch` (called inside the persist transaction)
      // resolves its repos through `manager.getRepository`. The empty-
      // events path (most happy-path tests) never calls these, but the
      // P2-#8 ghost-injury guard runs `injuryRepo.find` even for a
      // 0-event batch — wait, no, it only runs the find when items
      // are non-empty. Most happy-path tests still pass without find
      // being a function. We add a `find` stub returning [] so any
      // future batch case has a safe default.
      getRepository: jest.fn((entity: unknown) => {
        if (entity === InjuryEntity) {
          return {
            save: jest.fn(),
            create: jest.fn((d: unknown) => d),
            find: jest.fn().mockResolvedValue([]),
          };
        }
        if (entity === PlayerEntity) {
          return {
            save: jest.fn(),
            create: jest.fn((d: unknown) => d),
            update: jest.fn(),
          };
        }
        return {};
      }),
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
      // but the missing-player filter runs BEFORE that 鈥?so we only need to
      // observe the logger. Swallow anything else.
      try {
        await processor.process(mockJob);
      } catch {
        /* ignore 鈥?we only care about the warn() calls */
      }

      // mockPlayers contains every ID referenced by mockHomeTactics /
      // mockAwayTactics 鈥?none of them should be reported as missing.
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
            lineupV2: { ...mockHomeTactics.lineupV2, CB: 9999, LB: 9998 },
          } as any;
        }
        if (where?.teamId === 'team-2') return mockAwayTactics as any;
        return null;
      });

      try {
        await processor.process(mockJob);
      } catch {
        /* ignore 鈥?we only care about the warn() calls */
      }

      const missingWarnings = mockLogger.warn.mock.calls.filter(
        (c: unknown[]) =>
          typeof c[0] === 'string' && c[0].includes('missing players'),
      );
      // Exactly one warning, naming both ghost ids.
      expect(missingWarnings).toHaveLength(1);
      expect(missingWarnings[0][0]).toContain('9999');
      expect(missingWarnings[0][0]).toContain('9998');
      expect(missingWarnings[0][0]).toContain('Home lineup');
    });

    // [RFC sim-worker-lock] Regression: a second concurrent worker that
    // loses the atomic claim must bail out BEFORE running the engine. The
    // old guard only checked status=COMPLETED, but the worker never sets
    // that itself, so two workers could both pass the guard and bulk-insert
    // events for the same match 鈥?producing 4脳 snapshots per minute.
    it('skips when another worker already holds the simulation lease', async () => {
      // Mock the manager.query UPDATE...RETURNING to return zero rows 鈥?      // that's what the DB returns when another worker already set
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

      // The losing worker must skip without invoking the engine 鈥?      // i.e. no tactics fetch, no player fetch, no event bulk-insert.
      expect(tacticsRepository.findOne).not.toHaveBeenCalled();
      expect(playerRepository.find).not.toHaveBeenCalled();
      // And it must log a warning so the duplicate job shows up in logs.
      const skipWarnings = mockLogger.warn.mock.calls.filter(
        (c: unknown[]) =>
          typeof c[0] === 'string' &&
          c[0].includes('simulation already in flight'),
      );
      expect(skipWarnings).toHaveLength(1);
      // The lease-release UPDATE should NOT fire on the skip path 鈥?      // releasing a lease we never held would clobber another worker's
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

  describe('shots / saves persistence', () => {
    // Engine-side definitions:
    //   shots = every shot attempt by the shooter (goal/miss/save/
    //          block from `handleShot`); only open-play, not penalty
    //          shootout
    //   saves = one credit per `save` outcome, to the defending
    //          team's GK (`defendingTeam.getGoalkeeper()`)
    //
    // The simulator's `updatePlayerCompetitionStats` reads these
    // off `engine.getPlayerMatchStats()` and adds them to the per-
    // player-competition-stats row. Behavioural test would require
    // running a full match in a unit test (slow, fragile, the
    // engine's shot/save outcome is stochastic). Source-level
    // tripwire is enough: if anyone removes the += in the
    // accumulator block, the test fails immediately and points
    // at the line that needs to be re-added.
    it('source: simulator writes shots and saves into the comp-stats accumulator', () => {
      const fs = require('fs');
      const path = require('path');
      const src = fs.readFileSync(
        path.join(__dirname, 'simulation.processor.ts'),
        'utf8',
      );
      // The two writes must both exist in the same accumulator block.
      // The wording (with `stats.` prefix) is the unique signature.
      const required = [
        'compStats.shots',
        'compStats.saves',
        'compStats.minutes',
      ];
      for (const term of required) {
        expect(src).toContain(term);
      }
      // Default-0 initialisation on the create() branch is just as
      // load-bearing - if a new row is missing either, the column
      // will come back as null instead of 0.
      const initTerms = [
        'shots: 0',
        'saves: 0',
        'minutes: 0',
      ];
      for (const term of initTerms) {
        expect(src).toContain(term);
      }
    });


    it('RFC 0002: source — bulk insert writes the (classId, outcomeId, outcomeCode) tuple alongside the legacy type int', () => {
      // The processor is the SINGLE hot path that converts
      // engine-emitted `e.type` strings into DB rows. RFC 0002
      // Phase 2 dual-writes: the new 3 columns (eventClassId,
      // outcomeId, outcomeCode) sit alongside the legacy
      // `type` int + `typeName` string for the 1-week soak.
      // A future refactor that drops the dual-write would
      // break the Phase 2 contract. The tripwire below
      // confirms all 3 keys exist in the same `values(...)`
      // map.
      const fs = require('fs');
      const path = require('path');
      const src = fs.readFileSync(
        path.join(__dirname, 'simulation.processor.ts'),
        'utf8',
      );
      // The wording (with `e.type` argument) is the unique
      // signature of the RFC 0002 mapping call. Three keys
      // must appear in the bulk-insert values block.
      expect(src).toMatch(/eventClassId:\s*getEventTwoAxis\(e\.type\)\.classId/);
      expect(src).toMatch(/outcomeId:\s*getEventTwoAxis\(e\.type\)\.outcomeId/);
      expect(src).toMatch(/outcomeCode:\s*getEventTwoAxis\(e\.type\)\.outcomeCode/);
    });

    it('RFC 0002: source — getEventTwoAxis is imported from @goalxi/database', () => {
      // The hot-path TS mirror lives at
      // `libs/database/src/constants/event-two-axis.ts`. The
      // processor must import `getEventTwoAxis` from
      // `@goalxi/database` (not from a local path), so the
      // DB package's barrel export is the single source.
      const fs = require('fs');
      const path = require('path');
      const src = fs.readFileSync(
        path.join(__dirname, 'simulation.processor.ts'),
        'utf8',
      );
      expect(src).toMatch(
        /import\s*\{[^}]*\bgetEventTwoAxis\b[^}]*\}\s*from\s*['"]@goalxi\/database['"]/,
      );
    });

    it('source: minutes is summed from stats.minutesPlayed (not from PlayerEntity.matchMinutes)', () => {
      // Two minutes sources exist:
      //   - engine's playerMatchStats.minutesPlayed (correct:
      //     credits stoppage, red-card, sub-out minutes via
      //     finalizePlayerMinutes)
      //   - API-side PlayerEntity.matchMinutes (the heuristic
      //     in match-completion.service.ts addMatchMinutes - has
      //     known bugs the other commits fixed for red card /
      //     stoppage time, but the engine still gets it wrong
      //     in ffinalizePlayerMinutes too - so the engine
      //     number is the best of the two, not the API one)
      // The simulator must use the engine's number. The exact
      // identifier is stats.minutesPlayed (the engine's field
      // on the per-player stat row). Any switch to the API
      // side (player.matchMinutes) would silently double-count
      // (the API runs after the simulator and increments the
      // same column a second time per match, defeating the
      // careerStats single-writer pattern).
      const fs = require('fs');
      const path = require('path');
      const src = fs.readFileSync(
        path.join(__dirname, 'simulation.processor.ts'),
        'utf8',
      );
      expect(src).toMatch(/stats\.minutesPlayed/);
      // Belt-and-braces: explicitly forbid the API-side source.
      expect(src).not.toMatch(/player\.matchMinutes/);
    });
  });});
