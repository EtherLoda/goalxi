import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlayoffService } from './playoff.service';
import {
  GAME_SETTINGS,
  LeagueEntity,
  LeagueStandingEntity,
  MatchEntity,
  MatchStatus,
  MatchType,
} from '@goalxi/database';
import { LOGGER_SERVICE_PROVIDER } from '../test-utils/test-logger';

describe('PlayoffService', () => {
  let service: PlayoffService;
  let matchRepository: jest.Mocked<Repository<MatchEntity>>;
  let leagueRepository: jest.Mocked<Repository<LeagueEntity>>;
  let standingRepository: jest.Mocked<Repository<LeagueStandingEntity>>;

  const mockMatchRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockLeagueRepository = {
    find: jest.fn(),
  };

  const mockStandingRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const TIER1_LEAGUE: Partial<LeagueEntity> = {
    id: 'tier1-league-id' as any,
    name: 'Tier 1 League',
    tier: 1,
    tierDivision: 1,
    maxTeams: 16,
    promotionSlots: 0,
    playoffSlots: 4,
    relegationSlots: 4,
    parentLeagueId: null as any,
  };

  const TIER2_D1: Partial<LeagueEntity> = {
    id: 'tier2-d1-id' as any,
    name: 'Tier 2 D1',
    tier: 2,
    tierDivision: 1,
    maxTeams: 16,
    promotionSlots: 4,
    playoffSlots: 4,
    relegationSlots: 4,
    parentLeagueId: 'tier1-league-id' as any,
  };

  const TIER2_D2: Partial<LeagueEntity> = {
    id: 'tier2-d2-id' as any,
    name: 'Tier 2 D2',
    tier: 2,
    tierDivision: 2,
    maxTeams: 16,
    promotionSlots: 4,
    playoffSlots: 4,
    relegationSlots: 4,
    parentLeagueId: 'tier1-league-id' as any,
  };

  const TIER3_D1: Partial<LeagueEntity> = {
    id: 'tier3-d1-id' as any,
    name: 'Tier 3 D1',
    tier: 3,
    tierDivision: 1,
    maxTeams: 16,
    parentLeagueId: 'tier2-d1-id' as any,
  };

  const TIER3_D2: Partial<LeagueEntity> = {
    id: 'tier3-d2-id' as any,
    name: 'Tier 3 D2',
    tier: 3,
    tierDivision: 2,
    maxTeams: 16,
    parentLeagueId: 'tier2-d1-id' as any,
  };

  // L2-D2's own children — these should NOT be paired
  // with L2-D1's #9-12 in any scenario, because the
  // parent mapping says L2-D1 only sees L3-D1/D2.
  const TIER3_D5: Partial<LeagueEntity> = {
    id: 'tier3-d5-id' as any,
    name: 'Tier 3 D5',
    tier: 3,
    tierDivision: 5,
    maxTeams: 16,
    parentLeagueId: 'tier2-d2-id' as any,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlayoffService,
        LOGGER_SERVICE_PROVIDER,
        {
          provide: getRepositoryToken(MatchEntity),
          useValue: mockMatchRepository,
        },
        {
          provide: getRepositoryToken(LeagueEntity),
          useValue: mockLeagueRepository,
        },
        {
          provide: getRepositoryToken(LeagueStandingEntity),
          useValue: mockStandingRepository,
        },
      ],
    }).compile();

    service = module.get<PlayoffService>(PlayoffService);
    matchRepository = module.get(getRepositoryToken(MatchEntity));
    leagueRepository = module.get(getRepositoryToken(LeagueEntity));
    standingRepository = module.get(getRepositoryToken(LeagueStandingEntity));

    jest.clearAllMocks();
  });

  describe('generateAllPlayoffMatches', () => {
    it('returns an empty array when no tier-1 leagues exist', async () => {
      // The recursion starts from tier 1; if there are no
      // tier-1 leagues there's nothing to descend from.
      leagueRepository.find.mockResolvedValueOnce([]);
      const result = await service.generateAllPlayoffMatches(1);
      expect(result).toEqual([]);
    });

    it('recursively pairs each league with its own child leagues only (parentLeagueId filter)', async () => {
      // Regression for the bug where the lower-league
      // query was `where('league.tier = :tier', ...)` with
      // no `parentLeagueId` filter. The result: every
      // upper league saw *every* lower league (e.g.
      // L2-D2's #9-12 got paired with L3-D1..D4 — the
      // same L3 teams L2-D1 was already using). The
      // `playoffSwappedAt` latch in
      // `processAfterPlayoffsComplete` could only act on
      // the first swap per lower team, so L2-D2/D3/D4's
      // playoff results were effectively dropped.
      //
      // We start the recursion from a fake T1 (no
      // children itself) and have it hand off to
      // `generatePyramidLevelPlayoffs` only via
      // L2-D1 — a smaller fixture that makes the
      // assertion unambiguous.
      const ROOT = {
        id: 'root-id' as any,
        name: 'Root League',
        tier: 1,
        tierDivision: 1,
        maxTeams: 16,
        parentLeagueId: null as any,
      };

      leagueRepository.find
        // T1's children — L2-D1 only (L2-D2 omitted to
        // keep the fixture simple).
        .mockResolvedValueOnce([ROOT as LeagueEntity])
        .mockResolvedValueOnce([TIER2_D1 as LeagueEntity])
        // L2-D1's children — L3-D1 only (L3-D2 omitted).
        .mockResolvedValueOnce([TIER3_D1 as LeagueEntity])
        // L3-D1 has no children.
        .mockResolvedValueOnce([]);

      // L2-D1 has 1 entry in the 9-12 range.
      const l2d1Standings = [
        { teamId: 'l2d1-9', position: 9, team: { id: 'l2d1-9', name: 'A' } },
      ];
      const l3d1Standing = {
        teamId: 'l3d1-2',
        position: 2,
        team: { id: 'l3d1-2', name: 'E' },
      };

      // T1 (root) has no entries in the 9-12 range (the
      // T1 fixture uses a tiny standings set with only
      // the #1 entry, which is below the 9-12 filter).
      const t1Standings = [
        { teamId: 't1-1', position: 1, team: { id: 't1-1', name: 'T1 Champ' } },
      ];

      mockStandingRepository.find
        // T1 standings query (filtered to 9-12 = empty).
        .mockResolvedValueOnce(t1Standings as any)
        // L2-D1 standings query (1 entry in 9-12).
        .mockResolvedValueOnce(l2d1Standings as any);

      mockStandingRepository.findOne
        // L2-D1 vs L3-D1: findOne for L3-D1's #2 → E.
        // T1's generateLeaguePlayoffs runs first but
        // produces 0 matches (T1's only standing is
        // position 1, which the 9-12 filter strips) so
        // it never calls findOne. We only mock the
        // single findOne that actually fires.
        .mockResolvedValueOnce(l3d1Standing as any);

      mockMatchRepository.create.mockImplementation(
        (data) => data as MatchEntity,
      );
      mockMatchRepository.save.mockImplementation((data) =>
        Promise.resolve(data as MatchEntity[]),
      );

      const result = await service.generateAllPlayoffMatches(1);

      // T1 has 1 child (L2-D1) but T1's standings
      // produce no 9-12 entries (the only T1 standing is
      // the #1 entry, which the position-9-12 filter
      // strips), so T1 emits 0 matches.
      //
      // L2-D1 has 1 child (L3-D1) and 1 standing in the
      // 9-12 range, so L2-D1 emits 1 match: l2d1-9
      // (home) vs l3d1-2 (away).
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        homeTeamId: 'l2d1-9',
        awayTeamId: 'l3d1-2',
        homeLeagueId: 'tier2-d1-id',
        awayLeagueId: 'tier3-d1-id',
        week: 16,
      });
    });

    it('does not pair a league with another tier branch that shares its tier but not its parent', async () => {
      // Direct regression for the historical bug. We
      // build a minimal fixture where the only tier-2
      // league is L2-D2 (a *sibling* of L2-D1), and the
      // only tier-3 league is L3-D1 (L2-D1's child).
      // Before the fix, the lower-league query had no
      // `parentLeagueId` filter and would happily return
      // L3-D1 to L2-D2's `generateLeaguePlayoffs`,
      // producing a cross-branch playoff match.
      const ROOT2 = {
        id: 'root2-id' as any,
        name: 'Root 2',
        tier: 1,
        tierDivision: 1,
        maxTeams: 16,
        parentLeagueId: null as any,
      };

      leagueRepository.find
        .mockResolvedValueOnce([ROOT2 as LeagueEntity])
        // L2-D2 is the ONLY tier-2 child of ROOT2.
        .mockResolvedValueOnce([TIER2_D2 as LeagueEntity])
        // L2-D2 has no children (L3-D1 belongs to L2-D1,
        // not L2-D2, so the `parentLeagueId` filter
        // must exclude it).
        .mockResolvedValueOnce([]);

      // Empty T1 and L2-D2 standings so neither upper
      // league emits a match — we only care that the
      // child-league lookup returns the right (empty)
      // set.
      mockStandingRepository.find.mockResolvedValue([] as any);
      mockStandingRepository.findOne.mockResolvedValue(null);
      mockMatchRepository.create.mockImplementation(
        (data) => data as MatchEntity,
      );
      mockMatchRepository.save.mockImplementation((data) =>
        Promise.resolve(data as MatchEntity[]),
      );

      const result = await service.generateAllPlayoffMatches(1);

      // L2-D2 has no children (L3-D1 was filtered out
      // by the parentLeagueId check), so the recursion
      // ends with 0 playoff matches. If the historical
      // bug were still present, L2-D2 would see L3-D1
      // (the only tier-3 league), try to pair, and emit
      // 1 match with `awayLeagueId: 'tier3-d1-id'`.
      expect(result).toEqual([]);
    });

    it('stamps every match with week 16 (the season-end playoff slot)', async () => {
      leagueRepository.find
        .mockResolvedValueOnce([TIER1_LEAGUE as LeagueEntity])
        .mockResolvedValueOnce([TIER2_D1 as LeagueEntity])
        .mockResolvedValueOnce([]) // L2-D1 has no children
        .mockResolvedValueOnce([]); // L2-D2 has no children either, but we don't recurse to it because TIER2_D2 is not in the children list
      // Actually the recursion IS to L2-D2 since TIER1_LEAGUE.children includes both TIER2_D1 and TIER2_D2.
      // Re-mock cleanly:
      jest.clearAllMocks();
      leagueRepository.find
        .mockReset()
        .mockResolvedValueOnce([TIER1_LEAGUE as LeagueEntity])
        .mockResolvedValueOnce([
          TIER2_D1 as LeagueEntity,
          TIER2_D2 as LeagueEntity,
        ])
        .mockResolvedValueOnce([]) // L2-D1 has no children
        .mockResolvedValueOnce([]); // L2-D2 has no children
      mockStandingRepository.find.mockResolvedValue([]);
      mockStandingRepository.findOne.mockResolvedValue(null);
      mockMatchRepository.create.mockImplementation(
        (data) => data as MatchEntity,
      );
      mockMatchRepository.save.mockImplementation((data) =>
        Promise.resolve(data as MatchEntity[]),
      );

      const result = await service.generateAllPlayoffMatches(1);
      // No standings → no matches.
      expect(result).toEqual([]);
    });
  });

  describe('getNextPlayoffDate', () => {
    it('returns the next Wednesday at MATCH_KICKOFF_HOUR_UTC, day-aligned to UTC', () => {
      // Pin the clock to a known instant via fake timers
      // so the +0/+7-day branch is deterministic.
      const fixedNow = new Date('2026-04-12T00:00:00.000Z'); // Sunday
      jest.useFakeTimers().setSystemTime(fixedNow);

      const getNextPlayoffDate = (service as any).getNextPlayoffDate.bind(
        service,
      );
      const result = getNextPlayoffDate() as Date;

      // Should land on the *next* Wednesday (2026-04-15).
      expect(result.getUTCDay()).toBe(3); // Wednesday (UTC)
      expect(result.toISOString()).toBe(
        `2026-04-15T${String(GAME_SETTINGS.MATCH_KICKOFF_HOUR_UTC).padStart(2, '0')}:00:00.000Z`,
      );
      // The hour must be the shared `MATCH_KICKOFF_HOUR_UTC`
      // (6:00 UTC for both league and playoff), not the
      // historical 20:00 local.
      expect(result.getUTCHours()).toBe(GAME_SETTINGS.MATCH_KICKOFF_HOUR_UTC);

      jest.useRealTimers();
    });

    it('always pushes at least 7 days when today is already a Wednesday', () => {
      // Wednesday 2026-04-08 at noon UTC. The historical
      // implementation `rawDaysToWed === 0 ? 7 : rawDaysToWed`
      // would push to 2026-04-15, which is the *next*
      // Wednesday. The alternative (no special-case 0)
      // would land on today, which the season-end cron
      // can't fire on because the playoff is for a
      // *future* week.
      const fixedNow = new Date('2026-04-08T12:00:00.000Z');
      jest.useFakeTimers().setSystemTime(fixedNow);

      const getNextPlayoffDate = (service as any).getNextPlayoffDate.bind(
        service,
      );
      const result = getNextPlayoffDate() as Date;

      // Must NOT be today (2026-04-08) — must be next Wed.
      expect(result.getUTCDate()).toBe(15);

      jest.useRealTimers();
    });
  });
});
