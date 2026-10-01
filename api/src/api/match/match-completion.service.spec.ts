import {
  FanEntity,
  InjuryEntity,
  LeagueStandingEntity,
  MatchEntity,
  MatchEventEntity,
  MatchStatus,
  MatchTacticsEntity,
  PlayerEntity,
  StadiumEntity,
  TeamEntity,
} from '@goalxi/database';
import { LOGGER_SERVICE } from '@goalxi/logger';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FanService } from '../fan/fan.service';
import { FinanceService } from '../finance/finance.service';
import { MatchCacheService } from './match-cache.service';
import { MatchCompletionService } from './match-completion.service';

/**
 * Regression specs for the data-flow review that landed the
 * type-guard + position-recalc fixes in
 * `MatchCompletionService.updateLeagueStandings`.
 *
 * Two bugs were uncovered in the deep review:
 *
 *   1. Every match type triggered a `league_standing` upsert,
 *      including cup / youth / friendly / national-team matches
 *      whose `match.leagueId` is null. The result was a phantom
 *      `league_standing` row with `leagueId = null` per team
 *      per non-league match, polluting the table.
 *
 *   2. `league_standing.position` was never written. The
 *      `getStandings` endpoint recomputes it in memory so the
 *      FE looked correct, but the season-archive service
 *      (`archiveSeasonFinalStandings`) reads the column
 *      directly when stamping `SeasonResult.finalPosition`,
 *      so every team's final position was 0.
 *
 * The fixes live in `updateLeagueStandings`:
 *
 *   - early-return when `match.leagueId` is null (skips the
 *     standing upsert + the position recalc for non-league
 *     matches)
 *   - after the standing upsert, call the new private
 *     `recalculateLeaguePositions` which renumbers every
 *     team in the league in a single bulk save
 *
 * These specs assert both behaviors at the unit level via
 * `(service as any)` to reach the private methods. The
 * `completeMatch` orchestrator has many more dependencies
 * (finance, fan, ELO, recovery, ...) and is tested end-to-end
 * by the simulator + scheduler integration in
 * `api/test/match-automation.e2e-spec.ts`.
 */
