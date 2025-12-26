import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { DataSource } from 'typeorm';
import {
  MatchEntity,
  MatchStatus,
  MatchTacticsEntity,
  TacticsPresetEntity,
  TeamEntity,
  PlayerEntity,
  MatchType,
  MatchEventEntity,
  MatchTeamStatsEntity,
} from '@goalxi/database';
import { MatchService } from './match.service';
import { CreateMatchReqDto } from './dto/create-match.req.dto';
import { SubmitTacticsReqDto } from './dto/submit-tactics.req.dto';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';

describe('MatchService', () => {
  let service: MatchService;

  const mockMatchRepository = {
    createQueryBuilder: jest.fn(() => ({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    })),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };

  const mockTacticsRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockPresetRepository = {
    findOne: jest.fn(),
  };

  const mockTeamRepository = {
    findOne: jest.fn(),
  };

  const mockPlayerRepository = {
    find: jest.fn(),
  };

  const mockEventRepository = {
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockStatsRepository = {
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockDataSource = {
    transaction: jest.fn((callback) => callback({
      save: jest.fn(),
      create: jest.fn((entity, data) => data),
    })),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchService,
        {
          provide: getRepositoryToken(MatchEntity),
          useValue: mockMatchRepository,
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
          provide: getRepositoryToken(TeamEntity),
          useValue: mockTeamRepository,
        },
        {
          provide: getRepositoryToken(PlayerEntity),
          useValue: mockPlayerRepository,
        },
        {
          provide: getRepositoryToken(MatchEventEntity),
          useValue: mockEventRepository,
        },
        {
          provide: getRepositoryToken(MatchTeamStatsEntity),
          useValue: mockStatsRepository,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: 'CACHE_MANAGER',
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
          },
        },
        {
          provide: getQueueToken('match-simulation'),
          useValue: {
            add: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MatchService>(MatchService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a match', async () => {
      const dto: CreateMatchReqDto = {
        leagueId: 'league-id',
        season: 1,
        week: 1,
        homeTeamId: 'home-id',
        awayTeamId: 'away-id',
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        type: MatchType.LEAGUE,
      };

      mockTeamRepository.findOne.mockResolvedValue({ id: 'team-id' });
      mockMatchRepository.create.mockReturnValue({ ...dto, id: 'match-id' });
      mockMatchRepository.save.mockResolvedValue({ ...dto, id: 'match-id' });
      mockMatchRepository.findOne.mockResolvedValue({
        ...dto,
        id: 'match-id',
        homeTeam: { id: 'home-id', name: 'Home' },
        awayTeam: { id: 'away-id', name: 'Away' },
      });

      const result = await service.create(dto);
      expect(result.id).toBe('match-id');
    });

    it('should fail if teams are same', async () => {
      const dto: CreateMatchReqDto = {
        leagueId: 'league-id',
        season: 1,
        week: 1,
        homeTeamId: 'same-id',
        awayTeamId: 'same-id',
        scheduledAt: new Date().toISOString(),
      };

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('submitTactics', () => {
    it('should submit tactics', async () => {
      const matchId = 'match-id';
      const teamId = 'team-id';
      const dto: SubmitTacticsReqDto = {
        teamId: 'team-id',
        formation: '4-4-2',
        lineup: {
          GK: 'gk-id',
          CB1: 'cb1-id',
          CB2: 'cb2-id',
          LB: 'lb-id',
          RB: 'rb-id',
          DMF1: 'dmf1-id',
          CM1: 'cm1-id',
          CAM1: 'cam1-id',
          LW: 'lw-id',
          RW: 'rw-id',
          ST1: 'st1-id',
        },
      };

      mockMatchRepository.findOne.mockResolvedValue({
        id: matchId,
        homeTeamId: teamId,
        awayTeamId: 'other-id',
        scheduledAt: new Date(Date.now() + 86400000), // Future
        tacticsLocked: false, // Tactics not locked yet
      });

      mockPlayerRepository.find.mockResolvedValue([
        { id: 'gk-id' }, { id: 'cb1-id' }, { id: 'cb2-id' }, { id: 'lb-id' }, { id: 'rb-id' },
        { id: 'dmf1-id' }, { id: 'cm1-id' }, { id: 'cam1-id' }, { id: 'lw-id' }, { id: 'rw-id' }, { id: 'st1-id' },
      ]);

      mockTacticsRepository.findOne.mockResolvedValue(null);
      mockTacticsRepository.create.mockReturnValue({ ...dto, id: 'tactics-id' });
      mockTacticsRepository.save.mockResolvedValue({ ...dto, id: 'tactics-id' });

      const result = await service.submitTactics(matchId, teamId, dto);
      expect(result.formation).toBe('4-4-2');
    });

    it('should fail if deadline passed', async () => {
      const matchId = 'match-id';
      const teamId = 'team-id';
      const dto: SubmitTacticsReqDto = {
        teamId: 'team-id',
        formation: '4-4-2',
        lineup: {},
      };

      mockMatchRepository.findOne.mockResolvedValue({
        id: matchId,
        homeTeamId: teamId,
        scheduledAt: new Date(Date.now() - 1000), // Past (deadline passed)
        tacticsLocked: false,
      });

      await expect(service.submitTactics(matchId, teamId, dto)).rejects.toThrow(BadRequestException);
    });

    it('should fail if tactics are locked', async () => {
      const matchId = 'match-id';
      const teamId = 'team-id';
      const dto: SubmitTacticsReqDto = {
        teamId: 'team-id',
        formation: '4-4-2',
        lineup: {},
      };

      mockMatchRepository.findOne.mockResolvedValue({
        id: matchId,
        homeTeamId: teamId,
        scheduledAt: new Date(Date.now() + 86400000), // Future
        tacticsLocked: true, // Tactics already locked
      });

      await expect(service.submitTactics(matchId, teamId, dto)).rejects.toThrow(BadRequestException);
    });

    it('should fail if deadline is exactly at current time', async () => {
      const matchId = 'match-id';
      const teamId = 'team-id';
      const dto: SubmitTacticsReqDto = {
        teamId: 'team-id',
        formation: '4-4-2',
        lineup: {},
      };

      // Set scheduledAt to exactly 30 minutes from now (deadline is now)
      const scheduledAt = new Date(Date.now() + 30 * 60 * 1000);
      mockMatchRepository.findOne.mockResolvedValue({
        id: matchId,
        homeTeamId: teamId,
        scheduledAt,
        tacticsLocked: false,
      });

      await expect(service.submitTactics(matchId, teamId, dto)).rejects.toThrow(BadRequestException);
    });

    it('should succeed if deadline is in the future', async () => {
      const matchId = 'match-id';
      const teamId = 'team-id';
      const dto: SubmitTacticsReqDto = {
        teamId: 'team-id',
        formation: '4-4-2',
        lineup: {
          GK: 'gk-id',
          CB1: 'cb1-id',
          CB2: 'cb2-id',
          LB: 'lb-id',
          RB: 'rb-id',
          DMF1: 'dmf1-id',
          CM1: 'cm1-id',
          CAM1: 'cam1-id',
          LW: 'lw-id',
          RW: 'rw-id',
          ST1: 'st1-id',
        },
      };

      // Set scheduledAt to 31 minutes from now (deadline is 1 minute from now)
      const scheduledAt = new Date(Date.now() + 31 * 60 * 1000);
      mockMatchRepository.findOne.mockResolvedValue({
        id: matchId,
        homeTeamId: teamId,
        awayTeamId: 'other-id',
        scheduledAt,
        tacticsLocked: false,
      });

      mockPlayerRepository.find.mockResolvedValue([
        { id: 'gk-id' }, { id: 'cb1-id' }, { id: 'cb2-id' }, { id: 'lb-id' }, { id: 'rb-id' },
        { id: 'dmf1-id' }, { id: 'cm1-id' }, { id: 'cam1-id' }, { id: 'lw-id' }, { id: 'rw-id' }, { id: 'st1-id' },
      ]);

      mockTacticsRepository.findOne.mockResolvedValue(null);
      mockTacticsRepository.create.mockReturnValue({ ...dto, id: 'tactics-id' });
      mockTacticsRepository.save.mockResolvedValue({ ...dto, id: 'tactics-id' });

      const result = await service.submitTactics(matchId, teamId, dto);
      expect(result.formation).toBe('4-4-2');
    });
  });

  describe('validateTeamOwnership', () => {
    it('should return true if user owns team', async () => {
      mockTeamRepository.findOne.mockResolvedValue({ id: 'team-id', userId: 'user-id' });
      const result = await service.validateTeamOwnership('user-id', 'team-id');
      expect(result).toBe(true);
    });

    it('should throw ForbiddenException if user does not own team', async () => {
      mockTeamRepository.findOne.mockResolvedValue(null);
      await expect(service.validateTeamOwnership('user-id', 'team-id')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
