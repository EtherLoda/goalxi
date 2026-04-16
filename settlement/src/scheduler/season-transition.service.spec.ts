import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SeasonTransitionService } from './season-transition.service';
import { PromotionRelegationService } from './promotion-relegation.service';
import { PlayoffService } from './playoff.service';
import { SeasonSchedulerService } from './season-scheduler.service';
import { LeagueStandingService } from './league-standing.service';
import { SeasonArchiveService } from '../services/season-archive.service';
import {
  MatchEntity,
  MatchStatus,
  MatchType,
  TeamEntity,
  LeagueEntity,
  Uuid,
} from '@goalxi/database';

describe('SeasonTransitionService', () => {
  let service: SeasonTransitionService;
  let matchRepository: jest.Mocked<Repository<MatchEntity>>;
  let promotionService: jest.Mocked<PromotionRelegationService>;
  let playoffService: jest.Mocked<PlayoffService>;
  let seasonSchedulerService: jest.Mocked<SeasonSchedulerService>;
  let leagueStandingService: jest.Mocked<LeagueStandingService>;
  let seasonArchiveService: jest.Mocked<SeasonArchiveService>;

  const mockMatchRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    manager: {
      getRepository: jest.fn().mockReturnValue({
        findOne: jest
          .fn()
          .mockResolvedValue({ id: 'lower-league-id', name: 'Lower League' }),
      }),
    },
  };

  const mockPromotionService = {
    processAllTiers: jest.fn(),
    swapTeamLeague: jest.fn(),
  };

  const mockPlayoffService = {
    generateAllPlayoffMatches: jest.fn(),
  };

  const mockSeasonSchedulerService = {
    generateNextSeasonSchedule: jest.fn(),
  };

  const mockLeagueStandingService = {
    archiveSeasonFinalStandings: jest.fn(),
    initNewSeasonStandings: jest.fn(),
  };

  const mockSeasonArchiveService = {
    archiveSeason: jest.fn().mockResolvedValue({
      season: 1,
      seasonResultCount: 0,
      playerStatsCount: 0,
      transactionCount: 0,
      playerEventCount: 0,
    }),
  };

  const createMockMatch = (
    overrides?: Partial<MatchEntity>,
  ): Partial<MatchEntity> => ({
    id: 'match-id' as Uuid,
    homeTeamId: 'home-team-id' as Uuid,
    awayTeamId: 'away-team-id' as Uuid,
    leagueId: 'league-id' as Uuid,
    season: 1,
    week: 15,
    scheduledAt: new Date(),
    status: MatchStatus.COMPLETED,
    type: MatchType.LEAGUE,
    homeScore: 2,
    awayScore: 1,
    homeTeam: { id: 'home-team-id' as Uuid, name: 'Home Team' } as TeamEntity,
    awayTeam: { id: 'away-team-id' as Uuid, name: 'Away Team' } as TeamEntity,
    league: { id: 'league-id' as Uuid, name: 'Test League' } as LeagueEntity,
    lowerLeagueId: 'lower-league-id' as Uuid,
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeasonTransitionService,
        {
          provide: getRepositoryToken(MatchEntity),
          useValue: mockMatchRepository,
        },
        {
          provide: PromotionRelegationService,
          useValue: mockPromotionService,
        },
        {
          provide: PlayoffService,
          useValue: mockPlayoffService,
        },
        {
          provide: SeasonSchedulerService,
          useValue: mockSeasonSchedulerService,
        },
        {
          provide: LeagueStandingService,
          useValue: mockLeagueStandingService,
        },
        {
          provide: SeasonArchiveService,
          useValue: mockSeasonArchiveService,
        },
      ],
    }).compile();

    service = module.get<SeasonTransitionService>(SeasonTransitionService);
    matchRepository = module.get(getRepositoryToken(MatchEntity));
    promotionService = module.get(PromotionRelegationService);
    playoffService = module.get(PlayoffService);
    seasonSchedulerService = module.get(SeasonSchedulerService);
    leagueStandingService = module.get(LeagueStandingService);
    seasonArchiveService = module.get(SeasonArchiveService);

    jest.clearAllMocks();
  });

  describe('checkAndGeneratePlayoffs', () => {
    it('should not trigger playoffs when not week 15', async () => {
      mockMatchRepository.findOne.mockResolvedValue({
        season: 1,
        week: 10,
      } as MatchEntity);

      await service.checkAndGeneratePlayoffs();

      expect(
        mockPlayoffService.generateAllPlayoffMatches,
      ).not.toHaveBeenCalled();
    });

    it('should not trigger playoffs when week 15 matches are not complete', async () => {
      mockMatchRepository.findOne.mockResolvedValue({
        season: 1,
        week: 15,
      } as MatchEntity);
      mockMatchRepository.count
        .mockResolvedValueOnce(30)
        .mockResolvedValueOnce(20); // Total 30, completed 20

      await service.checkAndGeneratePlayoffs();

      expect(
        mockPlayoffService.generateAllPlayoffMatches,
      ).not.toHaveBeenCalled();
    });

    it('should trigger playoffs when week 15 is complete', async () => {
      mockMatchRepository.findOne.mockResolvedValue({
        season: 1,
        week: 15,
      } as MatchEntity);
      mockMatchRepository.count.mockResolvedValue(30); // All complete

      mockPlayoffService.generateAllPlayoffMatches.mockResolvedValue([]);

      await service.checkAndGeneratePlayoffs();

      expect(mockPlayoffService.generateAllPlayoffMatches).toHaveBeenCalledWith(
        1,
      );
    });
  });

  describe('checkAndProcessSeasonStart', () => {
    it('should not process if not week 0 or week 1', async () => {
      mockMatchRepository.findOne.mockResolvedValue({
        season: 1,
        week: 5,
      } as MatchEntity);

      await service.checkAndProcessSeasonStart();

      expect(mockPromotionService.processAllTiers).not.toHaveBeenCalled();
      expect(
        mockLeagueStandingService.initNewSeasonStandings,
      ).not.toHaveBeenCalled();
    });

    it('should process season transition at week 1', async () => {
      mockMatchRepository.findOne.mockResolvedValue({
        season: 1,
        week: 1,
      } as MatchEntity);

      // Mock empty playoff matches for processAfterPlayoffsComplete
      mockMatchRepository.find.mockResolvedValue([]);

      mockPromotionService.processAllTiers.mockResolvedValue(undefined);
      mockSeasonArchiveService.archiveSeason.mockResolvedValue({
        season: 1,
        seasonResultCount: 16,
        playerStatsCount: 100,
        transactionCount: 200,
        playerEventCount: 50,
      });
      mockLeagueStandingService.initNewSeasonStandings.mockResolvedValue(
        undefined,
      );
      mockSeasonSchedulerService.generateNextSeasonSchedule.mockResolvedValue(
        [],
      );

      await service.checkAndProcessSeasonStart();

      expect(mockPromotionService.processAllTiers).toHaveBeenCalledWith(1);
      expect(mockSeasonArchiveService.archiveSeason).toHaveBeenCalledWith(1);
      expect(
        mockLeagueStandingService.initNewSeasonStandings,
      ).toHaveBeenCalledWith(2);
      expect(
        mockSeasonSchedulerService.generateNextSeasonSchedule,
      ).toHaveBeenCalledWith(1);
    });

    it('should process playoffs at week 0 before season transition', async () => {
      mockMatchRepository.findOne.mockResolvedValue({
        season: 1,
        week: 0,
      } as MatchEntity);

      // Week 16 playoff matches
      mockMatchRepository.find.mockResolvedValue([
        createMockMatch({ week: 16, type: MatchType.PLAYOFF }),
      ] as MatchEntity[]);
      mockMatchRepository.count.mockResolvedValue(2); // Total playoffs
      mockMatchRepository.count.mockResolvedValue(2); // Completed playoffs

      mockPromotionService.processAllTiers.mockResolvedValue(undefined);
      mockPromotionService.swapTeamLeague.mockResolvedValue(undefined);
      mockSeasonArchiveService.archiveSeason.mockResolvedValue({
        season: 1,
        seasonResultCount: 16,
        playerStatsCount: 100,
        transactionCount: 200,
        playerEventCount: 50,
      });
      mockLeagueStandingService.initNewSeasonStandings.mockResolvedValue(
        undefined,
      );
      mockSeasonSchedulerService.generateNextSeasonSchedule.mockResolvedValue(
        [],
      );

      await service.checkAndProcessSeasonStart();

      expect(mockPromotionService.processAllTiers).toHaveBeenCalled();
      expect(mockSeasonArchiveService.archiveSeason).toHaveBeenCalled();
    });
  });

  describe('generatePlayoffs', () => {
    it('should call playoff service to generate matches', async () => {
      mockPlayoffService.generateAllPlayoffMatches.mockResolvedValue([
        createMockMatch({ week: 16, type: MatchType.PLAYOFF }),
      ] as any);

      await service.generatePlayoffs(1);

      expect(mockPlayoffService.generateAllPlayoffMatches).toHaveBeenCalledWith(
        1,
      );
    });
  });

  describe('areAllWeekMatchesCompleted', () => {
    it('should return true when all matches are completed', async () => {
      mockMatchRepository.count
        .mockResolvedValueOnce(30) // total
        .mockResolvedValueOnce(30); // completed

      const result = await (service as any).areAllWeekMatchesCompleted(1, 15);

      expect(result).toBe(true);
    });

    it('should return false when some matches are not completed', async () => {
      mockMatchRepository.count
        .mockResolvedValueOnce(30) // total
        .mockResolvedValueOnce(25); // completed

      const result = await (service as any).areAllWeekMatchesCompleted(1, 15);

      expect(result).toBe(false);
    });

    it('should return false when no matches exist', async () => {
      mockMatchRepository.count.mockResolvedValueOnce(0);

      const result = await (service as any).areAllWeekMatchesCompleted(1, 15);

      expect(result).toBe(false);
    });
  });
});
