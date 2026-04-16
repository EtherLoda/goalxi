import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { MatchSchedulerService } from './match-scheduler.service';
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchSchedulerService,
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
});
