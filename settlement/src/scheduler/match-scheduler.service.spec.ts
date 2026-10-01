import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { MatchSchedulerService } from './match-scheduler.service';
import { LOGGER_SERVICE } from '@goalxi/logger';
import {
  FanEntity,
  LeagueEntity,
  MatchEntity,
  MatchTacticsEntity,
  MatchEventEntity,
  MatchStatus,
  StadiumEntity,
  WeatherEntity,
  TacticsPresetEntity,
  MatchType,
} from '@goalxi/database';

describe('MatchSchedulerService', () => {
  let service: MatchSchedulerService;
  let tacticsRepository: jest.Mocked<Repository<MatchTacticsEntity>>;
  let presetRepository: jest.Mocked<Repository<TacticsPresetEntity>>;
  let matchRepository: jest.Mocked<Repository<MatchEntity>>;
  let eventRepository: jest.Mocked<Repository<MatchEventEntity>>;
  let simulationQueue: { add: jest.Mock };
  let completionQueue: { add: jest.Mock };
  let cupProgressQueue: { add: jest.Mock };

  const mockTacticsRepository = {
    findOne: jest.fn(),
    // `getTeamTactics` persists a default-preset-derived row via
    // `save` so the sim worker doesn't throw "Tactics missing" on
    // BOT-vs-BOT matches (see match-scheduler.service.ts:415 and
    // the [Bug fix 2026-08-18] note in the same method). The
    // mock previously had no `save` so the "fall back to default
    // preset" test crashed with `this.tacticsRepository.save is
    // not a function`. Real TypeORM `save` returns the persisted
    // entity; we mirror that so the caller can read the id /
    // submittedAt it just stamped.
    save: jest.fn(async (tactics) => tactics),
  };

  const mockPresetRepository = {
    findOne: jest.fn(),
  };

  const mockMatchRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  const mockEventRepository = {
    findOne: jest.fn(),
  };

  const mockWeatherRepository = {
    findOne: jest.fn(),
  };

  // Attendance precompute (Bug 4: live page reads Attendance 0).
  // Default `null` stubs mimic the no-stadium / no-fan path so the
  // column is left undefined and existing test assertions on the
  // CAS update payload are unaffected. Tests that want a non-zero
  // attendance can override these mocks individually.
  const mockStadiumRepository = {
    findOne: jest.fn().mockResolvedValue(null),
  };
  const mockFanRepository = {
    findOne: jest.fn().mockResolvedValue(null),
  };
  const mockLeagueRepository = {
    findOne: jest.fn().mockResolvedValue(null),
  };

  const mockSimulationQueue = {
    add: jest.fn(),
  };

  const mockCompletionQueue = {
    add: jest.fn(),
  };

  const mockCupProgressQueue = {
    add: jest.fn(),
  };

  const mockLogger = {
    log: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    child: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchSchedulerService,
        {
          provide: LOGGER_SERVICE,
          useValue: mockLogger,
        },
        {
          provide: 'BullQueue_match-simulation',
          useValue: mockSimulationQueue,
        },
        {
          provide: 'BullQueue_match-completion',
          useValue: mockCompletionQueue,
        },
        {
          provide: 'BullQueue_cup-progress',
          useValue: mockCupProgressQueue,
        },
        {
          provide: getRepositoryToken(MatchTacticsEntity),
          useValue: mockTacticsRepository,
        },
        {
          provide: getRepositoryToken(TacticsPresetEntity),
          useValue: mockPresetRepository,
        },
        {
          provide: getRepositoryToken(MatchEntity),
          useValue: mockMatchRepository,
        },
        {
          provide: getRepositoryToken(MatchEventEntity),
          useValue: mockEventRepository,
        },
        {
          provide: getRepositoryToken(WeatherEntity),
          useValue: mockWeatherRepository,
        },
        {
          provide: getRepositoryToken(StadiumEntity),
          useValue: mockStadiumRepository,
        },
        {
          provide: getRepositoryToken(FanEntity),
          useValue: mockFanRepository,
        },
        {
          provide: getRepositoryToken(LeagueEntity),
          useValue: mockLeagueRepository,
        },
      ],
    }).compile();

    service = module.get<MatchSchedulerService>(MatchSchedulerService);
    tacticsRepository = module.get(getRepositoryToken(MatchTacticsEntity));
    presetRepository = module.get(getRepositoryToken(TacticsPresetEntity));
    matchRepository = module.get(getRepositoryToken(MatchEntity));
    eventRepository = module.get(getRepositoryToken(MatchEventEntity));
    simulationQueue = module.get('BullQueue_match-simulation');
    completionQueue = module.get('BullQueue_match-completion');
    cupProgressQueue = module.get('BullQueue_cup-progress');

    jest.clearAllMocks();
    // Default: every status-guarded update succeeds. Individual tests
    // override per-call when they want to simulate a race (CAS miss).
    mockMatchRepository.update.mockResolvedValue({
      affected: 1,
      raw: [],
      generatedMaps: [],
    });
  });

  describe('getTeamTactics', () => {
    const matchId = 'match-123';
    const teamId = 'team-456';

    it('should return submitted tactics if found', async () => {
      const mockTactics = {
        id: 'tactics-1',
        matchId,
        teamId,
        formation: '4-3-3',
        lineup: { GK: 1, LB: 2 },
        submittedAt: new Date(),
      } as unknown as MatchTacticsEntity;
      mockTacticsRepository.findOne.mockResolvedValue(mockTactics);

      const result = await service['getTeamTactics'](matchId, teamId);

      expect(result).toEqual(mockTactics);
      expect(mockTacticsRepository.findOne).toHaveBeenCalledWith({
        where: { matchId, teamId },
      });
      expect(mockPresetRepository.findOne).not.toHaveBeenCalled();
    });

    it('should return default preset if no submitted tactics', async () => {
      const mockPreset = {
        id: 'preset-1',
        teamId,
        isDefault: true,
        formation: '4-4-2',
        lineup: { GK: 1, CBL: 2, CB: 3 },
        instructions: { style: 'attacking' },
        substitutions: [],
      } as unknown as TacticsPresetEntity;
      mockTacticsRepository.findOne.mockResolvedValue(null);
      mockPresetRepository.findOne.mockResolvedValue(mockPreset);

      const result = await service['getTeamTactics'](matchId, teamId);

      expect(result).not.toBeNull();
      expect(result?.formation).toBe('4-4-2');
      expect(result?.matchId).toBe(matchId);
      expect(result?.teamId).toBe(teamId);
      expect(mockTacticsRepository.findOne).toHaveBeenCalled();
      expect(mockPresetRepository.findOne).toHaveBeenCalledWith({
        where: { teamId, isDefault: true },
      });
    });

    it('should return null if no tactics and no preset (forfeit)', async () => {
      mockTacticsRepository.findOne.mockResolvedValue(null);
      mockPresetRepository.findOne.mockResolvedValue(null);

      const result = await service['getTeamTactics'](matchId, teamId);

      expect(result).toBeNull();
      expect(mockTacticsRepository.findOne).toHaveBeenCalled();
      expect(mockPresetRepository.findOne).toHaveBeenCalled();
    });
  });

  describe('presetToMatchTactics', () => {
    it('should correctly convert preset to match tactics', async () => {
      const preset: Partial<TacticsPresetEntity> = {
        id: 'preset-1',
        teamId: 'team-1',
        formation: '3-5-2',
        // Legacy uuid columns stay empty; the converter now reads v2.
        lineup: {},
        lineupV2: {
          GK: 1,
          LB: 2,
          CB: 3,
          RB: 4,
          LM: 5,
          CM: 6,
          RM: 7,
          CFL: 8,
          CF: 9,
        },
        instructions: { pressing: 'high' },
        substitutions: null,
        substitutionsV2: [{ minute: 60, out: 5, in: 10 }],
      };
      const matchId = 'match-1';
      const teamId = 'team-1';

      const result = await service['presetToMatchTactics'](
        preset as TacticsPresetEntity,
        matchId,
        teamId,
      );

      expect(result.matchId).toBe(matchId);
      expect(result.teamId).toBe(teamId);
      expect(result.presetId).toBe('preset-1');
      expect(result.formation).toBe('3-5-2');
      expect(result.lineupV2).toEqual(preset.lineupV2);
      expect(result.instructions).toEqual({ pressing: 'high' });
      expect(result.substitutionsV2).toEqual(preset.substitutionsV2);
      expect(result.submittedAt).toBeInstanceOf(Date);
    });
  });

  describe('completeMatches — stuck match recovery', () => {
    const buildInProgressMatch = (overrides: Partial<MatchEntity> = {}) => {
      const now = Date.now();
      return {
        id: 'match-stuck',
        homeTeamId: 'team-home',
        awayTeamId: 'team-away',
        homeTeam: { name: 'Home' } as any,
        awayTeam: { name: 'Away' } as any,
        homeScore: 0,
        awayScore: 0,
        homeForfeit: false,
        awayForfeit: false,
        type: MatchType.LEAGUE,
        weather: null,
        status: MatchStatus.IN_PROGRESS,
        // Default: 40 min ago — past the 30-min STUCK threshold.
        scheduledAt: new Date(now - 40 * 60 * 1000),
        tacticsLocked: true,
        ...overrides,
      } as unknown as MatchEntity;
    };

    it('re-enqueues simulation when IN_PROGRESS match has no events and scheduledAt > 30min in past', async () => {
      const match = buildInProgressMatch();
      matchRepository.find
        .mockResolvedValueOnce([match])
        // Trailing reconciliation sweep finds nothing (this match is
        // IN_PROGRESS, not COMPLETED-and-unsettled).
        .mockResolvedValueOnce([]);
      eventRepository.findOne.mockResolvedValue(null);
      // Helper reads match + tactics before re-enqueueing.
      matchRepository.findOne.mockResolvedValue(match);
      mockTacticsRepository.findOne.mockResolvedValue(null);
      simulationQueue.add.mockResolvedValue({ id: 'job-recover' });

      await service.completeMatches();

      const recoverCalls = simulationQueue.add.mock.calls.filter(
        (call) =>
          typeof call[2]?.jobId === 'string' &&
          call[2].jobId.startsWith('recover-match-stuck-'),
      );
      expect(recoverCalls.length).toBe(1);
      expect(recoverCalls[0][0]).toBe('simulate');
      expect(recoverCalls[0][1]).toMatchObject({ matchId: match.id });
      // Critical: forfeit flags and weather are carried in the payload,
      // not dropped. Otherwise a forfeit match would be simulated as real.
      expect(recoverCalls[0][1]).toMatchObject({
        homeForfeit: match.homeForfeit,
        awayForfeit: match.awayForfeit,
        matchType: match.type,
        weather: match.weather,
      });
      // Must NOT mark COMPLETED, must NOT enqueue completion.
      expect(matchRepository.save).not.toHaveBeenCalled();
      expect(completionQueue.add).not.toHaveBeenCalled();
    });

    it('does NOT re-enqueue when IN_PROGRESS match is recent (< 30min) even with no events', async () => {
      const match = buildInProgressMatch({
        scheduledAt: new Date(Date.now() - 5 * 60 * 1000),
      });
      matchRepository.find.mockResolvedValue([match]);
      eventRepository.findOne.mockResolvedValue(null);

      await service.completeMatches();

      expect(simulationQueue.add).not.toHaveBeenCalled();
    });

    it('marks COMPLETED when last event time has passed (existing behavior)', async () => {
      const match = buildInProgressMatch({
        scheduledAt: new Date(Date.now() - 60 * 60 * 1000),
      });
      const lastEvent = {
        id: 'evt-1',
        matchId: match.id,
        minute: 95,
        eventScheduledTime: new Date(Date.now() - 10 * 60 * 1000),
      } as unknown as MatchEventEntity;
      matchRepository.find
        .mockResolvedValueOnce([match])
        // The trailing reconciliation sweep (COMPLETED + settled_at IS
        // NULL, completed more than the grace period ago) finds nothing:
        // this match has only just been flipped to COMPLETED.
        .mockResolvedValueOnce([]);
      eventRepository.findOne.mockResolvedValue(lastEvent);

      await service.completeMatches();

      // Status-guarded CAS update — WHERE includes the current status
      // so a concurrent tick that already flipped this row is rejected.
      expect(matchRepository.update).toHaveBeenCalledWith(
        { id: match.id, status: MatchStatus.IN_PROGRESS },
        expect.objectContaining({ status: MatchStatus.COMPLETED }),
      );
      // Entity-level save would race with worker writes; the
      // status-guard update replaces it.
      expect(matchRepository.save).not.toHaveBeenCalled();
      expect(completionQueue.add).toHaveBeenCalledWith(
        'complete-match',
        { matchId: match.id },
        expect.objectContaining({ jobId: `complete-${match.id}` }),
      );
      // League matches must NOT touch the cup queue — that queue has a
      // dedicated worker and feeding it a league match would either
      // burn a worker slot or (worse, if the guard were ever removed)
      // corrupt a bracket.
      expect(cupProgressQueue.add).not.toHaveBeenCalled();
    });

    it('fans a CUP match out to BOTH match-completion and cup-progress', async () => {
      // Regression: `CupProgressProcessor` used to share the
      // `match-completion` queue with the API's league completion
      // worker. BullMQ workers compete rather than broadcast, so each
      // job went to exactly one of them — cup jobs left the bracket
      // un-advanced and league jobs were dropped with no standings,
      // ELO, or revenue. The two paths are now separate queues.
      const match = buildInProgressMatch({
        id: 'match-cup',
        type: MatchType.CUP,
        scheduledAt: new Date(Date.now() - 60 * 60 * 1000),
      });
      const lastEvent = {
        id: 'evt-cup',
        matchId: match.id,
        minute: 95,
        eventScheduledTime: new Date(Date.now() - 10 * 60 * 1000),
      } as unknown as MatchEventEntity;
      matchRepository.find.mockResolvedValue([match]);
      eventRepository.findOne.mockResolvedValue(lastEvent);

      await service.completeMatches();

      expect(completionQueue.add).toHaveBeenCalledWith(
        'complete-match',
        { matchId: match.id },
        expect.objectContaining({ jobId: `complete-${match.id}` }),
      );
      expect(cupProgressQueue.add).toHaveBeenCalledWith(
        'complete-match',
        { matchId: match.id },
        expect.objectContaining({
          jobId: `cup-complete-${match.id}`,
          // Without `attempts` every throw is a permanent dead-letter
          // and there is no reconciliation sweep to recover it.
          attempts: expect.any(Number),
        }),
      );
    });

    it('does not let a cup-progress enqueue failure hide a completed match', async () => {
      // The match is already COMPLETED by this point and nothing
      // sweeps for unsettled matches, so a Redis blip on the second
      // queue must at least log loudly — and must not skip the
      // "match completed" log line.
      const match = buildInProgressMatch({
        id: 'match-cup-fail',
        type: MatchType.CUP,
        scheduledAt: new Date(Date.now() - 60 * 60 * 1000),
      });
      const lastEvent = {
        id: 'evt-cup-fail',
        matchId: match.id,
        minute: 95,
        eventScheduledTime: new Date(Date.now() - 10 * 60 * 1000),
      } as unknown as MatchEventEntity;
      matchRepository.find.mockResolvedValue([match]);
      eventRepository.findOne.mockResolvedValue(lastEvent);
      cupProgressQueue.add.mockRejectedValueOnce(new Error('redis down'));

      await expect(service.completeMatches()).resolves.toBeUndefined();

      expect(completionQueue.add).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('FAILED to enqueue cup progression'),
        expect.anything(),
      );
      // The completion log still fired.
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('[done] Match completed'),
      );
    });

    it('skips completion enqueue when status-guard update reports 0 affected (race)', async () => {
      // Another tick already flipped this row to COMPLETED between
      // our `find` and our `update`. The CAS misses, we must not
      // double-enqueue the completion job (or fight the other tick).
      const match = buildInProgressMatch({
        scheduledAt: new Date(Date.now() - 60 * 60 * 1000),
      });
      const lastEvent = {
        id: 'evt-1',
        matchId: match.id,
        minute: 95,
        eventScheduledTime: new Date(Date.now() - 10 * 60 * 1000),
      } as unknown as MatchEventEntity;
      matchRepository.find.mockResolvedValueOnce([match]);
      eventRepository.findOne.mockResolvedValue(lastEvent);
      // The trailing reconciliation sweep finds nothing.
      matchRepository.find.mockResolvedValueOnce([]);
      matchRepository.update.mockResolvedValueOnce({
        affected: 0,
        raw: [],
        generatedMaps: [],
      });

      await service.completeMatches();

      expect(completionQueue.add).not.toHaveBeenCalled();
    });

    it('leaves IN_PROGRESS alone when last event is still in the future', async () => {
      const match = buildInProgressMatch();
      const lastEvent = {
        id: 'evt-1',
        matchId: match.id,
        minute: 80,
        eventScheduledTime: new Date(Date.now() + 10 * 60 * 1000),
      } as unknown as MatchEventEntity;
      // The main scan returns the in-progress match; the trailing
      // reconciliation sweep (COMPLETED + settled_at IS NULL) finds
      // nothing, because this match is not COMPLETED yet.
      matchRepository.find
        .mockResolvedValueOnce([match])
        .mockResolvedValueOnce([]);
      eventRepository.findOne.mockResolvedValue(lastEvent);

      await service.completeMatches();

      expect(matchRepository.save).not.toHaveBeenCalled();
      expect(completionQueue.add).not.toHaveBeenCalled();
      expect(simulationQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('completeMatches — unsettled reconciliation sweep', () => {
    // The hole this closes: `completeMatches` does a status CAS to
    // COMPLETED and then a separate `queue.add`. A crash between them
    // leaves a row that is COMPLETED but never settled — and permanently
    // invisible, because the next scan only matches IN_PROGRESS /
    // TACTICS_LOCKED. Manual recovery didn't work either: the
    // `complete-${id}` jobId still exists in Redis with no
    // `removeOnComplete`, so re-adding is a silent no-op, and the only
    // settlement guard was a Redis key with a 24h TTL.
    //
    // `match.settledAt` (migration 1788000000030) is the durable
    // receipt: `MatchCompletionService` stamps it only after every
    // mutation commits.

    const completedUnsettled = (over: Partial<MatchEntity> = {}) =>
      ({
        id: 'match-unsettled',
        type: MatchType.LEAGUE,
        status: MatchStatus.COMPLETED,
        settledAt: null,
        completedAt: new Date(Date.now() - 60 * 60 * 1000),
        ...over,
      }) as unknown as MatchEntity;

    it('REGRESSION: re-enqueues settlement for a COMPLETED but unsettled match', async () => {
      const match = completedUnsettled();
      // Main scan returns nothing; the reconcile sweep finds the gap.
      matchRepository.find
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([match]);

      await service.completeMatches();

      expect(completionQueue.add).toHaveBeenCalledWith(
        'complete-match',
        { matchId: match.id },
        expect.objectContaining({
          jobId: expect.stringContaining(`reconcile-complete-${match.id}`),
          attempts: 3,
        }),
      );
      // A league match must not touch the cup queue.
      expect(cupProgressQueue.add).not.toHaveBeenCalled();
    });

    it('scans on status + settledAt + a completedAt grace window', async () => {
      matchRepository.find.mockResolvedValue([]);

      await service.completeMatches();

      const sweep = matchRepository.find.mock.calls[1]?.[0] as
        | { where: Record<string, unknown>; take?: number }
        | undefined;
      expect(sweep).toBeDefined();
      // COMPLETED is required — an in-progress match is not "unsettled",
      // it is "not finished".
      expect(sweep?.where).toEqual(
        expect.objectContaining({
          status: MatchStatus.COMPLETED,
          settledAt: expect.objectContaining({ _type: 'isNull' }),
        }),
      );
      // Grace window: a match that only just completed has a job in
      // flight and must not be re-enqueued.
      expect(sweep?.where.completedAt).toBeDefined();
      // Bounded so a large backlog can't flood the queue in one tick.
      expect(sweep?.take).toBeGreaterThan(0);
    });

    it('does nothing when every COMPLETED match is settled', async () => {
      // Both scans empty — the normal steady state.
      matchRepository.find.mockResolvedValue([]);

      await service.completeMatches();

      expect(completionQueue.add).not.toHaveBeenCalled();
    });

    it('REGRESSION: also re-drives cup bracket progression for an unsettled cup match', async () => {
      // The bracket advance lives on its own queue but keys off the same
      // settlement event, so a missed cup settlement strands the bracket
      // too — which deadlocks the cup (no round ever closes).
      const match = completedUnsettled({ type: MatchType.CUP });
      matchRepository.find
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([match]);

      await service.completeMatches();

      expect(cupProgressQueue.add).toHaveBeenCalledWith(
        'complete-match',
        { matchId: match.id },
        expect.objectContaining({
          jobId: expect.stringContaining(`reconcile-cup-${match.id}`),
        }),
      );
    });

    it('uses a bucketed jobId so a stuck match retries once per bucket, not every minute', async () => {
      const match = completedUnsettled();
      matchRepository.find
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([match]);

      await service.completeMatches();

      const opts = completionQueue.add.mock.calls[0][2];
      // Bucketed + retention windows, so a later attempt is not blocked
      // by an old job record sitting in Redis.
      expect(opts.jobId).toMatch(/^reconcile-complete-.+-\d+$/);
      expect(opts.removeOnComplete).toBeDefined();
      expect(opts.removeOnFail).toBeDefined();
    });
  });

  describe('preprocessMatch — happy path', () => {
    it('locks SCHEDULED match and enqueues simulation', async () => {
      const now = Date.now();
      const scheduled = {
        id: 'match-scheduled',
        homeTeamId: 'team-home',
        awayTeamId: 'team-away',
        homeTeam: { name: 'Home' } as any,
        awayTeam: { name: 'Away' } as any,
        homeForfeit: false,
        awayForfeit: false,
        type: MatchType.LEAGUE,
        weather: null,
        status: MatchStatus.SCHEDULED,
        scheduledAt: new Date(now - 5 * 60 * 1000),
        tacticsLocked: false,
      } as unknown as MatchEntity;

      matchRepository.find
        .mockResolvedValueOnce([scheduled]) // preprocess scan
        .mockResolvedValueOnce([]); // recovery scan (empty)

      const submittedTactics = {
        id: 't-home',
        matchId: scheduled.id,
        teamId: scheduled.homeTeamId,
        formation: '4-3-3',
      } as unknown as MatchTacticsEntity;
      mockTacticsRepository.findOne.mockResolvedValue(submittedTactics);
      mockPresetRepository.findOne.mockResolvedValue(null);
      mockWeatherRepository.findOne.mockResolvedValue(null);
      simulationQueue.add.mockResolvedValue({ id: 'job-1' });

      await service.preprocessMatch();

      // Status-guarded CAS update — WHERE includes SCHEDULED.
      expect(matchRepository.update).toHaveBeenCalledWith(
        { id: scheduled.id, status: MatchStatus.SCHEDULED },
        expect.objectContaining({
          status: MatchStatus.TACTICS_LOCKED,
          tacticsLocked: true,
          homeForfeit: false,
          awayForfeit: false,
        }),
      );
      // save() would race with worker writes; the status-guard
      // update replaces it.
      expect(matchRepository.save).not.toHaveBeenCalled();
      expect(simulationQueue.add).toHaveBeenCalledWith(
        'simulate',
        expect.objectContaining({ matchId: scheduled.id }),
      );
    });

    it('skips enqueue when status-guard update reports 0 affected (race)', async () => {
      const now = Date.now();
      const scheduled = {
        id: 'match-scheduled',
        homeTeamId: 'team-home',
        awayTeamId: 'team-away',
        homeTeam: { name: 'Home' } as any,
        awayTeam: { name: 'Away' } as any,
        homeForfeit: false,
        awayForfeit: false,
        type: MatchType.LEAGUE,
        weather: null,
        status: MatchStatus.SCHEDULED,
        scheduledAt: new Date(now - 5 * 60 * 1000),
        tacticsLocked: false,
      } as unknown as MatchEntity;

      matchRepository.find
        .mockResolvedValueOnce([scheduled])
        .mockResolvedValueOnce([]);
      mockTacticsRepository.findOne.mockResolvedValue(null);
      mockPresetRepository.findOne.mockResolvedValue(null);
      mockWeatherRepository.findOne.mockResolvedValue(null);
      // Another tick won the race and flipped status before us.
      matchRepository.update.mockResolvedValueOnce({
        affected: 0,
        raw: [],
        generatedMaps: [],
      });

      await service.preprocessMatch();

      expect(simulationQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('startMatches — happy path + race', () => {
    const buildTacticsLocked = (overrides: Partial<MatchEntity> = {}) =>
      ({
        id: 'match-locked',
        homeTeamId: 'team-home',
        awayTeamId: 'team-away',
        homeTeam: { name: 'Home' } as any,
        awayTeam: { name: 'Away' } as any,
        homeScore: 0,
        awayScore: 0,
        type: MatchType.LEAGUE,
        status: MatchStatus.TACTICS_LOCKED,
        scheduledAt: new Date(Date.now() - 60 * 1000),
        ...overrides,
      }) as unknown as MatchEntity;

    it('flips TACTICS_LOCKED → IN_PROGRESS and sets startedAt', async () => {
      const match = buildTacticsLocked();
      matchRepository.find.mockResolvedValue([match]);

      await service.startMatches();

      expect(matchRepository.update).toHaveBeenCalledWith(
        { id: match.id, status: MatchStatus.TACTICS_LOCKED },
        expect.objectContaining({
          status: MatchStatus.IN_PROGRESS,
          startedAt: match.scheduledAt,
        }),
      );
      expect(matchRepository.save).not.toHaveBeenCalled();
    });

    it('skips update when status-guard update reports 0 affected (race)', async () => {
      const match = buildTacticsLocked();
      matchRepository.find.mockResolvedValue([match]);
      matchRepository.update.mockResolvedValueOnce({
        affected: 0,
        raw: [],
        generatedMaps: [],
      });

      await service.startMatches();

      // The CAS lost the race — we did not touch the row, no log
      // spam beyond the debug-level skip message.
      expect(matchRepository.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('preprocessMatch — stuck TACTICS_LOCKED recovery', () => {
    it('re-enqueues simulation for TACTICS_LOCKED matches whose scheduledAt is past', async () => {
      const now = Date.now();
      const stuckLockedMatch = {
        id: 'match-stuck-locked',
        homeTeamId: 'team-home',
        awayTeamId: 'team-away',
        homeTeam: { name: 'Home' } as any,
        awayTeam: { name: 'Away' } as any,
        homeForfeit: false,
        awayForfeit: false,
        type: MatchType.LEAGUE,
        weather: null,
        status: MatchStatus.TACTICS_LOCKED,
        scheduledAt: new Date(now - 10 * 60 * 1000),
        tacticsLocked: true,
        tacticsLockedAt: new Date(now - 15 * 60 * 1000),
      } as unknown as MatchEntity;

      // First find() call = the regular preprocess scan (nothing to lock).
      // Second find() call = the recovery scan (the stuck match).
      matchRepository.find
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([stuckLockedMatch]);
      // Helper reads the match + tactics for the recovery payload.
      matchRepository.findOne.mockResolvedValue(stuckLockedMatch);
      mockTacticsRepository.findOne.mockResolvedValue(null);
      simulationQueue.add.mockResolvedValue({ id: 'job-recover' });

      await service.preprocessMatch();

      const recoverCalls = simulationQueue.add.mock.calls.filter(
        (call) =>
          typeof call[2]?.jobId === 'string' &&
          call[2].jobId.startsWith('recover-match-stuck-locked-'),
      );
      expect(recoverCalls.length).toBe(1);
      expect(recoverCalls[0][0]).toBe('simulate');
      expect(recoverCalls[0][1]).toMatchObject({
        matchId: stuckLockedMatch.id,
      });
    });

    it('does NOT touch TACTICS_LOCKED matches scheduled in the future', async () => {
      // Both find() calls return empty — no stuck matches.
      matchRepository.find.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await service.preprocessMatch();

      expect(simulationQueue.add).not.toHaveBeenCalled();
    });

    it('REGRESSION: excludes already-simulated matches from the recovery sweep', async () => {
      // The simulator deliberately does NOT flip `status` to COMPLETED —
      // it writes the score + events, stamps `simulationCompletedAt`, and
      // leaves the row TACTICS_LOCKED for `completeMatches` to finalise.
      // So a freshly-simulated match looks exactly like a stuck one.
      //
      // Both this sweep and `completeMatches` are `@Cron('0 * * * * *')`,
      // so they run concurrently in the same process and either can win
      // the race on any given minute — giving a re-simulated match a
      // 60-second window. Neither simulator guard saved it:
      // `status === COMPLETED` doesn't apply, and the
      // `simulation_started_at` lease is RELEASED in the processor's
      // `finally`, so the atomic claim succeeds a second time.
      //
      // The delete-then-reinsert of `match_event` made the event rows
      // look fine, hiding it. Every `+=` aggregate was applied TWICE:
      // careerStats.club matches/goals/assists/tackles, experience, and
      // PlayerCompetitionStats appearances/starts/goals.
      await service.preprocessMatch();

      // The scan must exclude simulated rows at the QUERY level.
      const recoveryScan = matchRepository.find.mock.calls[1]?.[0] as
        | { where: Record<string, unknown> }
        | undefined;
      expect(recoveryScan).toBeDefined();
      expect(recoveryScan?.where).toEqual(
        expect.objectContaining({
          status: MatchStatus.TACTICS_LOCKED,
          simulationCompletedAt: expect.objectContaining({
            _type: 'isNull',
          }),
        }),
      );
    });

    it('REGRESSION: a second guard in the enqueue helper skips a simulated match', async () => {
      // Defence in depth: even if the query filter were removed, the
      // helper re-reads the row and must bail on `simulationCompletedAt`
      // rather than trusting the caller's filter.
      const now = Date.now();
      const simulatedButNotFinalised = {
        id: 'match-simulated',
        homeTeamId: 'team-home',
        awayTeamId: 'team-away',
        homeForfeit: false,
        awayForfeit: false,
        type: MatchType.LEAGUE,
        weather: null,
        // Exactly the state the simulator leaves behind.
        status: MatchStatus.TACTICS_LOCKED,
        simulationCompletedAt: new Date(now - 30 * 1000),
        scheduledAt: new Date(now - 10 * 60 * 1000),
        tacticsLocked: true,
      } as unknown as MatchEntity;

      matchRepository.find
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([simulatedButNotFinalised]);
      matchRepository.findOne.mockResolvedValue(simulatedButNotFinalised);

      await service.preprocessMatch();

      expect(simulationQueue.add).not.toHaveBeenCalled();
    });
  });
});
