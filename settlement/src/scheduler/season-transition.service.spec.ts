import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SeasonTransitionService } from './season-transition.service';
import { PromotionRelegationService } from './promotion-relegation.service';
import { PlayoffService } from './playoff.service';
import { SeasonSchedulerService } from './season-scheduler.service';
import { LeagueStandingService } from './league-standing.service';
import {
  MatchEntity,
  MatchStatus,
  MatchType,
  TeamEntity,
  LeagueEntity,
} from '@goalxi/database';

describe('SeasonTransitionService', () => {
  let service: SeasonTransitionService;
  let matchRepository: jest.Mocked<Repository<MatchEntity>>;
  let promotionService: jest.Mocked<PromotionRelegationService>;
  let playoffService: jest.Mocked<PlayoffService>;
  let seasonSchedulerService: jest.Mocked<SeasonSchedulerService>;
  let leagueStandingService: jest.Mocked<LeagueStandingService>;

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

  const createMockMatch = (
    overrides?: Partial<MatchEntity>,
  ): Partial<MatchEntity> => ({
    id: 'match-id',
    homeTeamId: 'home-team-id',
    awayTeamId: 'away-team-id',
    leagueId: 'league-id',
    season: 1,
    week: 15,
    scheduledAt: new Date(),
    status: MatchStatus.COMPLETED,
    type: MatchType.LEAGUE,
    homeScore: 2,
    awayScore: 1,
    homeTeam: { id: 'home-team-id', name: 'Home Team' } as TeamEntity,
    awayTeam: { id: 'away-team-id', name: 'Away Team' } as TeamEntity,
    league: { id: 'league-id', name: 'Test League' } as LeagueEntity,
    lowerLeagueId: 'lower-league-id',
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
      ],
    }).compile();

    service = module.get<SeasonTransitionService>(SeasonTransitionService);
    matchRepository = module.get(getRepositoryToken(MatchEntity));
    promotionService = module.get(PromotionRelegationService);
    playoffService = module.get(PlayoffService);
    seasonSchedulerService = module.get(SeasonSchedulerService);
    leagueStandingService = module.get(LeagueStandingService);

    jest.clearAllMocks();
  });

  describe('checkSeasonTransition', () => {
    it('should not trigger transition when not week 15', async () => {
      mockMatchRepository.findOne.mockResolvedValue({
        season: 1,
        week: 10,
      } as MatchEntity);

      await service.checkSeasonTransition();

      expect(
        mockPlayoffService.generateAllPlayoffMatches,
      ).not.toHaveBeenCalled();
    });

    it('should not trigger transition when week 15 matches are not complete', async () => {
      mockMatchRepository.findOne.mockResolvedValue({
        season: 1,
        week: 15,
      } as MatchEntity);
      mockMatchRepository.count
        .mockResolvedValueOnce(30)
        .mockResolvedValueOnce(20); // Total 30, completed 20

      await service.checkSeasonTransition();

      expect(
        mockPlayoffService.generateAllPlayoffMatches,
      ).not.toHaveBeenCalled();
    });

    it('should trigger transition when week 15 is complete', async () => {
      mockMatchRepository.findOne.mockResolvedValue({
        season: 1,
        week: 15,
      } as MatchEntity);
      mockMatchRepository.count.mockResolvedValue(30); // All complete

      mockPlayoffService.generateAllPlayoffMatches.mockResolvedValue([]);

      await service.checkSeasonTransition();

      expect(mockPlayoffService.generateAllPlayoffMatches).toHaveBeenCalledWith(
        1,
      );
    });
  });

  describe('executeSeasonTransition', () => {
    it('should generate playoff matches', async () => {
      mockPlayoffService.generateAllPlayoffMatches.mockResolvedValue([
        createMockMatch({ week: 16, type: MatchType.PLAYOFF }),
      ]);

      await service.executeSeasonTransition(1);

      expect(mockPlayoffService.generateAllPlayoffMatches).toHaveBeenCalledWith(
        1,
      );
    });

    it('should set transitioning flag to prevent re-entry', async () => {
      mockPlayoffService.generateAllPlayoffMatches.mockResolvedValue([]);

      // First call should succeed
      await service.executeSeasonTransition(1);

      // Second call should be skipped
      await service.executeSeasonTransition(1);

      // Should only be called once
      expect(
        mockPlayoffService.generateAllPlayoffMatches,
      ).toHaveBeenCalledTimes(1);
    });
  });

  describe('processAfterPlayoffsComplete', () => {
    it('should process playoff results and execute promotions/relegations', async () => {
      // Set transitioning flag to true (simulating executeSeasonTransition was called)
      (service as any).isTransitioning = true;

      // Setup playoff matches
      const playoffMatch = createMockMatch({
        week: 16,
        type: MatchType.PLAYOFF,
        status: MatchStatus.COMPLETED,
        homeScore: 1,
        awayScore: 2, // Away team wins (lower league team)
        lowerLeagueId: 'lower-league-id',
      });

      mockMatchRepository.find.mockResolvedValue([
        playoffMatch,
      ] as MatchEntity[]);

      mockPromotionService.swapTeamLeague.mockResolvedValue(undefined);
      mockPromotionService.processAllTiers.mockResolvedValue(undefined);
      mockLeagueStandingService.archiveSeasonFinalStandings.mockResolvedValue(
        undefined,
      );
      mockSeasonSchedulerService.generateNextSeasonSchedule.mockResolvedValue(
        [],
      );
      mockLeagueStandingService.initNewSeasonStandings.mockResolvedValue(
        undefined,
      );

      await service.processAfterPlayoffsComplete(1);

      // Should process playoff results
      expect(mockPromotionService.swapTeamLeague).toHaveBeenCalled();

      // Should archive standings
      expect(
        mockLeagueStandingService.archiveSeasonFinalStandings,
      ).toHaveBeenCalledWith(1);

      // Should generate next season schedule
      expect(
        mockSeasonSchedulerService.generateNextSeasonSchedule,
      ).toHaveBeenCalledWith(1);

      // Should init new season standings
      expect(
        mockLeagueStandingService.initNewSeasonStandings,
      ).toHaveBeenCalledWith(2);
    });

    it('should not process if not in transitioning state', async () => {
      // Reset the transitioning flag by accessing private property
      (service as any).isTransitioning = false;

      await service.processAfterPlayoffsComplete(1);

      expect(mockPromotionService.swapTeamLeague).not.toHaveBeenCalled();
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
