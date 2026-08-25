import { TeamGenerator } from './team.generator';
import { LOGGER_SERVICE } from '@goalxi/logger';
import { TeamEntity, StadiumEntity } from '@goalxi/database';

/**
 * Spec for the post-enrichment pass in `TeamGenerator`.
 *
 * The pass turns a freshly-`createTeam()`-ed row into
 * something visible (city, foundedYear, jerseyTertiary,
 * eloRating, bio, stadium.name). The previous N+1
 * implementation issued one `teamRepo.update` per team
 * plus one `stadiumRepo.update` per stadium — 2720
 * round-trips for the 1360-team pyramid. The current
 * batched implementation issues ONE
 * `dataSource.query('UPDATE team … FROM (VALUES …)')`
 * per chunk of BATCH_CHUNK_SIZE=500 plus one
 * `dataSource.query('UPDATE stadium … FROM (VALUES …)')`
 * per chunk — typically 3 + 3 round-trips total.
 *
 * The "behaviour" cases still pin the per-row content
 * (city prefix extraction, "中国" fallback, ELO
 * scaling). The "performance" cases pin the round-trip
 * count for a 1360-team load, and the "tripwire" case
 * pins the source-level `dataSource.query` pattern so
 * a future refactor can't silently re-introduce the
 * N+1.
 */
