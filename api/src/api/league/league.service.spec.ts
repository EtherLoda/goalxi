import { Uuid } from '@/common/types/common.type';
import {
  ArchivedSeasonResultEntity,
  LeagueEntity,
  LeagueStandingEntity,
  MatchEntity,
  SeasonResultEntity,
} from '@goalxi/database';
import { LeagueService } from './league.service';

describe('LeagueService.getPastSeasons (regression for #20)', () => {
  let service: LeagueService;

  // The service uses static `Entity.find` calls so we monkey-patch
  // the repos rather than going through the DI container. Easier,
  // and matches how other services in this repo are tested.
  const repos: {
    league: jest.Mock;
    season: jest.Mock;
    archived: jest.Mock;
  } = {
    league: jest.fn(),
    season: jest.fn(),
    archived: jest.fn(),
  };

  beforeAll(() => {
    service = new LeagueService();
    jest
      .spyOn(LeagueEntity, 'findOne')
      .mockImplementation((opts: any) => repos.league(opts));
    jest
      .spyOn(SeasonResultEntity, 'find')
      .mockImplementation((opts: any) => repos.season(opts));
    jest
      .spyOn(ArchivedSeasonResultEntity, 'find')
      .mockImplementation((opts: any) => repos.archived(opts));
  });

  afterEach(() => {
    repos.league.mockReset();
    repos.season.mockReset();
    repos.archived.mockReset();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('returns the union of current and archived seasons, sorted descending, deduplicated', async () => {
    repos.season.mockResolvedValueOnce([{ season: 1 }, { season: 2 }]);
    repos.archived.mockResolvedValueOnce([
      { season: 2 },
      { season: 3 },
      { season: 4 },
    ]);

    const out = await service.getPastSeasons(
      '11111111-1111-1111-1111-111111111111' as Uuid,
    );

    expect(out).toEqual([
      { season: 4 },
      { season: 3 },
      { season: 2 },
      { season: 1 },
    ]);
    // Both queries ran with the same leagueId filter.
    expect(repos.season).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          leagueId: '11111111-1111-1111-1111-111111111111',
        }),
        select: ['season'],
      }),
    );
    expect(repos.archived).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          leagueId: '11111111-1111-1111-1111-111111111111',
        }),
        select: ['season'],
      }),
    );
  });

  it('returns an empty array when the league has no seasons yet', async () => {
    repos.season.mockResolvedValueOnce([]);
    repos.archived.mockResolvedValueOnce([]);

    const out = await service.getPastSeasons(
      '22222222-2222-2222-2222-222222222222' as Uuid,
    );
    expect(out).toEqual([]);
  });

  it('resolves a slug-style name to a UUID before querying', async () => {
    // "premier-league" -> "Premier League" lookup -> resolved UUID.
    repos.league.mockResolvedValueOnce({
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Premier League',
    } as any);
    repos.season.mockResolvedValueOnce([{ season: 1 }]);
    repos.archived.mockResolvedValueOnce([]);

    const out = await service.getPastSeasons('premier-league' as Uuid);

    expect(out).toEqual([{ season: 1 }]);
    expect(repos.league).toHaveBeenCalledWith(
      expect.objectContaining({ where: { name: 'Premier League' } }),
    );
    expect(repos.season).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { leagueId: '11111111-1111-1111-1111-111111111111' },
      }),
    );
  });

  it('throws NotFound when the slug does not match any league', async () => {
    repos.league.mockResolvedValueOnce(null);

    await expect(
      service.getPastSeasons('nope-not-a-league' as Uuid),
    ).rejects.toThrow(/League "nope-not-a-league" not found/);
  });
});


/**
 * Regression spec for the SQL sort fix in getStandings.
 *
 * Before: the SQL was `ORDER BY points DESC, goalsFor DESC` and the
 * service did an in-memory re-sort by points, GD, GF. That double
 * work (DB sort + memory sort + position renumber) was a waste of an
 * RTT on every standings page load. After: the SQL is
 * `ORDER BY points DESC, (goalsFor - goalsAgainst) DESC, goalsFor DESC`
 * and the service only renumbers positions from the (now-sorted)
 * result index.
 *
 * The QueryBuilder chain itself is mocked: we only assert that
 * (a) the orderBy / addOrderBy calls were made in the right order
 * with the right arguments, and (b) the response positions reflect
 * the DB sort (i.e. 1..N from result order, not 0s).
 */
