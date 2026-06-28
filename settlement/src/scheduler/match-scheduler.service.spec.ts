import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { MatchSchedulerService } from './match-scheduler.service';
import { LOGGER_SERVICE } from '@goalxi/logger';
import {
  MatchEntity,
  MatchTacticsEntity,
  MatchEventEntity,
  MatchStatus,
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

  const mockTacticsRepository = {
    findOne: jest.fn(),
  };

  const mockPresetRepository = {
    findOne: jest.fn(),
  };

  const mockMatchRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockEventRepository = {
    findOne: jest.fn(),
  };

  const mockWeatherRepository = {
    findOne: jest.fn(),
  };

  const mockSimulationQueue = {
    add: jest.fn(),
  };

  const mockCompletionQueue = {
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
      ],
    }).compile();

    service = module.get<MatchSchedulerService>(MatchSchedulerService);
    tacticsRepository = module.get(getRepositoryToken(MatchTacticsEntity));
    presetRepository = module.get(getRepositoryToken(TacticsPresetEntity));
    matchRepository = module.get(getRepositoryToken(MatchEntity));
    eventRepository = module.get(getRepositoryToken(MatchEventEntity));
    simulationQueue = module.get('BullQueue_match-simulation');
    completionQueue = module.get('BullQueue_match-completion');

    jest.clearAllMocks();
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
        lineup: { GK: 'player-1', LB: 'player-2' },
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
        lineup: { GK: 'player-1', CB1: 'player-2', CB2: 'player-3' },
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
    it('should correctly convert preset to match tactics', () => {
      const preset: Partial<TacticsPresetEntity> = {
        id: 'preset-1',
        teamId: 'team-1',
        formation: '3-5-2',
        lineup: {
          GK: 'p1',
          LB: 'p2',
          CB: 'p3',
          RB: 'p4',
          LM: 'p5',
          CM: 'p6',
          RM: 'p7',
          CF1: 'p8',
          CF2: 'p9',
        },
        instructions: { pressing: 'high' },
        substitutions: [{ minute: 60, out: 'p5', in: 'p10' }],
      };
      const matchId = 'match-1';
      const teamId = 'team-1';

      const result = service['presetToMatchTactics'](
        preset as TacticsPresetEntity,
        matchId,
        teamId,
      );

      expect(result.matchId).toBe(matchId);
      expect(result.teamId).toBe(teamId);
      expect(result.presetId).toBe('preset-1');
      expect(result.formation).toBe('3-5-2');
      expect(result.lineup).toEqual(preset.lineup);
      expect(result.instructions).toEqual({ pressing: 'high' });
      expect(result.substitutions).toEqual(preset.substitutions);
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
      matchRepository.find.mockResolvedValue([match]);
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
      matchRepository.find.mockResolvedValue([match]);
      eventRepository.findOne.mockResolvedValue(lastEvent);

      await service.completeMatches();

      expect(matchRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: MatchStatus.COMPLETED }),
      );
      expect(completionQueue.add).toHaveBeenCalledWith(
        'complete-match',
        { matchId: match.id },
        expect.objectContaining({ jobId: `complete-${match.id}` }),
      );
    });

    it('leaves IN_PROGRESS alone when last event is still in the future', async () => {
      const match = buildInProgressMatch();
      const lastEvent = {
        id: 'evt-1',
        matchId: match.id,
        minute: 80,
        eventScheduledTime: new Date(Date.now() + 10 * 60 * 1000),
      } as unknown as MatchEventEntity;
      matchRepository.find.mockResolvedValue([match]);
      eventRepository.findOne.mockResolvedValue(lastEvent);

      await service.completeMatches();

      expect(matchRepository.save).not.toHaveBeenCalled();
      expect(completionQueue.add).not.toHaveBeenCalled();
      expect(simulationQueue.add).not.toHaveBeenCalled();
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
  });
});