describe('TeamGenerator — post-enrich (batched)', () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  };

  function build() {
    const teamRepo = {
      find: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    };
    const playerRepo = { find: jest.fn() };
    const staffRepo = { find: jest.fn() };
    const stadiumRepo = {
      find: jest.fn(),
    };
    const leagueRepo = { find: jest.fn() };
    const dataSource = {
      manager: {
        findOne: jest.fn(),
      },
      // The new batched enrichment path issues raw
      // `dataSource.query('UPDATE … FROM (VALUES …)')`
      // calls; the previous N+1 path went through
      // `teamRepo.update` / `stadiumRepo.update`. We
      // mock the raw query and assert on the SQL +
      // bind parameters instead.
      query: jest.fn().mockResolvedValue([]),
    };
    return {
      gen: new TeamGenerator(
        mockLogger as any,
        teamRepo as any,
        playerRepo as any,
        staffRepo as any,
        stadiumRepo as any,
        leagueRepo as any,
        dataSource as any,
      ),
      teamRepo,
      playerRepo,
      staffRepo,
      stadiumRepo,
      leagueRepo,
      dataSource,
    };
  }

  /**
   * Inspect the most recent batched `dataSource.query`
   * call and return the bind parameter list. Useful
   * for assertions like "the team id T1 was in the
   * first VALUES tuple" without coupling to the exact
   * SQL string.
   */
  function lastBindParams(mock: jest.Mock): unknown[] {
    const calls = mock.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    return calls[calls.length - 1][1] as unknown[];
  }

  function firstBindParams(mock: jest.Mock): unknown[] {
    const calls = mock.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    return calls[0][1] as unknown[];
  }

  beforeEach(() => {
    mockLogger.info.mockClear();
  });

  it('extracts the Chinese city prefix from "北京FC"', async () => {
    const { gen, teamRepo, stadiumRepo, dataSource } = build();
    const t = {
      id: 'T1',
      name: '北京FC',
      leagueId: 'L1',
      botLevel: 5,
    } as unknown as TeamEntity;
    teamRepo.find.mockResolvedValue([t]);
    stadiumRepo.find.mockResolvedValue([
      { id: 'S1', teamId: 'T1' } as StadiumEntity,
    ]);

    await (gen as any).enrichAllTeams();

    // Two batched queries: team update + stadium
    // update. (Was 2 single-row updates before the
    // batch refactor.)
    expect(dataSource.query).toHaveBeenCalledTimes(2);

    // Team update: the bind params are 6-tuples
    // (id, city, foundedYear, jerseyColorTertiary,
    // eloRating, bio) per row.
    const teamParams = firstBindParams(dataSource.query);
    expect(teamParams[0]).toBe('T1');
    expect(teamParams[1]).toBe('北京');
    expect(teamParams[2]).toBeGreaterThanOrEqual(1950);
    expect(teamParams[2]).toBeLessThanOrEqual(2010);
    expect(teamParams[4]).toBe(1500); // botLevel 5 → mid ELO
    expect(teamParams[5]).toContain('北京');
    expect(teamParams[3]).toMatch(/^#[0-9A-F]{6}$/i);

    // Stadium update: the bind params are 2-tuples
    // (id, name) per row.
    const stadiumParams = lastBindParams(dataSource.query);
    expect(stadiumParams[0]).toBe('S1');
    expect(stadiumParams[1]).toBe('北京体育中心');
  });

  it('falls back to "中国" when no city prefix is found', async () => {
    const { gen, teamRepo, stadiumRepo, dataSource } = build();
    const t = {
      id: 'T2',
      name: 'FC',
      leagueId: 'L1',
      botLevel: 5,
    } as unknown as TeamEntity;
    teamRepo.find.mockResolvedValue([t]);
    stadiumRepo.find.mockResolvedValue([]);

    await (gen as any).enrichAllTeams();

    // Only the team update; no stadium row to update.
    expect(dataSource.query).toHaveBeenCalledTimes(1);
    const teamParams = firstBindParams(dataSource.query);
    expect(teamParams[1]).toBe('中国');
  });

  it('scales ELO with botLevel', async () => {
    const { gen, teamRepo, stadiumRepo, dataSource } = build();
    const t = {
      id: 'T3',
      name: '上海United',
      leagueId: 'L1',
      botLevel: 7,
    } as unknown as TeamEntity;
    teamRepo.find.mockResolvedValue([t]);
    stadiumRepo.find.mockResolvedValue([]);

    await (gen as any).enrichAllTeams();

    // 1500 + (7-5)*20 = 1540
    const teamParams = firstBindParams(dataSource.query);
    expect(teamParams[4]).toBe(1540);
  });

  /**
   * The reason this whole refactor exists: a 1360-team
   * load must NOT issue 1360+ team updates. With
   * BATCH_CHUNK_SIZE=500 the upper bound is ⌈1360/500⌉ = 3
   * team chunks + 3 stadium chunks = 6 round-trips
   * total — three orders of magnitude fewer than the
   * 2720 of the N+1 implementation.
   */
  it('full-pyramid load issues 6 round-trips, not 2720', async () => {
    const { gen, teamRepo, stadiumRepo, dataSource } = build();
    // 1360 teams, all with a matching stadium.
    const teams: TeamEntity[] = [];
    const stadiums: StadiumEntity[] = [];
    for (let i = 0; i < 1360; i++) {
      const id = `T${i}`;
      // City names cycle through 81 L2_CITIES; the
      // city prefix parser handles every one.
      teams.push({
        id,
        name: `测试FC${i}`,
        leagueId: 'L1',
        botLevel: 5,
      } as unknown as TeamEntity);
      stadiums.push({
        id: `S${i}`,
        teamId: id,
      } as unknown as StadiumEntity);
    }
    teamRepo.find.mockResolvedValue(teams);
    stadiumRepo.find.mockResolvedValue(stadiums);

    await (gen as any).enrichAllTeams();

    // ⌈1360 / 500⌉ = 3 team chunks + 3 stadium chunks
    // = 6 queries.
    expect(dataSource.query).toHaveBeenCalledTimes(6);
    // The shape of each query: `UPDATE … FROM (VALUES …)`.
    // We assert at least one is a team update and at
    // least one is a stadium update.
    const sqls = dataSource.query.mock.calls.map((c) => c[0] as string);
    expect(sqls.some((s) => s.includes('UPDATE team'))).toBe(true);
    expect(sqls.some((s) => s.includes('UPDATE stadium'))).toBe(true);
  });

  /**
   * Source-level tripwire. The performance contract
   * above asserts on a fixed 1360-team load; this
   * tripwire asserts on the SOURCE pattern so a
   * future "simplification" that goes back to
   * `teamRepo.update(team.id, ...)` in a loop fails at
   * test time, not in production when init slows back
   * down to 5-8s.
   */
  it('source-level: enrichment uses dataSource.query, not per-team update', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.join(__dirname, 'team.generator.ts'),
      'utf8',
    );
    // Strip comments so a docstring mention of the
    // old `teamRepo.update(team.id, ...)` pattern (the
    // "before" half of the before/after note) doesn't
    // trip the test on its own prose.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

    // The batched path must use raw `dataSource.query`
    // for both tables.
    expect(code).toMatch(/dataSource\.query\([^,]+,\s*params\)/);
    // The per-team update() pattern in a for-of loop
    // is the regression we are guarding against.
    // Match the shape `for (const ... of ...) { ...
    // teamRepo.update ... }` and assert the inside
    // does NOT mention `teamRepo.update` or
    // `stadiumRepo.update`.
    const forLoops = code.match(/for\s*\([^)]+\)\s*\{[\s\S]*?\n\s*\}/g) ?? [];
    for (const loop of forLoops) {
      // Skip the helper batch loops in
      // batchUpdateTeams / batchUpdateStadiumNames —
      // they iterate chunks and call dataSource.query
      // (which is what we want). Only fail if a
      // per-team .update() shows up in a loop.
      expect(loop).not.toMatch(/teamRepo\.update\(/);
      expect(loop).not.toMatch(/stadiumRepo\.update\(/);
    }
  });
});