describe('LeagueService.getStandings (SQL sort regression)', () => {
  let service: LeagueService;
  let qbChain: {
    leftJoinAndSelect: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    addOrderBy: jest.Mock;
    getMany: jest.Mock;
  };

  beforeEach(() => {
    service = new LeagueService();
    qbChain = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    jest
      .spyOn(LeagueStandingEntity, 'createQueryBuilder')
      .mockReturnValue(qbChain as any);
    jest.spyOn(MatchEntity, 'find').mockResolvedValue([] as any);
    // resolveLeagueId hits LeagueEntity.findOne for slug inputs
    // (the test calls getStandings with 'some-league', not a UUID)
    // and runs BEFORE the QueryBuilder mock, so we need this spy
    // active in every test of this block. Return a real-shaped
    // league so the slug resolves to a UUID and the QueryBuilder
    // chain gets reached.
    jest.spyOn(LeagueEntity, 'findOne').mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000099',
    } as any);
  });

  // No local afterEach: the outer afterAll (line 46-48) handles
  // jest.restoreAllMocks() at the end of the file. A local
  // afterEach here would wipe the getPastSeasons block\'s
  // beforeAll mocks between tests, which breaks slug
  // resolution (resolveLeagueId -> LeagueEntity.findOne) for
  // every test after the first one in this block.

  it('builds the SQL with the canonical deterministic sort key', async () => {
    await service.getStandings('some-league' as Uuid, 1);

    // Points first, then the computed goal-difference expression, then
    // goalsFor, then the deterministic tie-breaks. Any future contributor
    // reordering or truncating these changes ranking semantics for
    // tied teams, so we pin the full chain here.
    //
    // Keys 4-6 exist because the previous three-key sort left a total tie
    // to Postgres heap order — and promotion, relegation, playoff
    // qualification and prize money all select by exact `position === N`,
    // so that tie silently decided who was promoted and who was paid.
    expect(qbChain.orderBy).toHaveBeenCalledWith('s.points', 'DESC');
    expect(qbChain.addOrderBy).toHaveBeenCalledTimes(5);
    expect(qbChain.addOrderBy).toHaveBeenNthCalledWith(
      1,
      's.goalsFor - s.goalsAgainst',
      'DESC',
    );
    expect(qbChain.addOrderBy).toHaveBeenNthCalledWith(2, 's.goalsFor', 'DESC');
    expect(qbChain.addOrderBy).toHaveBeenNthCalledWith(3, 's.wins', 'DESC');
    expect(qbChain.addOrderBy).toHaveBeenNthCalledWith(
      4,
      's.goalsAgainst',
      'ASC',
    );
    expect(qbChain.addOrderBy).toHaveBeenNthCalledWith(5, 's.teamId', 'ASC');
  });

  it('renumbers positions 1..N from the DB-sorted result order (no in-memory sort)', async () => {
    // Return rows in the order the SQL would have produced:
    //   team-A: 9 pts, GD +5, GF 10
    //   team-B: 9 pts, GD +3, GF  8  (same points, lower GD)
    //   team-C: 6 pts, GD +1, GF  5
    // Pre-fix the service would have re-sorted these in JS and
    // re-numbered positions; post-fix the SQL returns them already
    // in rank order and we just stamp 1..3.
    qbChain.getMany.mockResolvedValueOnce([
      {
        teamId: 'team-A',
        team: { name: 'A' } as any,
        points: 9,
        wins: 3,
        draws: 0,
        losses: 0,
        goalsFor: 10,
        goalsAgainst: 5,
        position: 999, // garbage from DB; service must renumber
      },
      {
        teamId: 'team-B',
        team: { name: 'B' } as any,
        points: 9,
        wins: 3,
        draws: 0,
        losses: 0,
        goalsFor: 8,
        goalsAgainst: 5,
        position: 999,
      },
      {
        teamId: 'team-C',
        team: { name: 'C' } as any,
        points: 6,
        wins: 2,
        draws: 0,
        losses: 1,
        goalsFor: 5,
        goalsAgainst: 4,
        position: 999,
      },
    ] as any);

    const out = await service.getStandings('some-league' as Uuid, 1);

    expect(out.map((r) => r.teamName)).toEqual(['A', 'B', 'C']);
    expect(out.map((r) => r.position)).toEqual([1, 2, 3]);
    // GD is computed for the DTO from the (goalsFor - goalsAgainst)
    // fields the entity actually has, since the entity column
    // isn\'t maintained by the update path.
    expect(out.map((r) => r.goalDifference)).toEqual([5, 3, 1]);
  });

  it('preserves the GD tiebreak via the SQL expression, not in-memory', async () => {
    // Two teams with identical points and goalsFor, differing only
    // in goalsAgainst. Pre-fix the memory sort would have
    // disambiguated them; post-fix the SQL\'s `goalsFor - goalsAgainst`
    // expression does. This test pins that the renumbering walks
    // the rows in the order the QueryBuilder returns them (i.e. we
    // trust the SQL sort, we don\'t re-sort).
    qbChain.getMany.mockResolvedValueOnce([
      {
        teamId: 'high-gd',
        team: { name: 'HighGD' } as any,
        points: 6,
        wins: 2,
        draws: 0,
        losses: 1,
        goalsFor: 5,
        goalsAgainst: 1,
        position: 999,
      },
      {
        teamId: 'low-gd',
        team: { name: 'LowGD' } as any,
        points: 6,
        wins: 2,
        draws: 0,
        losses: 1,
        goalsFor: 5,
        goalsAgainst: 4,
        position: 999,
      },
    ] as any);

    const out = await service.getStandings('some-league' as Uuid, 1);

    expect(out.map((r) => r.teamName)).toEqual(['HighGD', 'LowGD']);
    expect(out[0].position).toBe(1);
    expect(out[1].position).toBe(2);
  });
});