describe('MatchCompletionService data-flow review', () => {
  let service: MatchCompletionService;
  let standingRepository: jest.Mocked<Repository<LeagueStandingEntity>>;
  let matchRepository: jest.Mocked<Repository<MatchEntity>>;
  let eventRepository: jest.Mocked<Repository<MatchEventEntity>>;
  let tacticsRepository: jest.Mocked<Repository<MatchTacticsEntity>>;
  let playerRepository: jest.Mocked<Repository<PlayerEntity>>;
  let teamRepository: jest.Mocked<Repository<TeamEntity>>;
  let stadiumRepository: jest.Mocked<Repository<StadiumEntity>>;
  let fanRepository: jest.Mocked<Repository<FanEntity>>;
  let injuryRepository: jest.Mocked<Repository<InjuryEntity>>;
  let cacheService: jest.Mocked<MatchCacheService>;
  let financeService: jest.Mocked<FinanceService>;
  let fanService: jest.Mocked<FanService>;
  // `updateEloRatings` re-reads both team rows under a write lock inside
  // the transaction rather than trusting the relation hydrated at the top
  // of `completeMatch`, so the fake manager needs a team repo too.
  let mockTeamRepo: { findOne: jest.Mock; update: jest.Mock };
  let dataSource: {
    transaction: jest.Mock;
    createQueryBuilder: jest.Mock;
    _txManager: { getRepository: jest.Mock; createQueryBuilder: jest.Mock };
    _txUpdateChain: Record<string, jest.Mock>;
  };

  beforeEach(async () => {
    // `updateLeagueStandings` now runs inside
    // `dataSource.transaction(...)` with `pessimistic_write` row locks —
    // the old `findOne -> mutate -> save` with no transaction was a lost
    // update whenever two matches for the same team completed
    // concurrently (double matchweeks are explicitly supported).
    //
    // `updateEloRatings` re-reads both team rows under a write lock too,
    // rather than trusting the relation hydrated once at the top of
    // `completeMatch` — same lost-update class.
    mockTeamRepo = { findOne: jest.fn(), update: jest.fn() };
    //
    // The fake manager hands back the same repo mocks the DI tokens
    // provide, and `createQueryBuilder` is shared so tests can drive the
    // position-recacl and the column-scoped UPDATE.
    const mockStandingRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    // Mirrors `manager.createQueryBuilder().update(Entity).set(...).where(...)`.
    const txUpdateChain = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const txManager = {
      getRepository: jest.fn().mockImplementation((entity: any) => {
        if (entity?.name === 'LeagueStandingEntity') return mockStandingRepo;
        if (entity?.name === 'TeamEntity') return mockTeamRepo;
        return { find: jest.fn(), findOne: jest.fn(), save: jest.fn() };
      }),
      createQueryBuilder: jest.fn().mockReturnValue(txUpdateChain),
    };
    dataSource = {
      transaction: jest.fn(async (cb: any) => cb(txManager)),
      createQueryBuilder: jest.fn().mockReturnValue(txUpdateChain),
      _txManager: txManager,
      _txUpdateChain: txUpdateChain,
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        MatchCompletionService,
        {
          // LOGGER_SERVICE - silence everything in the test
          // runner; the spec only asserts side effects on the
          // repos, not log lines.
          provide: LOGGER_SERVICE,
          useValue: {
            log: jest.fn(),
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            child: jest.fn().mockReturnThis(),
          },
        },
        {
          provide: getRepositoryToken(MatchEntity),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            // `completeMatch` stamps the durable settlement receipt
            // (`settledAt`) with a targeted update rather than an
            // entity save, so the mock needs it.
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(LeagueStandingEntity),
          useValue: mockStandingRepo,
        },
        {
          provide: getDataSourceToken(),
          useValue: dataSource,
        },
        {
          provide: getRepositoryToken(PlayerEntity),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
            increment: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(MatchEventEntity),
          useValue: { find: jest.fn() },
        },
        {
          provide: getRepositoryToken(MatchTacticsEntity),
          useValue: { find: jest.fn() },
        },
        {
          provide: getRepositoryToken(TeamEntity),
          useValue: { findOne: jest.fn(), update: jest.fn() },
        },
        {
          provide: getRepositoryToken(StadiumEntity),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(FanEntity),
          useValue: { findOne: jest.fn(), find: jest.fn() },
        },
        {
          provide: getRepositoryToken(InjuryEntity),
          useValue: { find: jest.fn(), save: jest.fn() },
        },
        {
          provide: MatchCacheService,
          useValue: {
            isMatchProcessed: jest.fn().mockResolvedValue(false),
            setMatchProcessed: jest.fn().mockResolvedValue(undefined),
            invalidateMatchCache: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: FinanceService,
          useValue: {
            processTransaction: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: FanService,
          useValue: {
            updateAfterMatch: jest.fn().mockResolvedValue(undefined),
            getExpectedPoints: jest.fn().mockReturnValue(1.0),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(MatchCompletionService);
    standingRepository = moduleRef.get(
      getRepositoryToken(LeagueStandingEntity),
    );
    matchRepository = moduleRef.get(getRepositoryToken(MatchEntity));
    eventRepository = moduleRef.get(getRepositoryToken(MatchEventEntity));
    tacticsRepository = moduleRef.get(getRepositoryToken(MatchTacticsEntity));
    playerRepository = moduleRef.get(getRepositoryToken(PlayerEntity));
    teamRepository = moduleRef.get(getRepositoryToken(TeamEntity));
    stadiumRepository = moduleRef.get(getRepositoryToken(StadiumEntity));
    fanRepository = moduleRef.get(getRepositoryToken(FanEntity));
    injuryRepository = moduleRef.get(getRepositoryToken(InjuryEntity));
    cacheService = moduleRef.get(MatchCacheService);
    financeService = moduleRef.get(FinanceService);
    fanService = moduleRef.get(FanService);
  });

  const makeStanding = (over: Partial<LeagueStandingEntity> = {}) =>
    ({
      id: 'standing-uuid',
      leagueId: 'league-uuid',
      teamId: 'team-uuid',
      season: 1,
      position: 0,
      played: 0,
      points: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...over,
    }) as unknown as LeagueStandingEntity;

  describe('updateEloRatings', () => {
    // The old implementation read `match.homeTeam.eloRating` — a
    // relation hydrated once at the top of `completeMatch` — and wrote
    // both teams' new ratings as two separate updates outside any
    // transaction. Two matches involving the same team completing
    // concurrently (a Saturday double-matchweek is explicitly supported)
    // both computed their delta from the SAME stale snapshot, and the
    // second write clobbered the first: the rating moved by one match's
    // delta instead of two.

    const buildEloMatch = () =>
      ({
        id: 'match-elo',
        type: 'league',
        leagueId: 'league-uuid',
        season: 1,
        homeTeamId: 'team-home',
        awayTeamId: 'team-away',
        homeScore: 3,
        awayScore: 0,
        status: MatchStatus.COMPLETED,
        settledAt: null,
      }) as unknown as MatchEntity;

    /** Everything `completeMatch` needs before it reaches the ELO step. */
    // A function, not a value: it references the DI-resolved mocks,
    // which don't exist until `beforeEach` has run.
    const wireUpToElo = () => {
      standingRepository.findOne.mockResolvedValue(makeStanding());
      standingRepository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      } as any);
      eventRepository.find.mockResolvedValue([] as any);
      tacticsRepository.find.mockResolvedValue([] as any);
      mockTeamRepo.update.mockResolvedValue({ affected: 1 });
    };

    it('REGRESSION: re-reads both ratings under a write lock inside the transaction', async () => {
      const match = buildEloMatch();
      matchRepository.findOne.mockResolvedValue(match);
      wireUpToElo();
      // The transaction's team repo returns the CURRENT rating, which is
      // deliberately different from anything on the `match` object.
      mockTeamRepo.findOne
        .mockResolvedValueOnce({
          id: 'team-home',
          name: 'Home',
          eloRating: 1600,
        })
        .mockResolvedValueOnce({
          id: 'team-away',
          name: 'Away',
          eloRating: 1400,
        });

      await service.completeMatch(match.id);

      // Both reads take the write lock — this is what serialises
      // concurrent completions for the same team.
      for (const call of mockTeamRepo.findOne.mock.calls) {
        expect(call[0]).toEqual(
          expect.objectContaining({
            lock: { mode: 'pessimistic_write' },
          }),
        );
      }
      // And the delta came from the re-read value (1600), not from a
      // stale relation. Home won 3-0; expected was 1/(1+10^(-200/400)) =
      // 0.757, so the gain is round(32 * (1 - 0.757)) = +8.
      const homeWrite = mockTeamRepo.update.mock.calls.find(
        (c: any[]) => c[0]?.id === 'team-home',
      );
      expect(homeWrite?.[1].eloRating).toBe(1608);
    });

    it('skips the ELO step when a team row has gone missing', async () => {
      const match = buildEloMatch();
      matchRepository.findOne.mockResolvedValue(match);
      wireUpToElo();
      mockTeamRepo.findOne
        .mockResolvedValueOnce({ id: 'team-home', eloRating: 1500 })
        .mockResolvedValueOnce(null);

      await expect(service.completeMatch(match.id)).resolves.toBeUndefined();

      expect(mockTeamRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('settlement receipt (settledAt)', () => {
    // `status = COMPLETED` records that the simulator finished and the
    // scheduler finalised the row — NOT that settlement ran. The only
    // settlement guard used to be a Redis key with a 24h TTL, which left
    // no durable record and re-applied every mutation to any delivery
    // arriving after 24h (standings, ELO, minutes, fan, ticket revenue).
    // `match.settledAt` (migration 1788000000030) is that record.

    const buildMatch = (over: Partial<Record<string, unknown>> = {}) =>
      ({
        id: 'match-receipt',
        type: 'league',
        leagueId: 'league-uuid',
        season: 1,
        homeTeamId: 'team-home',
        awayTeamId: 'team-away',
        homeScore: 1,
        awayScore: 0,
        status: MatchStatus.COMPLETED,
        settledAt: null,
        ...over,
      }) as unknown as MatchEntity;

    /** Minimal happy-path wiring so `completeMatch` runs to the end. */
    const wireHappyPath = () => {
      standingRepository.findOne.mockImplementation(async (opts: any) =>
        makeStanding({ teamId: opts?.where?.teamId ?? 'team-uuid' }),
      );
      standingRepository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      } as any);
      // `addMatchMinutes` walks the substitution / red-card events.
      eventRepository.find.mockResolvedValue([] as any);
      // ...and the v2 lineup columns for both teams.
      tacticsRepository.find.mockResolvedValue([] as any);
      // Attendance needs a built stadium + a fan row for the home team.
      stadiumRepository.findOne.mockResolvedValue({
        isBuilt: true,
        capacity: 50000,
      } as any);
      fanRepository.find
        .mockResolvedValueOnce({
          totalFans: 40000,
          fanEmotion: 60,
        } as any)
        .mockResolvedValueOnce({
          totalFans: 30000,
          fanEmotion: 55,
        } as any);
    };

    it('stamps settledAt only after every mutation step has run', async () => {
      const match = buildMatch();
      matchRepository.findOne.mockResolvedValue(match);
      wireHappyPath();

      await service.completeMatch(match.id);

      // The stamp is the LAST write, so its position in the call order
      // proves it can't run before the standings / minutes / ELO /
      // revenue writes. If any of those throws, settledAt stays null and
      // `reconcileUnsettledMatches` re-enqueues.
      const updateCalls = matchRepository.update.mock.calls;
      expect(updateCalls.length).toBeGreaterThan(0);
      const settledCall = updateCalls.find(
        (c: any[]) => c[1] && 'settledAt' in c[1],
      );
      expect(settledCall).toBeDefined();
      expect(settledCall![1].settledAt).toBeInstanceOf(Date);
      // And the cache key is stamped after it, not before.
      expect(cacheService.setMatchProcessed).toHaveBeenCalled();
    });

    it('REGRESSION: skips a match that is already settled', async () => {
      // The Redis key expires after 24h, so a late duplicate delivery
      // (stalled job, manual replay, second reconciliation pass) used to
      // re-apply every mutation.
      const match = buildMatch({
        settledAt: new Date('2026-01-01T00:00:00Z'),
      });
      matchRepository.findOne.mockResolvedValue(match);

      await service.completeMatch(match.id);

      // No standings work, no money, no receipt rewrite.
      expect(standingRepository.findOne).not.toHaveBeenCalled();
      expect(financeService.processTransaction).not.toHaveBeenCalled();
      expect(fanService.updateAfterMatch).not.toHaveBeenCalled();
      expect(
        matchRepository.update.mock.calls.some(
          (c: any[]) => c[1] && 'settledAt' in c[1],
        ),
      ).toBe(false);
    });

    it('still honours the Redis fast path before touching the DB', async () => {
      cacheService.isMatchProcessed.mockResolvedValue(true);

      await service.completeMatch('match-receipt');

      expect(matchRepository.findOne).not.toHaveBeenCalled();
    });

    it('REGRESSION: a mid-way failure leaves settledAt null so the sweep retries', async () => {
      // The reconciliation sweep selects
      // `status = COMPLETED AND settled_at IS NULL`, so the receipt must
      // NOT be written before the risky steps.
      const match = buildMatch();
      matchRepository.findOne.mockResolvedValue(match);
      // Standings write blows up.
      standingRepository.findOne.mockRejectedValue(new Error('db gone'));

      await expect(service.completeMatch(match.id)).rejects.toThrow('db gone');

      expect(
        matchRepository.update.mock.calls.some(
          (c: any[]) => c[1] && 'settledAt' in c[1],
        ),
      ).toBe(false);
      expect(cacheService.setMatchProcessed).not.toHaveBeenCalled();
    });
  });

  describe('updateLeagueStandings type guard', () => {
    it('skips the standing upsert + position recalc for cup matches (leagueId=null)', async () => {
      const cupMatch = {
        id: 'match-cup-1',
        type: 'cup',
        leagueId: null,
        season: 1,
        homeTeamId: 'team-home',
        awayTeamId: 'team-away',
        homeScore: 2,
        awayScore: 1,
        status: MatchStatus.COMPLETED,
      } as unknown as MatchEntity;

      // Call the private method directly. The other deps aren't
      // exercised because the type guard returns early before
      // any of them are touched.
      await (service as any).updateLeagueStandings(cupMatch);

      // No standing row should be created or fetched.
      expect(standingRepository.findOne).not.toHaveBeenCalled();
      expect(standingRepository.save).not.toHaveBeenCalled();
      // No position recalc either.
      expect(standingRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('skips for youth matches (leagueId=null, type=youth_league)', async () => {
      const youthMatch = {
        id: 'match-youth-1',
        type: 'youth_league',
        leagueId: null,
        youthLeagueId: 'youth-league-uuid',
        season: 1,
        homeTeamId: 'team-home',
        awayTeamId: 'team-away',
        homeScore: 1,
        awayScore: 1,
        status: MatchStatus.COMPLETED,
      } as unknown as MatchEntity;

      await (service as any).updateLeagueStandings(youthMatch);

      expect(standingRepository.findOne).not.toHaveBeenCalled();
      expect(standingRepository.save).not.toHaveBeenCalled();
    });

    it('skips for friendly and national_team matches', async () => {
      for (const type of ['friendly', 'national_team', 'tournament']) {
        jest.clearAllMocks();
        const match = {
          id: `match-${type}-1`,
          type,
          leagueId: null,
          season: 1,
          homeTeamId: 'team-home',
          awayTeamId: 'team-away',
          homeScore: 0,
          awayScore: 0,
          status: MatchStatus.COMPLETED,
        } as unknown as MatchEntity;
        await (service as any).updateLeagueStandings(match);
        expect(standingRepository.findOne).not.toHaveBeenCalled();
        expect(standingRepository.save).not.toHaveBeenCalled();
      }
    });

    it('REGRESSION: skips for PLAYOFF matches (leagueId is NOT null)', async () => {
      // `playoff.service.ts` stamps playoff matches with
      // `leagueId = homeLeagueId` (the UPPER league) and parks the
      // lower league's id in `lowerLeagueId`. So the `!leagueId` guard
      // does not catch them, and `getOrCreateStanding` would INSERT a
      // phantom `league_standing` row into the upper league for a team
      // that belongs to a different league. The phantom row then gets
      // ranked by `recalculateLeaguePositions` and displaces a real
      // team in the table.
      //
      // This was masked while the playoff cron could never fire (its
      // gate was `week === 15`, evaluated on the Monday week 15
      // *began*). Both fixed together — if you ever remove the PLAYOFF
      // guard, expect 84 phantom rows per season.
      const playoffMatch = {
        id: 'match-playoff-1',
        type: 'playoff',
        leagueId: 'upper-league-uuid',
        lowerLeagueId: 'lower-league-uuid',
        season: 1,
        homeTeamId: 'upper-team-9th',
        awayTeamId: 'lower-team-2nd',
        homeScore: 1,
        awayScore: 2,
        status: MatchStatus.COMPLETED,
      } as unknown as MatchEntity;

      await (service as any).updateLeagueStandings(playoffMatch);

      expect(standingRepository.findOne).not.toHaveBeenCalled();
      expect(standingRepository.save).not.toHaveBeenCalled();
      expect(standingRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('DOES update standings for LEAGUE matches (positive control)', async () => {
      const leagueMatch = {
        id: 'match-league-1',
        type: 'league',
        leagueId: 'league-uuid',
        season: 1,
        homeTeamId: 'team-home',
        awayTeamId: 'team-away',
        homeScore: 3,
        awayScore: 1,
        status: MatchStatus.COMPLETED,
      } as unknown as MatchEntity;

      const homeStanding = makeStanding({
        teamId: 'team-home',
        points: 0,
        goalsFor: 0,
        goalsAgainst: 0,
      });
      const awayStanding = makeStanding({
        teamId: 'team-away',
        points: 0,
        goalsFor: 0,
        goalsAgainst: 0,
      });
      // For the home + away fetch...
      standingRepository.findOne.mockResolvedValueOnce(homeStanding);
      standingRepository.findOne.mockResolvedValueOnce(awayStanding);
      // For the position recalc fetch...
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest
          .fn()
          .mockResolvedValue([
            { ...homeStanding, position: 0 } as LeagueStandingEntity,
            { ...awayStanding, position: 0 } as LeagueStandingEntity,
          ]),
      };
      standingRepository.createQueryBuilder.mockReturnValue(qb as any);
      standingRepository.save.mockResolvedValue([] as any);

      await (service as any).updateLeagueStandings(leagueMatch);

      // The two team lookups (now `FOR UPDATE`) + one QueryBuilder fetch.
      expect(standingRepository.findOne).toHaveBeenCalledTimes(2);
      expect(standingRepository.createQueryBuilder).toHaveBeenCalledTimes(1);

      // ONE save now. Previously there were two: the per-team stat
      // update, then a `save(rows)` renumbering the whole league. The
      // renumber is now a column-scoped UPDATE that only touches rows
      // whose position actually changed — the old full-row `save`
      // wrote every column of all 16 rows on every completed match
      // (~326k full-row UPDATEs per season) and could clobber a
      // `goals_for` a concurrent completion had just incremented.
      expect(standingRepository.save).toHaveBeenCalledTimes(1);
      // Both rows moved from position 0, so the renumber fires.
      expect(dataSource._txManager.createQueryBuilder).toHaveBeenCalled();
      const updateChain = dataSource._txUpdateChain;
      const setArg = updateChain.set.mock.calls[0][0];
      expect(Object.keys(setArg)).toEqual(['position']);
      // Positions 1 and 2 are bound as parameters, not interpolated.
      const whereParams = updateChain.where.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      const positions = Object.entries(whereParams)
        .filter(([k]) => k.startsWith('pos'))
        .map(([, v]) => v)
        .sort();
      expect(positions).toEqual([1, 2]);

      // The single save carried the per-team stat update (wins /
      // losses / points / goals). The home team won 3-1, so the home
      // standing should be 1 win, 0 loss, 3 pts.
      const perTeamRows = standingRepository.save.mock.calls[0][0] as any[];
      const homeRow = perTeamRows.find((r: any) => r.teamId === 'team-home');
      expect(homeRow.wins).toBe(1);
      expect(homeRow.points).toBe(3);
      const awayRow = perTeamRows.find((r: any) => r.teamId === 'team-away');
      expect(awayRow.losses).toBe(1);
      expect(awayRow.points).toBe(0);
    });

    it('REGRESSION: reads the standings under a row lock, in a transaction', async () => {
      // The old shape was `findOne` -> mutate in JS -> `save()` with no
      // transaction, no row lock and no version column: a textbook lost
      // update. Two matches for the same team completing concurrently (a
      // Saturday double-matchweek is explicitly supported —
      // `match.entity.ts` "Round within the week (1 or 2 for double
      // matchweeks)") both read the same row and the second write
      // clobbered the first's `points += 3`.
      //
      // Nothing enforced single-threadedness either: the completion
      // worker merely happened to be registered with BullMQ's default
      // concurrency of 1, an accident of configuration rather than a
      // contract. Raising it — the obvious throughput fix — would have
      // silently corrupted the table.
      const leagueMatch = {
        id: 'match-lock',
        type: 'league',
        leagueId: 'league-uuid',
        season: 1,
        homeTeamId: 'team-home',
        awayTeamId: 'team-away',
        homeScore: 1,
        awayScore: 0,
        status: MatchStatus.COMPLETED,
      } as unknown as MatchEntity;

      standingRepository.findOne.mockResolvedValue(
        makeStanding({ teamId: 'team-home', points: 0 }),
      );
      standingRepository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      } as any);

      await (service as any).updateLeagueStandings(leagueMatch);

      // Everything happens inside one transaction.
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);

      // And both reads take a write lock, which is what serialises
      // concurrent completions for the same team.
      const lockArg = standingRepository.findOne.mock.calls[0][0];
      expect(lockArg).toEqual(
        expect.objectContaining({
          lock: { mode: 'pessimistic_write' },
        }),
      );

      // The writes run on the transaction's manager, not the injected
      // repo, so they participate in the same transaction.
      expect(dataSource._txManager.getRepository).toHaveBeenCalledWith(
        LeagueStandingEntity,
      );
    });

    it('REGRESSION: skips for PLAYOFF matches (leagueId is NOT null)', async () => {
      // This test used to assert the OPPOSITE — "DOES update standings
      // for PLAYOFF matches" — which encoded the bug.
      //
      // `playoff.service.ts` stamps playoff matches with
      // `leagueId = homeLeagueId` (the UPPER league) and parks the
      // lower league's id in `lowerLeagueId`. The old fixture used
      // `team-home`/`team-away`, which reads as if both teams were in
      // the same league — but in reality `awayTeamId` belongs to a
      // DIFFERENT league, so `getOrCreateStanding(upperLeague, awayTeam)`
      // INSERTs a phantom `league_standing` row into the upper league
      // for a team that does not belong there. The phantom row is then
      // ranked by `recalculateLeaguePositions` and displaces a real
      // team — and could outrank the champion, at which point
      // `promotion-relegation.service.ts` would pick it for promotion.
      //
      // Playoffs decide promotion via `swapTeamLeague` in
      // `SeasonTransitionService.processAfterPlayoffsComplete`, never
      // via league standings.
      //
      // This was masked while the playoff cron could never fire (its
      // gate was `week === 15`, evaluated on the Monday week 15
      // *began*, so the completeness check always failed). Both are
      // fixed together — if you ever remove the PLAYOFF guard, expect
      // 84 phantom standings rows per season.
      const playoffMatch = {
        id: 'match-playoff-1',
        type: 'playoff',
        leagueId: 'upper-league-uuid',
        lowerLeagueId: 'lower-league-uuid',
        season: 1,
        homeTeamId: 'upper-team-9th',
        awayTeamId: 'lower-team-2nd',
        homeScore: 1,
        awayScore: 2,
        status: MatchStatus.COMPLETED,
      } as unknown as MatchEntity;

      await (service as any).updateLeagueStandings(playoffMatch);

      expect(standingRepository.findOne).not.toHaveBeenCalled();
      expect(standingRepository.save).not.toHaveBeenCalled();
      expect(standingRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('maintains league_standing.goalDifference so the season-archive pipeline sees real numbers', async () => {
      // [Fix 2026-08-23] season-archive.service.ts:111 copies
      // standing.goalDifference straight into archived_season_result.
      // goalDifference. The pre-fix code never wrote the column, so
      // every team's end-of-season history was a 0 even when their
      // real GD was e.g. +24. The write here is the DB-side single
      // source of truth for the archive pipeline; the DTO path in
      // league.service.ts getStandings still recomputes in memory.
      const leagueMatch = {
        id: 'match-gd-1',
        type: 'league',
        leagueId: 'league-uuid',
        season: 1,
        homeTeamId: 'team-home',
        awayTeamId: 'team-away',
        homeScore: 3,
        awayScore: 1,
        status: MatchStatus.COMPLETED,
      } as unknown as MatchEntity;

      // Start each side with non-zero goals so we can confirm
      // goalDifference is RE-DERIVED (= GF - GA) rather than += .
      // A team at goalsFor=5, goalsAgainst=3 with a 3-1 win should
      // land at GD = 8 - 4 = 4, not 5 - 3 + (3 - 1) = 4 either
      // way here, so the meaningful check is the negative side:
      // away team: 4 - 9 = -5 (NOT -5 - 2 = -7 if the field had
      // been naively += homeScore - awayScore on the away row).
      standingRepository.findOne.mockResolvedValueOnce(
        makeStanding({
          teamId: 'team-home',
          goalsFor: 5,
          goalsAgainst: 3,
          goalDifference: 0,
        }),
      );
      standingRepository.findOne.mockResolvedValueOnce(
        makeStanding({
          teamId: 'team-away',
          goalsFor: 4,
          goalsAgainst: 9,
          goalDifference: 0,
        }),
      );
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      standingRepository.createQueryBuilder.mockReturnValue(qb as any);
      standingRepository.save.mockResolvedValue([] as any);

      await (service as any).updateLeagueStandings(leagueMatch);

      const perTeamRows = standingRepository.save.mock.calls[0][0] as any[];
      const homeRow = perTeamRows.find((r: any) => r.teamId === 'team-home');
      const awayRow = perTeamRows.find((r: any) => r.teamId === 'team-away');
      // home: GF 5 + 3 = 8, GA 3 + 1 = 4 -> GD = +4
      expect(homeRow.goalDifference).toBe(4);
      // away: GF 4 + 1 = 5, GA 9 + 3 = 12 -> GD = -7
      expect(awayRow.goalDifference).toBe(-7);
      // The standalone 0-0 case (drawn match, GD must NOT drift):
      // exercise a second time with both scores 0 to confirm
      // the write path doesn't leave stale GD on a draw.
      jest.clearAllMocks();
      standingRepository.findOne.mockResolvedValueOnce(
        makeStanding({ teamId: 'team-home', goalsFor: 8, goalsAgainst: 4 }),
      );
      standingRepository.findOne.mockResolvedValueOnce(
        makeStanding({ teamId: 'team-away', goalsFor: 5, goalsAgainst: 12 }),
      );
      const qb2 = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      standingRepository.createQueryBuilder.mockReturnValue(qb2 as any);
      standingRepository.save.mockResolvedValue([] as any);
      const draw = {
        ...leagueMatch,
        id: 'match-gd-2',
        homeScore: 0,
        awayScore: 0,
      } as unknown as MatchEntity;
      await (service as any).updateLeagueStandings(draw);
      const drawRows = standingRepository.save.mock.calls[0][0] as any[];
      expect(
        drawRows.find((r: any) => r.teamId === 'team-home').goalDifference,
      ).toBe(4);
      expect(
        drawRows.find((r: any) => r.teamId === 'team-away').goalDifference,
      ).toBe(-7);
    });
  });

  describe('recalculateLeaguePositions', () => {
    // The recalc uses a QueryBuilder with the computed GD expression and
    // a deterministic tie-break chain. A previous implementation (still
    // in LeagueStructureService until this batch) sorted by the
    // `goalDifference` column, and every implementation stopped at three
    // keys — so a team tied on (points, GD, GF) got an arbitrary rank
    // from Postgres heap order, and since promotion / relegation /
    // playoff qualification all select by exact `position === N`, that
    // tie silently decided who was promoted. `standings-sort.spec.ts` is
    // the cross-file contract test.
    it('renumbers positions 1..N and writes ONLY the changed rows', async () => {
      // Pre-sort the rows the way TypeORM would after the ORDER BY. The
      // mock QueryBuilder doesn't run the SQL, so we feed the rows in
      // already-sorted order:
      //   - team-b: 9 pts, GD +5, GF 7  (#1)
      //   - team-a: 9 pts, GD +2, GF 5  (same pts, worse GD, #2)
      //   - team-c: 6 pts, GD +1, GF 4  (#3)
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          makeStanding({
            id: 's-b',
            teamId: 'team-b',
            position: 1,
            points: 9,
            goalsFor: 7,
            goalsAgainst: 2,
          }),
          makeStanding({
            id: 's-a',
            teamId: 'team-a',
            position: 2,
            points: 9,
            goalsFor: 5,
            goalsAgainst: 3,
          }),
          makeStanding({
            id: 's-c',
            teamId: 'team-c',
            position: 3,
            points: 6,
            goalsFor: 4,
            goalsAgainst: 3,
          }),
        ]),
      };
      standingRepository.createQueryBuilder.mockReturnValue(qb as any);

      await (service as any).recalculateLeaguePositions(
        dataSource._txManager,
        'league-uuid',
        1,
      );

      // The full deterministic key: computed GD, GF, then wins /
      // goals-against / teamId so a tie is never resolved by heap order.
      expect(qb.addOrderBy).toHaveBeenCalledWith(
        's.goalsFor - s.goalsAgainst',
        'DESC',
      );
      expect(qb.addOrderBy).toHaveBeenCalledWith('s.goalsFor', 'DESC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('s.wins', 'DESC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('s.goalsAgainst', 'ASC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('s.teamId', 'ASC');
      expect(qb.addOrderBy).toHaveBeenCalledTimes(5);

      // Nobody moved, so no UPDATE fires at all. The old code
      // `save()`d all N rows unconditionally — ~326k full-row UPDATEs
      // per season, each writing every column and therefore able to
      // clobber a `goals_for` a concurrent completion had just bumped.
      expect(dataSource._txManager.createQueryBuilder).not.toHaveBeenCalled();
      expect(standingRepository.save).not.toHaveBeenCalled();
    });

    it('writes only the position column of the rows that moved', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        // team-c jumped from 3rd to 1st; team-a/b shifted down one.
        getMany: jest.fn().mockResolvedValue([
          makeStanding({
            id: 's-c',
            teamId: 'team-c',
            position: 3,
            points: 12,
            goalsFor: 9,
            goalsAgainst: 1,
          }),
          makeStanding({
            id: 's-b',
            teamId: 'team-b',
            position: 1,
            points: 9,
            goalsFor: 7,
            goalsAgainst: 2,
          }),
          makeStanding({
            id: 's-a',
            teamId: 'team-a',
            position: 2,
            points: 9,
            goalsFor: 5,
            goalsAgainst: 3,
          }),
        ]),
      };
      standingRepository.createQueryBuilder.mockReturnValue(qb as any);

      await (service as any).recalculateLeaguePositions(
        dataSource._txManager,
        'league-uuid',
        1,
      );

      expect(dataSource._txManager.createQueryBuilder).toHaveBeenCalled();
      // Column-scoped UPDATE. `save(moved)` would write every column of
      // every moved row — which is how a concurrent completion's
      // `goals_for` increment got clobbered.
      const setArg = dataSource._txUpdateChain.set.mock.calls[0][0];
      expect(Object.keys(setArg)).toEqual(['position']);
    });

    it('is a no-op when the league has no standing rows yet', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      standingRepository.createQueryBuilder.mockReturnValue(qb as any);

      await (service as any).recalculateLeaguePositions(
        dataSource._txManager,
        'empty-league',
        1,
      );

      // Nothing to renumber, so no UPDATE fires — we don't want the SQL
      // to run on every match in a league that hasn't started yet.
      expect(dataSource._txManager.createQueryBuilder).not.toHaveBeenCalled();
      expect(standingRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('careerStats single-writer invariant', () => {
    // The bug: the simulator (simulation.processor.ts player-loop
    // block) and this service both wrote
    // careerStats.club.{matches,goals,assists,yellowCards,redCards}.
    // The simulator is the single source of truth - it has engine
    // data (playerMatchStats) and runs earlier in the same match
    // lifecycle, inside its own transaction. This service writing
    // a second time meant every career counter doubled after each
    // match. See the comment block at the top of completeMatch
    // for the full rationale.
    //
    // These tests pin the invariant at the source level so a
    // future contributor cannot reintroduce the double-count
    // without breaking the build. A behavioural test cannot catch
    // the bug: any single call to completeMatch would just see
    // the simulator's write, and the cache-sentinel does not
    // protect against the simulator's pre-existing write.
    it('does not declare updatePlayerStats (the double-write method is gone)', () => {
      expect((service as any).updatePlayerStats).toBeUndefined();
    });

    it('does not declare ensurePlayerInMap (helper for the deleted method)', () => {
      expect((service as any).ensurePlayerInMap).toBeUndefined();
    });

    it('source: no careerStats.club.<stat> writes in this file', () => {
      // Tripwire: if anyone re-adds a += to any of these fields
      // inside match-completion.service.ts, fail the build. The
      // simulator is the canonical writer.
      const fs = require('fs');
      const path = require('path');
      const src = fs.readFileSync(
        path.join(__dirname, 'match-completion.service.ts'),
        'utf8',
      );
      const banned = [
        'careerStats.club.matches',
        'careerStats.club.goals',
        'careerStats.club.assists',
        'careerStats.club.yellowCards',
        'careerStats.club.redCards',
      ];
      for (const term of banned) {
        expect(src).not.toContain(term);
      }
    });
  });
  describe('addMatchMinutes (red card + stoppage time)', () => {
    // Regression specs for two bugs the old heuristic had:
    //   1. A starter with a straight red card on minute 30 got
    //      90 minutes because `subOutMinute ?? 90` had no
    //      send-off fallback. Now exit = subOut ?? sentOff ?? finalMinute.
    //   2. Stoppage time was dropped entirely: a 90+3 match
    //      counted as 90, a 120+2 ET match counted as 120.
    //      Now finalMinute = 90 + secondHalfInjuryTime (or
    //      120 + extraTimeSecondHalfInjury when hasExtraTime).

    // Helper: read the (where, column, value) triples every
    // `playerRepository.increment` call saw, in order, so each
    // spec can assert "starter id 1 got N minutes" without
    // caring about call counts.
    const collectIncrements = () => {
      const calls = playerRepository.increment.mock.calls;
      return calls.map((c) => ({
        id: (c[0] as any).id,
        column: c[1] as string,
        value: c[2] as number,
      }));
    };

    // Set up: 11 home starters, no subs, no events, a 90+3 match.
    // The pre-fix code would have credited each starter 90
    // minutes; the post-fix code credits 93 (= 90 + 3).
    const setupBasicMatch = (
      matchOverrides: Partial<MatchEntity> = {},
      eventOverrides: Partial<MatchEventEntity>[] = [],
      tacticOverrides: Partial<MatchTacticsEntity>[] = [],
    ) => {
      eventRepository.find.mockResolvedValue(eventOverrides as any);
      tacticsRepository.find.mockResolvedValue(tacticOverrides as any);
      playerRepository.increment.mockResolvedValue(undefined as any);
      return matchOverrides;
    };

    it('credits stoppage time to a starter who plays the full match', async () => {
      // 90 + 3 stoppage, no subs, no red. finalMinute = 93.
      const match = {
        id: 'm1',
        hasExtraTime: false,
        secondHalfInjuryTime: 3,
      } as unknown as MatchEntity;
      const tactic = {
        teamId: 'team-home',
        lineupV2: {
          GK: 1,
          LB: 2,
          RB: 3,
          CD1: 4,
          CD2: 5,
          LM: 6,
          RM: 7,
          CM1: 8,
          CM2: 9,
          ST1: 10,
          ST2: 11,
        },
        substitutionsV2: [],
      } as unknown as MatchTacticsEntity;
      setupBasicMatch({}, [], [tactic]);

      await (service as any).addMatchMinutes(match);

      // 11 starters, each with 93 minutes.
      const incs = collectIncrements();
      expect(incs).toHaveLength(11);
      for (const inc of incs) {
        expect(inc.column).toBe('matchMinutes');
        expect(inc.value).toBe(93);
      }
    });

    it('credits stoppage time on a sub who comes in and plays the rest', async () => {
      // Sub in at 60, plays to 90+5 = 95. Expected: 35 minutes.
      const match = {
        id: 'm2',
        hasExtraTime: false,
        secondHalfInjuryTime: 5,
      } as unknown as MatchEntity;
      const tactic = {
        teamId: 'team-home',
        lineupV2: {
          GK: 1,
          LB: 2,
          RB: 3,
          CD1: 4,
          CD2: 5,
          LM: 6,
          RM: 7,
          CM1: 8,
          CM2: 9,
          ST1: 10,
          ST2: 11,
        },
        substitutionsV2: [{ minute: 60, out: 10, in: 20 }],
      } as unknown as MatchTacticsEntity;
      const events = [
        {
          typeName: 'substitution',
          minute: 60,
          playerId: 10,
          data: { playerId: 10, substitutedPlayerId: 20 },
        },
      ] as unknown as MatchEventEntity[];
      setupBasicMatch({}, events, [tactic]);

      await (service as any).addMatchMinutes(match);

      const incs = collectIncrements();
      // 11 starters + 1 sub in
      expect(incs).toHaveLength(12);
      // Starter 10 was subbed out at 60 -> 60 minutes (NOT 95;
      // the sub is what changes the lineup, not stoppage).
      const starter10 = incs.find((i) => i.id === 10);
      expect(starter10?.value).toBe(60);
      // Sub 20 came in at 60, plays to 95 -> 35 minutes.
      const sub20 = incs.find((i) => i.id === 20);
      expect(sub20?.value).toBe(35);
    });

    it('credits only up to the red-card minute when a starter is sent off (regression)', async () => {
      // Direct red card on minute 30, no substitution follows
      // (engine plays the rest with 10 men). Pre-fix this
      // starter got 90 minutes. Post-fix: 30.
      const match = {
        id: 'm3',
        hasExtraTime: false,
        secondHalfInjuryTime: 4,
      } as unknown as MatchEntity;
      const tactic = {
        teamId: 'team-home',
        lineupV2: {
          GK: 1,
          LB: 2,
          RB: 3,
          CD1: 4,
          CD2: 5,
          LM: 6,
          RM: 7,
          CM1: 8,
          CM2: 9,
          ST1: 10,
          ST2: 11,
        },
        substitutionsV2: [],
      } as unknown as MatchTacticsEntity;
      const events = [
        {
          typeName: 'red_card',
          minute: 30,
          playerId: 8,
          data: {},
        },
      ] as unknown as MatchEventEntity[];
      setupBasicMatch({}, events, [tactic]);

      await (service as any).addMatchMinutes(match);

      const incs = collectIncrements();
      const cm1 = incs.find((i) => i.id === 8);
      expect(cm1?.value).toBe(30);
      // Other 10 starters still got 90 + 4 = 94.
      const otherStarters = incs.filter((i) => i.id !== 8);
      for (const inc of otherStarters) {
        expect(inc.value).toBe(94);
      }
    });

    it('credits stoppage time on an ET match (120 + injury, not 120)', async () => {
      // ET match, 2 minutes of stoppage in the second ET half.
      // finalMinute = 120 + 2 = 122. Pre-fix: 120.
      const match = {
        id: 'm4',
        hasExtraTime: true,
        extraTimeSecondHalfInjury: 2,
        secondHalfInjuryTime: 3,
      } as unknown as MatchEntity;
      const tactic = {
        teamId: 'team-home',
        lineupV2: {
          GK: 1,
          LB: 2,
          RB: 3,
          CD1: 4,
          CD2: 5,
          LM: 6,
          RM: 7,
          CM1: 8,
          CM2: 9,
          ST1: 10,
          ST2: 11,
        },
        substitutionsV2: [],
      } as unknown as MatchTacticsEntity;
      setupBasicMatch({}, [], [tactic]);

      await (service as any).addMatchMinutes(match);

      const incs = collectIncrements();
      for (const inc of incs) {
        expect(inc.value).toBe(122);
      }
    });

    it('uses 90 / 120 as the fallback when injury time is missing (pre-RFC matches)', async () => {
      // hasExtraTime=false, secondHalfInjuryTime undefined.
      // Should still credit 90, not NaN, not 0.
      const match = {
        id: 'm5',
        hasExtraTime: false,
        secondHalfInjuryTime: undefined,
      } as unknown as MatchEntity;
      const tactic = {
        teamId: 'team-home',
        lineupV2: { GK: 1 },
        substitutionsV2: [],
      } as unknown as MatchTacticsEntity;
      setupBasicMatch({}, [], [tactic]);

      await (service as any).addMatchMinutes(match);

      const incs = collectIncrements();
      expect(incs[0].value).toBe(90);
    });
  });
});
