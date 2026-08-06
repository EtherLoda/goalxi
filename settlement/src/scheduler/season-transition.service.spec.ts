import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SeasonTransitionService } from './season-transition.service';
import { PromotionRelegationService } from './promotion-relegation.service';
import { PlayoffService } from './playoff.service';
import { SeasonSchedulerService } from './season-scheduler.service';
import { LeagueStandingService } from './league-standing.service';
import { SeasonArchiveService } from '../services/season-archive.service';
import { LOGGER_SERVICE_PROVIDER } from '../test-utils/test-logger';
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

  // Pin both `now` and `gameStart` to a known pair so the
  // shared `currentSeasonWeek(now, gameStart)` helper produces
  // a deterministic (season, week). Tests cover:
  //   gameStart 2025-01-01 00:00 UTC, SEASON_LENGTH_WEEKS = 16
  //   1 game-week = 7 real-days, week is 1-indexed
  //   week 1: 2025-01-01  (weeksElapsed=0)
  //   week 5: 2025-01-29  (weeksElapsed=4)
  //   week 15: 2025-04-09 (weeksElapsed=14)
  //   week 1 of S2: 2025-04-23 (weeksElapsed=16)
  const GAME_START_ISO = '2025-01-01T00:00:00.000Z';

  // UTC noon on the test day — any time within the same
  // date works because `currentSeasonWeek` only cares about
  // the date delta.
  const atDay = (isoDay: string) =>
    new Date(`${isoDay}T12:00:00.000Z`);

  const pinClockTo = (gameStart: Date, now: Date) => {
    jest.useFakeTimers().setSystemTime(now);
    (service as { gameStart: Date }).gameStart = gameStart;
  };

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
    // Default: no env var, service will compute `now` as gameStart
    // for the constructor call. Tests override per-case via pinClockTo.
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeasonTransitionService,
        LOGGER_SERVICE_PROVIDER,
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

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('checkAndGeneratePlayoffs', () => {
    it('should not trigger playoffs when not week 15', async () => {
      // 2025-01-29 is week 5 of season 1
      pinClockTo(new Date(GAME_START_ISO), atDay('2025-01-29'));

      await service.checkAndGeneratePlayoffs();

      expect(
        mockPlayoffService.generateAllPlayoffMatches,
      ).not.toHaveBeenCalled();
    });

    it('should not trigger playoffs when week 15 matches are not complete', async () => {
      // 2025-04-09 is week 15 of season 1
      pinClockTo(new Date(GAME_START_ISO), atDay('2025-04-09'));
      mockMatchRepository.count
        .mockResolvedValueOnce(30) // total
        .mockResolvedValueOnce(20); // completed 20/30

      await service.checkAndGeneratePlayoffs();

      expect(
        mockPlayoffService.generateAllPlayoffMatches,
      ).not.toHaveBeenCalled();
    });

    it('should trigger playoffs when week 15 is complete', async () => {
      // 2025-04-09 is week 15 of season 1
      pinClockTo(new Date(GAME_START_ISO), atDay('2025-04-09'));
      mockMatchRepository.count
        .mockResolvedValueOnce(30) // total
        .mockResolvedValueOnce(30); // completed 30/30

      mockPlayoffService.generateAllPlayoffMatches.mockResolvedValue([]);

      await service.checkAndGeneratePlayoffs();

      expect(mockPlayoffService.generateAllPlayoffMatches).toHaveBeenCalledWith(
        1,
      );
    });
  });

  describe('checkAndProcessSeasonStart', () => {
    it('should not process if not week 1', async () => {
      // 2025-01-29 is week 5 of season 1
      pinClockTo(new Date(GAME_START_ISO), atDay('2025-01-29'));

      await service.checkAndProcessSeasonStart();

      expect(mockPromotionService.processAllTiers).not.toHaveBeenCalled();
      expect(
        mockLeagueStandingService.initNewSeasonStandings,
      ).not.toHaveBeenCalled();
    });

    it('should process season transition at week 1', async () => {
      // 2025-01-01 is week 1 of season 1
      pinClockTo(new Date(GAME_START_ISO), atDay('2025-01-01'));

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

      // The playoff-result swap is no longer invoked from inside
      // checkAndProcessSeasonStart — it's its own cron fired on
      // week 16. So no playoff match query is needed here.
      expect(mockMatchRepository.find).not.toHaveBeenCalled();
    });

    // The previous `week === 0` branch is unreachable under the
    // 1-indexed currentSeasonWeek helper (range 1–16) and has
    // been removed. Playoff swap lives in
    // `processPlayoffResultsAndSwap` (week 16), see below.
  });

  describe('processPlayoffResultsAndSwap', () => {
    it('does not run outside week 16', async () => {
      // 2025-01-29 is week 5 of season 1
      pinClockTo(new Date(GAME_START_ISO), atDay('2025-01-29'));

      await service.processPlayoffResultsAndSwap();

      // No playoff-completion probe, no swap.
      expect(mockMatchRepository.count).not.toHaveBeenCalled();
      expect(mockMatchRepository.find).not.toHaveBeenCalled();
      expect(
        mockPromotionService.swapTeamLeague,
      ).not.toHaveBeenCalled();
    });

    it('skips when week 16 playoffs are not all complete yet', async () => {
      // 2025-04-16 is week 16 of season 1
      pinClockTo(new Date(GAME_START_ISO), atDay('2025-04-16'));
      // areAllPlayoffsCompleted: total 4, completed 2 → not done
      mockMatchRepository.count
        .mockResolvedValueOnce(4) // total playoffs
        .mockResolvedValueOnce(2); // completed

      await service.processPlayoffResultsAndSwap();

      expect(mockMatchRepository.find).not.toHaveBeenCalled();
      expect(
        mockPromotionService.swapTeamLeague,
      ).not.toHaveBeenCalled();
    });

    it('runs the swap when all week 16 playoffs are complete', async () => {
      // 2025-04-16 is week 16 of season 1
      pinClockTo(new Date(GAME_START_ISO), atDay('2025-04-16'));
      // areAllPlayoffsCompleted: 2 total, 2 completed → done
      mockMatchRepository.count
        .mockResolvedValueOnce(2) // total playoffs
        .mockResolvedValueOnce(2); // completed

      // The swap iterates week 16 PLAYOFF COMPLETED matches.
      mockMatchRepository.find.mockResolvedValue([]);

      await service.processPlayoffResultsAndSwap();

      // The single PLAYOFF query was issued; with an empty result,
      // no swapTeamLeague calls happen.
      expect(mockMatchRepository.find).toHaveBeenCalledTimes(1);
      expect(
        mockPromotionService.swapTeamLeague,
      ).not.toHaveBeenCalled();
    });

    it('triggers swapTeamLeague when a lower-league team wins a week-16 playoff', async () => {
      // 2025-04-16 is week 16 of season 1
      pinClockTo(new Date(GAME_START_ISO), atDay('2025-04-16'));
      mockMatchRepository.count
        .mockResolvedValueOnce(1) // total
        .mockResolvedValueOnce(1); // completed

      const lowerLeague = { id: 'lower-league-id' } as any;
      const homeTeam = { id: 'home-team-id', name: 'Upper FC' } as any;
      const awayTeam = { id: 'away-team-id', name: 'Lower FC' } as any;
      mockMatchRepository.find.mockResolvedValue([
        {
          week: 16,
          type: MatchType.PLAYOFF,
          status: MatchStatus.COMPLETED,
          homeScore: 0,
          awayScore: 2,
          lowerLeagueId: lowerLeague.id,
          homeTeam,
          awayTeam,
          league: { id: 'upper-league-id', name: 'Upper League' },
        } as any,
      ]);
      mockPromotionService.swapTeamLeague.mockResolvedValue(undefined);

      await service.processPlayoffResultsAndSwap();

      // The lower team won → the swap fires.
      expect(mockPromotionService.swapTeamLeague).toHaveBeenCalledWith(
        homeTeam.id,
        awayTeam.id,
        'upper-league-id',
        lowerLeague.id,
      );
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
