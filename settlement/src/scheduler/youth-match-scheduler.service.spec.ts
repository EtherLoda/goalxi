import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { YouthMatchSchedulerService } from './youth-match-scheduler.service';
import { LOGGER_SERVICE } from '@goalxi/logger';
import {
  YouthMatchEntity,
  YouthMatchStatus,
  YouthMatchTacticsEntity,
  YouthMatchEventEntity,
} from '@goalxi/database';

describe('YouthMatchSchedulerService', () => {
  let service: YouthMatchSchedulerService;
  let matchRepository: jest.Mocked<Repository<YouthMatchEntity>>;
  let tacticsRepository: jest.Mocked<Repository<YouthMatchTacticsEntity>>;
  let simulationQueue: { add: jest.Mock };

  const mockMatchRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockTacticsRepository = {
    findOne: jest.fn(),
  };

  const mockEventRepository = {
    findOne: jest.fn(),
  };

  const mockSimulationQueue = {
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
        YouthMatchSchedulerService,
        {
          provide: LOGGER_SERVICE,
          useValue: mockLogger,
        },
        {
          provide: 'BullQueue_youth-match-simulation',
          useValue: mockSimulationQueue,
        },
        {
          provide: getRepositoryToken(YouthMatchEntity),
          useValue: mockMatchRepository,
        },
        {
          provide: getRepositoryToken(YouthMatchTacticsEntity),
          useValue: mockTacticsRepository,
        },
        {
          provide: getRepositoryToken(YouthMatchEventEntity),
          useValue: mockEventRepository,
        },
      ],
    }).compile();

    service = module.get<YouthMatchSchedulerService>(
      YouthMatchSchedulerService,
    );
    matchRepository = module.get(getRepositoryToken(YouthMatchEntity));
    tacticsRepository = module.get(getRepositoryToken(YouthMatchTacticsEntity));
    simulationQueue = module.get('BullQueue_youth-match-simulation');

    jest.clearAllMocks();
  });

  describe('completeMatches — stuck match recovery', () => {
    const buildInProgressMatch = (
      overrides: Partial<YouthMatchEntity> = {},
    ) => {
      const now = Date.now();
      return {
        id: 'youth-match-stuck',
        homeYouthTeamId: 'youth-home',
        awayYouthTeamId: 'youth-away',
        homeYouthTeam: { name: 'Home' } as any,
        awayYouthTeam: { name: 'Away' } as any,
        homeScore: 0,
        awayScore: 0,
        homeForfeit: false,
        awayForfeit: false,
        status: YouthMatchStatus.IN_PROGRESS,
        // Default: 40 min ago — past the 30-min STUCK threshold.
        scheduledAt: new Date(now - 40 * 60 * 1000),
        simulationCompletedAt: null,
        actualEndTime: null,
        ...overrides,
      } as unknown as YouthMatchEntity;
    };

    it('re-enqueues simulation when IN_PROGRESS match is missing simulationCompletedAt and scheduledAt > 30min in past', async () => {
      const match = buildInProgressMatch();
      matchRepository.find.mockResolvedValue([match]);
      // Recovery helper re-reads the match + tactics to rebuild payload.
      matchRepository.findOne.mockResolvedValue(match);
      tacticsRepository.findOne.mockResolvedValue(null);
      simulationQueue.add.mockResolvedValue({ id: 'job-recover' });

      await service.completeMatches();

      const recoverCalls = simulationQueue.add.mock.calls.filter(
        (call) =>
          typeof (call[2] as { jobId?: string })?.jobId === 'string' &&
          (call[2] as { jobId?: string }).jobId!.startsWith(
            'recover-youth-match-stuck-',
          ),
      );
      expect(recoverCalls.length).toBe(1);
      expect(recoverCalls[0][0]).toBe('simulate-youth-match');
      expect(recoverCalls[0][1]).toMatchObject({ youthMatchId: match.id });
      // forfeit flags must be carried — same correctness concern as adult.
      expect(recoverCalls[0][1]).toMatchObject({
        homeForfeit: match.homeForfeit,
        awayForfeit: match.awayForfeit,
      });
      // Must NOT mark COMPLETED.
      expect(matchRepository.save).not.toHaveBeenCalled();
    });

    it('does NOT re-enqueue when IN_PROGRESS match is recent (< 30min)', async () => {
      const match = buildInProgressMatch({
        scheduledAt: new Date(Date.now() - 5 * 60 * 1000),
      });
      matchRepository.find.mockResolvedValue([match]);

      await service.completeMatches();

      expect(simulationQueue.add).not.toHaveBeenCalled();
    });

    it('marks COMPLETED when actualEndTime is in the past (existing behavior)', async () => {
      const match = buildInProgressMatch({
        scheduledAt: new Date(Date.now() - 60 * 60 * 1000),
        simulationCompletedAt: new Date(Date.now() - 10 * 60 * 1000),
        actualEndTime: new Date(Date.now() - 10 * 60 * 1000),
      });
      matchRepository.find.mockResolvedValue([match]);

      await service.completeMatches();

      expect(matchRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: YouthMatchStatus.COMPLETED }),
      );
    });
  });

  describe('preprocessMatch — stuck TACTICS_LOCKED recovery', () => {
    it('re-enqueues simulation for TACTICS_LOCKED matches whose scheduledAt is past', async () => {
      const now = Date.now();
      const stuckLockedMatch = {
        id: 'youth-match-stuck-locked',
        homeYouthTeamId: 'youth-home',
        awayYouthTeamId: 'youth-away',
        homeYouthTeam: { name: 'Home' } as any,
        awayYouthTeam: { name: 'Away' } as any,
        homeForfeit: false,
        awayForfeit: false,
        status: YouthMatchStatus.TACTICS_LOCKED,
        scheduledAt: new Date(now - 10 * 60 * 1000),
        tacticsLocked: true,
        tacticsLockedAt: new Date(now - 15 * 60 * 1000),
      } as unknown as YouthMatchEntity;

      // First find() = regular preprocess (nothing), second find() = recovery.
      // Use mockImplementation with a state counter so leftover queue from
      // sibling tests doesn't leak across beforeEach resets.
      let findCall = 0;
      matchRepository.find.mockImplementation(async () => {
        findCall += 1;
        return findCall === 1 ? [] : [stuckLockedMatch];
      });
      matchRepository.findOne.mockResolvedValue(stuckLockedMatch);
      tacticsRepository.findOne.mockResolvedValue(null);
      simulationQueue.add.mockResolvedValue({ id: 'job-recover' });

      await service.preprocessMatch();

      const recoverCalls = simulationQueue.add.mock.calls.filter(
        (call) =>
          typeof (call[2] as { jobId?: string })?.jobId === 'string' &&
          (call[2] as { jobId?: string }).jobId!.startsWith(
            'recover-youth-match-stuck-locked-',
          ),
      );
      expect(recoverCalls.length).toBe(1);
      expect(recoverCalls[0][0]).toBe('simulate-youth-match');
      expect(recoverCalls[0][1]).toMatchObject({
        youthMatchId: stuckLockedMatch.id,
      });
    });

    it('does NOT touch TACTICS_LOCKED matches scheduled in the future', async () => {
      matchRepository.find.mockResolvedValue([]);

      await service.preprocessMatch();

      expect(simulationQueue.add).not.toHaveBeenCalled();
    });
  });
});
