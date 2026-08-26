import {
  CupBracketSlotEntity,
  MatchEntity,
  MatchEventEntity,
  MatchTacticsEntity,
  MatchTeamStatsEntity,
  MatchType,
  PlayerEntity,
  TacticsPresetEntity,
  TeamEntity,
} from '@goalxi/database';
import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { DataSource } from 'typeorm';
import { CreateMatchReqDto } from './dto/create-match.req.dto';
import { SubmitTacticsReqDto } from './dto/submit-tactics.req.dto';
import { MatchService } from './match.service';

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

  // CupBracketSlotRepository is only touched by `findOne` when
  // `match.type === MatchType.CUP`. Most tests exercise the
  // create / submitTactics / validateTeamOwnership paths which
  // never reach the slot lookup, so the default is `jest.fn()`
  // that returns null. Tests that exercise the cup-match path
  // (see below) override the per-test return value.
  const mockCupSlotRepository = {
    findOne: jest.fn().mockResolvedValue(null),
  };

  const mockDataSource = {
    transaction: jest.fn((callback) =>
      callback({
        save: jest.fn(),
        create: jest.fn((entity, data) => data),
      }),
    ),
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
          provide: getRepositoryToken(CupBracketSlotEntity),
          useValue: mockCupSlotRepository,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: ClsService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
          },
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
          GK: 1001,
          CBL: 1002,
          CB: 1003,
          LB: 1004,
          RB: 1005,
          DMFL: 1006,
          CML: 1007,
          CAML: 1008,
          LW: 1009,
          RW: 1010,
          CF: 1011,
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
        { id: 1001, isGoalkeeper: true },
        { id: 1002, isGoalkeeper: false },
        { id: 1003, isGoalkeeper: false },
        { id: 1004, isGoalkeeper: false },
        { id: 1005, isGoalkeeper: false },
        { id: 1006, isGoalkeeper: false },
        { id: 1007, isGoalkeeper: false },
        { id: 1008, isGoalkeeper: false },
        { id: 1009, isGoalkeeper: false },
        { id: 1010, isGoalkeeper: false },
        { id: 1011, isGoalkeeper: false },
      ]);

      mockTacticsRepository.findOne.mockResolvedValue(null);
      mockTacticsRepository.create.mockReturnValue({
        ...dto,
        id: 'tactics-id',
      });
      mockTacticsRepository.save.mockResolvedValue({
        ...dto,
        id: 'tactics-id',
      });

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

      await expect(service.submitTactics(matchId, teamId, dto)).rejects.toThrow(
        BadRequestException,
      );
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

      await expect(service.submitTactics(matchId, teamId, dto)).rejects.toThrow(
        BadRequestException,
      );
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

      await expect(service.submitTactics(matchId, teamId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should succeed if deadline is in the future', async () => {
      const matchId = 'match-id';
      const teamId = 'team-id';
      const dto: SubmitTacticsReqDto = {
        teamId: 'team-id',
        formation: '4-4-2',
        lineup: {
          GK: 1001,
          CBL: 1002,
          CB: 1003,
          LB: 1004,
          RB: 1005,
          DMFL: 1006,
          CML: 1007,
          CAML: 1008,
          LW: 1009,
          RW: 1010,
          CF: 1011,
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
        { id: 1001, isGoalkeeper: true },
        { id: 1002, isGoalkeeper: false },
        { id: 1003, isGoalkeeper: false },
        { id: 1004, isGoalkeeper: false },
        { id: 1005, isGoalkeeper: false },
        { id: 1006, isGoalkeeper: false },
        { id: 1007, isGoalkeeper: false },
        { id: 1008, isGoalkeeper: false },
        { id: 1009, isGoalkeeper: false },
        { id: 1010, isGoalkeeper: false },
        { id: 1011, isGoalkeeper: false },
      ]);

      mockTacticsRepository.findOne.mockResolvedValue(null);
      mockTacticsRepository.create.mockReturnValue({
        ...dto,
        id: 'tactics-id',
      });
      mockTacticsRepository.save.mockResolvedValue({
        ...dto,
        id: 'tactics-id',
      });

      const result = await service.submitTactics(matchId, teamId, dto);
      expect(result.formation).toBe('4-4-2');
    });
  });

  describe('validateTeamOwnership', () => {
    it('should return true if user owns team', async () => {
      mockTeamRepository.findOne.mockResolvedValue({
        id: 'team-id',
        userId: 'user-id',
      });
      const result = await service.validateTeamOwnership('user-id', 'team-id');
      expect(result).toBe(true);
    });

    it('should throw ForbiddenException if user does not own team', async () => {
      mockTeamRepository.findOne.mockResolvedValue(null);
      await expect(
        service.validateTeamOwnership('user-id', 'team-id'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  /**
   * Source-level tripwire. The `findAll` QueryBuilder
   * MUST `leftJoinAndSelect('match.stadium', 'stadium')`,
   * because `mapToResDto` reads `match.stadium?.name` to
   * produce the FE's `venue` field. Pre-fix, `findAll`
   * only joined `homeTeam` / `awayTeam` / `league` and
   * the dashboard's "next match" card always rendered
   * "TBD" even when `match.stadiumId` was populated by
   * the schedule generator (commit `79ee912`).
   *
   * The behavioural path is covered by the live
   * integration test (`pnpm --filter api test:e2e`
   * with a real DB); the source-level check below
   * pins the contract so a future "let me drop an
   * unused join" simplification doesn't silently
   * bring back the TBD bug.
   */
  describe('source-level: findAll joins match.stadium (venue field)', () => {
    it('findAll QueryBuilder must leftJoinAndSelect match.stadium', () => {
      const fs = require('fs');
      const path = require('path');
      const source = fs.readFileSync(
        path.join(__dirname, 'match.service.ts'),
        'utf8',
      );
      // Strip comments so a docstring explaining the
      // join (e.g. "the FE's venue field is non-null
      // because of this join") doesn't trip the test
      // on its own prose.
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      // Find the `findAll` method body. The simplest
      // marker is the QueryBuilder construction; assert
      // that within ~5 lines of `createQueryBuilder('match')`,
      // a `leftJoinAndSelect('match.stadium'` exists.
      const qbIdx = code.indexOf("createQueryBuilder('match')");
      expect(qbIdx).toBeGreaterThan(-1);
      // Look at the next 1500 chars of code (enough to
      // cover all the joins + filters).
      const slice = code.slice(qbIdx, qbIdx + 1500);
      expect(slice).toMatch(/leftJoinAndSelect\(\s*['"]match\.stadium['"]/);
    });
  });
});
