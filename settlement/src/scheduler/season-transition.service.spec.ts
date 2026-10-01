import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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
import { cronLockPassThrough } from '../test-utils/cron-lock-mock';

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
  const atDay = (isoDay: string) => new Date(`${isoDay}T12:00:00.000Z`);

  const pinClockTo = (gameStart: Date, now: Date) => {
    jest.useFakeTimers().setSystemTime(now);
    (service as { gameStart: Date }).gameStart = gameStart;
  };

  const mockMatchRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
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
      cronLockPassThrough,
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
    // `clearAllMocks` resets calls but NOT the `mockResolvedValueOnce`
    // queue, so once-values set by one test leak into the next. Tests
    // below use once-chains heavily on `count` and `find`; reset them
    // explicitly and re-seed sane defaults.
    mockMatchRepository.count.mockReset();
    mockMatchRepository.count.mockResolvedValue(0);
    mockMatchRepository.find.mockReset();
    mockMatchRepository.find.mockResolvedValue([]);
    // Default: every matchRepository.update succeeds. Tests that
    // want to assert on the "stamped the latch" path override per-call.
    mockMatchRepository.update.mockResolvedValue({
      affected: 1,
      raw: [],
      generatedMaps: [],
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('checkAndGeneratePlayoffs', () => {
    it('should not trigger playoffs when not in the final week', async () => {
      // 2025-01-29 is week 5 of season 1
      pinClockTo(new Date(GAME_START_ISO), atDay('2025-01-29'));

      await service.checkAndGeneratePlayoffs();

      expect(
        mockPlayoffService.generateAllPlayoffMatches,
      ).not.toHaveBeenCalled();
    });

    it('REGRESSION: does not attempt playoff generation during week 15 itself', async () => {
      // 2025-04-09 is the FIRST day of week 15. The cron fires on
      // Mondays, and `currentSeasonWeek` is anchored so that week N
      // BEGINS on a Monday — so this Monday is the very start of
      // week 15, whose fixtures are played that week (Wed + Sat).
      //
      // The old gate was `week === 15` + "all week-15 matches
      // complete", evaluated on this exact tick. Zero week-15 matches
      // had been played yet, so the completeness check was always
      // false, the cron returned, and by the next Monday the week was
      // already 16 — making the gate unreachable forever. No playoff
      // was ever generated, so positions 9-12 never changed league.
      //
      // Now the gate is `week === 16` (the start of the final week),
      // so during week 15 we must not even query for completeness.
      pinClockTo(new Date(GAME_START_ISO), atDay('2025-04-09'));

      await service.checkAndGeneratePlayoffs();

      expect(mockMatchRepository.count).not.toHaveBeenCalled();
      expect(
        mockPlayoffService.generateAllPlayoffMatches,
      ).not.toHaveBeenCalled();
    });

    it('should not trigger playoffs when the regular season (week 15) is not complete', async () => {
      // 2025-04-16 is week 16 of season 1 — the week after the
      // regular season's last matchday.
      pinClockTo(new Date(GAME_START_ISO), atDay('2025-04-16'));
      mockMatchRepository.count
        .mockResolvedValueOnce(30) // total
        .mockResolvedValueOnce(20); // completed 20/30

      await service.checkAndGeneratePlayoffs();

      expect(
        mockPlayoffService.generateAllPlayoffMatches,
      ).not.toHaveBeenCalled();
    });

    it('should trigger playoffs on the first Monday of the final week', async () => {
      // 2025-04-16 is week 16 of season 1 — by now week 15 is done.
      pinClockTo(new Date(GAME_START_ISO), atDay('2025-04-16'));
      mockMatchRepository.count
        .mockResolvedValueOnce(30) // total for week 15
        .mockResolvedValueOnce(30); // completed 30/30

      mockPlayoffService.generateAllPlayoffMatches.mockResolvedValue([]);

      await service.checkAndGeneratePlayoffs();

      expect(mockPlayoffService.generateAllPlayoffMatches).toHaveBeenCalledWith(
        1,
      );
      // Completeness must be checked against week 15, not week 16 —
      // the final week's own matches have not been played either.
      expect(mockMatchRepository.count).toHaveBeenCalledWith({
        where: { season: 1, week: 15, type: MatchType.LEAGUE },
      });
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

      // Step 0 IS a playoff query: `checkAndProcessSeasonStart`
      // re-invokes `processAfterPlayoffsComplete` so a failed Monday
      // swap retries BEFORE the rest of the ladder commits. It is
      // idempotent via the `playoff_swapped_at` latch, so this is a
      // no-op in the happy path.
      expect(mockMatchRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: MatchType.PLAYOFF,
            playoffSwappedAt: expect.anything(),
          }),
        }),
      );
    });

    // The previous `week === 0` branch is unreachable under the
    // 1-indexed currentSeasonWeek helper (range 1–16) and has
    // been removed. Playoff swap lives in
    // `processPlayoffResultsAndSwap` (week 16), see below.
  });

  describe('processPlayoffResultsAndSwap', () => {
    it('does not run outside week 1', async () => {
      // 2025-01-29 is week 5 of season 1
      pinClockTo(new Date(GAME_START_ISO), atDay('2025-01-29'));

      await service.processPlayoffResultsAndSwap();

      // No playoff-completion probe, no swap.
      expect(mockMatchRepository.count).not.toHaveBeenCalled();
      expect(mockMatchRepository.find).not.toHaveBeenCalled();
      expect(mockPromotionService.swapTeamLeague).not.toHaveBeenCalled();
    });

    it('REGRESSION: does no swap work on week 16 — the playoffs have not been played yet', async () => {
      // Playoffs are GENERATED on the Monday that starts week 16 and
      // PLAYED that Wednesday. The old `week === 16` gate therefore
      // fired before a single playoff had been played, and
      // `areAllPlayoffsCompleted` returned true vacuously (0 playoffs
      // found) so `processAfterPlayoffsComplete` silently no-op'd —
      // positions 9-12 never changed league. The swap must happen on
      // the Monday that starts week 1.
      pinClockTo(new Date(GAME_START_ISO), atDay('2025-04-16')); // week 16

      await service.processPlayoffResultsAndSwap();

      expect(mockMatchRepository.find).not.toHaveBeenCalled();
      expect(mockPromotionService.swapTeamLeague).not.toHaveBeenCalled();
    });

    it('processes un-swapped playoffs for the season that just ended', async () => {
      // 2025-04-23 is week 1 of season 2 — 4 days after the
      // week-16 playoffs were played.
      pinClockTo(new Date(GAME_START_ISO), atDay('2025-04-23'));
      mockMatchRepository.count
        .mockResolvedValueOnce(84) // total playoffs
        .mockResolvedValueOnce(84); // all completed
      mockMatchRepository.find.mockResolvedValue([]);

      await service.processPlayoffResultsAndSwap();

      // The playoffs being swapped belong to season 1, not season 2.
      expect(mockMatchRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ season: 1 }),
        }),
      );
    });

    it('skips when the ended season\'s playoffs are not all complete yet', async () => {
      // 2025-04-23 is week 1 of season 2
      pinClockTo(new Date(GAME_START_ISO), atDay('2025-04-23'));
      // areAllPlayoffsCompleted: total 4, completed 2 → not done
      mockMatchRepository.count
        .mockResolvedValueOnce(4) // total playoffs
        .mockResolvedValueOnce(2); // completed

      await service.processPlayoffResultsAndSwap();

      expect(mockMatchRepository.find).not.toHaveBeenCalled();
      expect(mockPromotionService.swapTeamLeague).not.toHaveBeenCalled();
    });

    it('runs the swap when all playoffs are complete', async () => {
      // 2025-04-23 is week 1 of season 2
      pinClockTo(new Date(GAME_START_ISO), atDay('2025-04-23'));
      // areAllPlayoffsCompleted: 2 total, 2 completed → done
      mockMatchRepository.count
        .mockResolvedValueOnce(2) // total playoffs
        .mockResolvedValueOnce(2); // completed

      // The swap iterates COMPLETED PLAYOFF matches.
      mockMatchRepository.find.mockResolvedValue([]);

      await service.processPlayoffResultsAndSwap();

      // The single PLAYOFF query was issued; with an empty result,
      // no swapTeamLeague calls happen.
      expect(mockMatchRepository.find).toHaveBeenCalledTimes(1);
      expect(mockPromotionService.swapTeamLeague).not.toHaveBeenCalled();
    });

    it('triggers swapTeamLeague when a lower-league team wins a playoff', async () => {
      // 2025-04-23 is week 1 of season 2
      pinClockTo(new Date(GAME_START_ISO), atDay('2025-04-23'));
      mockMatchRepository.count
        .mockResolvedValueOnce(1) // total
        .mockResolvedValueOnce(1); // completed

      const lowerLeague = { id: 'lower-league-id' } as any;
      const homeTeam = { id: 'home-team-id', name: 'Upper FC' } as any;
      const awayTeam = { id: 'away-team-id', name: 'Lower FC' } as any;
      mockMatchRepository.find.mockResolvedValue([
        {
          id: 'playoff-1' as Uuid,
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
      // And the latch is stamped so a re-run is a no-op.
      expect(mockMatchRepository.update).toHaveBeenCalledWith(
        { id: In(['playoff-1']) },
        expect.objectContaining({ playoffSwappedAt: expect.any(Date) }),
      );
    });
  });

  describe('processAfterPlayoffsComplete', () => {
    it('is a no-op when no un-swapped playoff rows exist (idempotent re-run)', async () => {
      // First call already stamped everything; second call sees an
      // empty result. Without the latch this is the path that used
      // to double-swap every promoted/relegated pair.
      mockMatchRepository.find.mockResolvedValue([]);

      await service.processAfterPlayoffsComplete(1);

      expect(mockPromotionService.swapTeamLeague).not.toHaveBeenCalled();
      // No candidates → no latch-stamp either.
      expect(mockMatchRepository.update).not.toHaveBeenCalled();
    });

    it('does not call swapTeamLeague when the home (upper) team won', async () => {
      mockMatchRepository.find.mockResolvedValue([
        {
          id: 'playoff-home-won' as Uuid,
          week: 16,
          type: MatchType.PLAYOFF,
          status: MatchStatus.COMPLETED,
          homeScore: 3,
          awayScore: 1,
          lowerLeagueId: 'lower-league-id' as Uuid,
          homeTeam: { id: 'home-team-id' as Uuid, name: 'Upper FC' } as any,
          awayTeam: { id: 'away-team-id' as Uuid, name: 'Lower FC' } as any,
          league: {
            id: 'upper-league-id' as Uuid,
            name: 'Upper League',
          } as any,
        } as any,
      ]);

      await service.processAfterPlayoffsComplete(1);

      // Upper team won → no swap; the team stays put.
      expect(mockPromotionService.swapTeamLeague).not.toHaveBeenCalled();
      // But the row is still stamped so we don't re-process it
      // on the next cron tick.
      expect(mockMatchRepository.update).toHaveBeenCalledTimes(1);
    });

    it('swaps and stamps when the away (lower) team won', async () => {
      mockMatchRepository.find.mockResolvedValue([
        {
          id: 'playoff-away-won' as Uuid,
          week: 16,
          type: MatchType.PLAYOFF,
          status: MatchStatus.COMPLETED,
          homeScore: 0,
          awayScore: 2,
          lowerLeagueId: 'lower-league-id' as Uuid,
          homeTeam: { id: 'home-team-id' as Uuid, name: 'Upper FC' } as any,
          awayTeam: { id: 'away-team-id' as Uuid, name: 'Lower FC' } as any,
          league: {
            id: 'upper-league-id' as Uuid,
            name: 'Upper League',
          } as any,
        } as any,
      ]);
      mockPromotionService.swapTeamLeague.mockResolvedValue(undefined);

      await service.processAfterPlayoffsComplete(1);

      expect(mockPromotionService.swapTeamLeague).toHaveBeenCalledWith(
        'home-team-id',
        'away-team-id',
        'upper-league-id',
        'lower-league-id',
      );
      expect(mockMatchRepository.update).toHaveBeenCalledTimes(1);
    });

    it('skips rows with no lowerLeagueId (the candidate filter)', async () => {
      // A finished playoff that doesn't carry a lowerLeagueId (e.g.
      // single-tier league, or a cup tie that isn't actually a
      // promotion/relegation match). It still gets the latch stamp
      // so the next tick skips it, but no swap is needed.
      mockMatchRepository.find.mockResolvedValue([
        {
          id: 'playoff-no-lower' as Uuid,
          week: 16,
          type: MatchType.PLAYOFF,
          status: MatchStatus.COMPLETED,
          homeScore: 2,
          awayScore: 1,
          lowerLeagueId: null,
          homeTeam: { id: 'home-team-id' as Uuid, name: 'A' } as any,
          awayTeam: { id: 'away-team-id' as Uuid, name: 'B' } as any,
          league: { id: 'L' as Uuid, name: 'L' } as any,
        } as any,
      ]);

      await service.processAfterPlayoffsComplete(1);

      expect(mockPromotionService.swapTeamLeague).not.toHaveBeenCalled();
      // Still stamped — we processed the row, just nothing moved.
      expect(mockMatchRepository.update).toHaveBeenCalledTimes(1);
    });

    it('batches the latch-stamp into a single update call across many matches', async () => {
      mockMatchRepository.find.mockResolvedValue([
        {
          id: 'p1' as Uuid,
          week: 16,
          type: MatchType.PLAYOFF,
          status: MatchStatus.COMPLETED,
          homeScore: 3,
          awayScore: 0,
          lowerLeagueId: 'lower' as Uuid,
          homeTeam: { id: 'h1' as Uuid } as any,
          awayTeam: { id: 'a1' as Uuid } as any,
          league: { id: 'L' as Uuid } as any,
        } as any,
        {
          id: 'p2' as Uuid,
          week: 16,
          type: MatchType.PLAYOFF,
          status: MatchStatus.COMPLETED,
          homeScore: 0,
          awayScore: 4,
          lowerLeagueId: 'lower' as Uuid,
          homeTeam: { id: 'h2' as Uuid } as any,
          awayTeam: { id: 'a2' as Uuid } as any,
          league: { id: 'L' as Uuid } as any,
        } as any,
      ]);
      mockPromotionService.swapTeamLeague.mockResolvedValue(undefined);

      await service.processAfterPlayoffsComplete(1);

      // One swap (only the away-won row), but a single batched
      // update stamps both rows.
      expect(mockPromotionService.swapTeamLeague).toHaveBeenCalledTimes(1);
      expect(mockMatchRepository.update).toHaveBeenCalledTimes(1);
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
