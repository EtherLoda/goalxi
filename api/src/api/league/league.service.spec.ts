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
  let recentFormChain: {
    select: jest.Mock;
    addSelect: jest.Mock;
    from: jest.Mock;
    setParameter: jest.Mock;
    getRawMany: jest.Mock;
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

    // The recent-form strip used to be `MatchEntity.find(...)` over the
    // WHOLE season, filtered per team in Node. It's now one window-
    // function query (`loadRecentForm`), so the stub is a fluent chain
    // ending in `getRawMany`. Kept as a spy rather than a real query
    // builder because these tests assert on the STANDINGS sort key.
    recentFormChain = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    jest
      .spyOn(MatchEntity, 'createQueryBuilder')
      .mockReturnValue(recentFormChain as any);
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

  it('REGRESSION: builds the recent form with ONE window-function query, not a full-season load', async () => {
    // The old code did `MatchEntity.find({ where: { leagueId, season,
    // status: 'completed' }, relations: ['homeTeam','awayTeam'],
    // order: { completedAt: 'DESC' } })` — the WHOLE season (240 matches
    // + 480 joined team rows) — then `.filter(...)` over that array once
    // per standing. That's O(teams x matches) = 3,840 comparisons per
    // request on a `@Public()` endpoint, and no `match` index covered
    // the predicate, so it was a seq scan + sort on every page view.
    //
    // Now `loadRecentForm` issues one query that expands each match into
    // a row per participant, ranks with ROW_NUMBER() PARTITION BY team,
    // and keeps the top 5. These assertions pin that shape so a
    // regression back to a full-season load is caught.
    await service.getStandings('some-league' as Uuid, 1);

    // A single FROM subquery, not the entity table.
    expect(recentFormChain.from).toHaveBeenCalledTimes(1);
    const sql = recentFormChain.from.mock.calls[0][0] as string;

    // Window function, partitioned per team and ordered most-recent-first.
    expect(sql).toContain('ROW_NUMBER() OVER');
    expect(sql).toMatch(
      /PARTITION BY m\.home_team_id\s+ORDER BY m\.completed_at DESC NULLS LAST, m\.id DESC/,
    );
    expect(sql).toMatch(
      /PARTITION BY m\.away_team_id\s+ORDER BY m\.completed_at DESC NULLS LAST, m\.id DESC/,
    );
    // Bounded to the top N per team, and N is a bound parameter.
    expect(sql).toContain('WHERE rn <= :limit');
    expect(recentFormChain.setParameter).toHaveBeenCalledWith('limit', 5);
    // Scoped to this league + season + completed only.
    expect(sql).toContain('m.league_id = :leagueId');
    expect(sql).toContain('m.season = :season');
    expect(sql).toContain("m.status = 'completed'");
    // Opponent names come from the join rather than a relation load.
    expect(sql).toContain('ht.name AS home_team_name');
    expect(sql).toContain('at.name AS away_team_name');
    // getRawMany, not getMany — we want the aliased scalar columns.
    expect(recentFormChain.getRawMany).toHaveBeenCalled();
  });

  it('REGRESSION: groups the recent-form rows per team and keeps them newest-first', async () => {
    // The outer SELECT has no ORDER BY of its own, so `loadRecentForm`
    // re-sorts each team's slice — the DTO's `recentMatches[0]` is
    // "last match" and must not depend on Postgres row order.
    recentFormChain.getRawMany.mockResolvedValueOnce([
      row('team-A', '2026-03-01T00:00:00Z'),
      row('team-A', '2026-04-01T00:00:00Z'),
      row('team-A', '2026-02-01T00:00:00Z'),
      row('team-B', '2026-04-02T00:00:00Z'),
    ]);

    qbChain.getMany.mockResolvedValueOnce([
      {
        teamId: 'team-A',
        team: { name: 'A' } as any,
        points: 3,
        wins: 1,
        draws: 0,
        losses: 0,
        goalsFor: 2,
        goalsAgainst: 0,
        position: 1,
      },
      {
        teamId: 'team-B',
        team: { name: 'B' } as any,
        points: 0,
        wins: 0,
        draws: 0,
        losses: 1,
        goalsFor: 0,
        goalsAgainst: 2,
        position: 2,
      },
    ]);

    const out = await service.getStandings('some-league' as Uuid, 1);

    const teamA = out.find((r) => r.teamId === 'team-A')!;
    expect(teamA.recentMatches).toHaveLength(3);
    expect(
      (teamA.recentMatches as any[]).map((m) => m.scheduledAt),
    ).toEqual([
      '2026-04-01T00:00:00Z',
      '2026-03-01T00:00:00Z',
      '2026-02-01T00:00:00Z',
    ]);

    // A team with no rows at all gets an empty array, not undefined —
    // the DTO declares `recentMatches` as a list, and `undefined` would
    // break any FE that maps over it.
    const teamB = out.find((r) => r.teamId === 'team-B')!;
    expect(teamB.recentMatches).toHaveLength(1);
    expect((teamB.recentMatches as any[])[0].scheduledAt).toBe(
      '2026-04-02T00:00:00Z',
    );

    // And a standing whose teamId never appears in the result set.
    qbChain.getMany.mockResolvedValueOnce([
      {
        teamId: 'team-Z',
        team: { name: 'Z' } as any,
        points: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        position: 1,
      },
    ]);
    const out2 = await service.getStandings('some-league' as Uuid, 1);
    expect(out2[0].recentMatches).toEqual([]);
  });
});

/** One raw recent-form row as the SQL aliases it. */
function row(teamId: string, completedAtIso: string) {
  return {
    teamId,
    homeTeamId: teamId,
    awayTeamId: 'other',
    homeScore: 1,
    awayScore: 0,
    homeTeamName: 'Home',
    awayTeamName: 'Away',
    completedAtIso,
    scheduledAtIso: completedAtIso,
  };
}
