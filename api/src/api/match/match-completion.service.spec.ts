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
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FinanceService } from '../finance/finance.service';
import { FanService } from '../fan/fan.service';
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

  beforeEach(async () => {
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
          },
        },
        {
          provide: getRepositoryToken(LeagueStandingEntity),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PlayerEntity),
          useValue: { find: jest.fn(), findOne: jest.fn(), save: jest.fn(), increment: jest.fn() },
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
          useValue: { findOne: jest.fn() },
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
          useValue: { processTransaction: jest.fn().mockResolvedValue(undefined) },
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
    standingRepository = moduleRef.get(getRepositoryToken(LeagueStandingEntity));
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
      id: "standing-uuid",
      leagueId: "league-uuid",
      teamId: "team-uuid",
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
      recentForm: "",
      createdAt: new Date(),
      updatedAt: new Date(),
      ...over,
    }) as unknown as LeagueStandingEntity;

  describe("updateLeagueStandings type guard", () => {
    it("skips the standing upsert + position recalc for cup matches (leagueId=null)", async () => {
      const cupMatch = {
        id: "match-cup-1",
        type: "cup",
        leagueId: null,
        season: 1,
        homeTeamId: "team-home",
        awayTeamId: "team-away",
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

    it("skips for youth matches (leagueId=null, type=youth_league)", async () => {
      const youthMatch = {
        id: "match-youth-1",
        type: "youth_league",
        leagueId: null,
        youthLeagueId: "youth-league-uuid",
        season: 1,
        homeTeamId: "team-home",
        awayTeamId: "team-away",
        homeScore: 1,
        awayScore: 1,
        status: MatchStatus.COMPLETED,
      } as unknown as MatchEntity;

      await (service as any).updateLeagueStandings(youthMatch);

      expect(standingRepository.findOne).not.toHaveBeenCalled();
      expect(standingRepository.save).not.toHaveBeenCalled();
    });

    it("skips for friendly and national_team matches", async () => {
      for (const type of ["friendly", "national_team", "tournament"]) {
        jest.clearAllMocks();
        const match = {
          id: `match-${type}-1`,
          type,
          leagueId: null,
          season: 1,
          homeTeamId: "team-home",
          awayTeamId: "team-away",
          homeScore: 0,
          awayScore: 0,
          status: MatchStatus.COMPLETED,
        } as unknown as MatchEntity;
        await (service as any).updateLeagueStandings(match);
        expect(standingRepository.findOne).not.toHaveBeenCalled();
        expect(standingRepository.save).not.toHaveBeenCalled();
      }
    });

    it("DOES update standings for LEAGUE matches (positive control)", async () => {
      const leagueMatch = {
        id: "match-league-1",
        type: "league",
        leagueId: "league-uuid",
        season: 1,
        homeTeamId: "team-home",
        awayTeamId: "team-away",
        homeScore: 3,
        awayScore: 1,
        status: MatchStatus.COMPLETED,
      } as unknown as MatchEntity;

      const homeStanding = makeStanding({
        teamId: "team-home",
        points: 0,
        goalsFor: 0,
        goalsAgainst: 0,
      });
      const awayStanding = makeStanding({
        teamId: "team-away",
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
        getMany: jest.fn().mockResolvedValue([
          { ...homeStanding, position: 0 } as LeagueStandingEntity,
          { ...awayStanding, position: 0 } as LeagueStandingEntity,
        ]),
      };
      standingRepository.createQueryBuilder.mockReturnValue(qb as any);
      standingRepository.save.mockResolvedValue([] as any);

      await (service as any).updateLeagueStandings(leagueMatch);

      // The two team findOne calls + one QueryBuilder fetch.
      expect(standingRepository.findOne).toHaveBeenCalledTimes(2);
      expect(standingRepository.createQueryBuilder).toHaveBeenCalledTimes(1);
      // Two save calls expected: the per-team update, then
      // the position renumber. The renumber save is the one
      // that actually carries the new positions (1 and 2).
      expect(standingRepository.save).toHaveBeenCalledTimes(2);
      const renumberedRows = standingRepository.save.mock
        .calls[1][0] as any[];
      const positions = renumberedRows
        .map((r: any) => r.position)
        .sort();
      expect(positions).toEqual([1, 2]);
      // The first save carried the per-team stat update
      // (wins/losses/points/goals). The home team won 3-1
      // so the home standing should be 1 win, 0 loss, 3 pts.
      const perTeamRows = standingRepository.save.mock
        .calls[0][0] as any[];
      const homeRow = perTeamRows.find(
        (r: any) => r.teamId === "team-home",
      );
      expect(homeRow.wins).toBe(1);
      expect(homeRow.points).toBe(3);
      const awayRow = perTeamRows.find(
        (r: any) => r.teamId === "team-away",
      );
      expect(awayRow.losses).toBe(1);
      expect(awayRow.points).toBe(0);
    });

    it("DOES update standings for PLAYOFF matches (promotion/relegation is league-scoped)", async () => {
      const playoffMatch = {
        id: "match-playoff-1",
        type: "playoff",
        leagueId: "league-uuid",
        season: 1,
        homeTeamId: "team-home",
        awayTeamId: "team-away",
        homeScore: 1,
        awayScore: 0,
        status: MatchStatus.COMPLETED,
      } as unknown as MatchEntity;

      standingRepository.findOne.mockResolvedValueOnce(
        makeStanding({ teamId: "team-home" }),
      );
      standingRepository.findOne.mockResolvedValueOnce(
        makeStanding({ teamId: "team-away" }),
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

      await (service as any).updateLeagueStandings(playoffMatch);

      expect(standingRepository.findOne).toHaveBeenCalledTimes(2);
    });
  });

  describe("recalculateLeaguePositions", () => {
    // The recalc uses a QueryBuilder with the computed GD
    // expression. The previous implementation (still found in
    // LeagueStructureService.updateStandingsPositions until
    // the review) sorted by the `goalDifference` column which
    // is never maintained, so the tiebreak was wrong. This
    // case pins the computed-expression sort key.
    it("renumbers positions 1..N by points > (GF - GA) > GF", async () => {
      // Pre-sort the rows the way TypeORM would after the
      // ORDER BY points DESC, (GF - GA) DESC, GF DESC. The
      // mock QueryBuilder doesn\'t actually run the SQL, so
      // we have to feed the rows in already-sorted order:
      //   - team-b: 9 pts, GD +5, GF 7  (best GD, #1)
      //   - team-a: 9 pts, GD +2, GF 5  (same pts, worse GD, #2)
      //   - team-c: 6 pts, GD +1, GF 4  (#3)
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          makeStanding({ teamId: "team-b", points: 9, goalsFor: 7, goalsAgainst: 2 }),
          makeStanding({ teamId: "team-a", points: 9, goalsFor: 5, goalsAgainst: 3 }),
          makeStanding({ teamId: "team-c", points: 6, goalsFor: 4, goalsAgainst: 3 }),
        ]),
      };
      standingRepository.createQueryBuilder.mockReturnValue(qb as any);
      standingRepository.save.mockResolvedValue([] as any);

      await (service as any).recalculateLeaguePositions("league-uuid", 1);

      // The three addOrderBy calls pin the GD expression + GF
      // tiebreak. A future refactor that switches to the
      // `goalDifference` column would break the test.
      expect(qb.addOrderBy).toHaveBeenCalledWith(
        "s.goalsFor - s.goalsAgainst",
        "DESC",
      );
      expect(qb.addOrderBy).toHaveBeenCalledWith("s.goalsFor", "DESC");
      expect(qb.addOrderBy).toHaveBeenCalledTimes(2);

      // The save payload should have positions 1, 2, 3 in the
      // order dictated by the sort: team-b, team-a, team-c.
      expect(standingRepository.save).toHaveBeenCalled();
      const saved = standingRepository.save.mock.calls[0][0] as any[];
      const sortedByPos = [...saved].sort((a, b) => a.position - b.position);
      expect(sortedByPos.map((r) => r.teamId)).toEqual([
        "team-b",
        "team-a",
        "team-c",
      ]);
    });

    it("is a no-op when the league has no standing rows yet", async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      standingRepository.createQueryBuilder.mockReturnValue(qb as any);
      standingRepository.save.mockResolvedValue([] as any);

      await (service as any).recalculateLeaguePositions("empty-league", 1);

      // The save is skipped when there\'s nothing to renumber.
      // We do this so the SQL UPDATE doesn\'t fire on every
      // match in a league that hasn\'t started yet.
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
        lineupV2: { GK: 1, LB: 2, RB: 3, CD1: 4, CD2: 5, LM: 6, RM: 7, CM1: 8, CM2: 9, ST1: 10, ST2: 11 },
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
        lineupV2: { GK: 1, LB: 2, RB: 3, CD1: 4, CD2: 5, LM: 6, RM: 7, CM1: 8, CM2: 9, ST1: 10, ST2: 11 },
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
        lineupV2: { GK: 1, LB: 2, RB: 3, CD1: 4, CD2: 5, LM: 6, RM: 7, CM1: 8, CM2: 9, ST1: 10, ST2: 11 },
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
        lineupV2: { GK: 1, LB: 2, RB: 3, CD1: 4, CD2: 5, LM: 6, RM: 7, CM1: 8, CM2: 9, ST1: 10, ST2: 11 },
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
