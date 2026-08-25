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

/**
 * Spec for the `pickNamesForLeague` pool builder.
 *
 * The new name generator pulls from three styles
 * (suffix / mascot / sponsor) and shuffles the
 * candidate pool before picking the first `count`
 * unique names. The cross-league uniqueness Set
 * is the key piece that prevents a L1 "北京FC" and
 * a L2 "北京FC" from coexisting (the first 8 entries
 * of `L1_CITIES` and `L2_CITIES` are identical).
 *
 * `pickNamesForLeague` is a module-private function;
 * we reach in via `(TeamGenerator as any)` or the
 * same source-read pattern the other tripwires use.
 * Reaching in keeps the test honest: a real
 * behaviour-level failure surfaces at run time, not
 * at source-read time.
 */
describe('TeamGenerator — pickNamesForLeague (3-style name pool)', () => {
  // The pool builder is a module-private function
  // (`pickNamesForLeague`); we exercise the public
  // `generateAllTeams` end-to-end with a mocked
  // league / team repo and assert on the names the
  // builder picked. The test catches real bugs at
  // run time, not just source-level tripwires.
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  };
  const generatorModule = require('./team.generator');

  function buildGen() {
    const teamRepo = {
      // `enrichAllTeams` calls `teamRepo.find()` to
      // pull the freshly-created teams; default to
      // an empty list so the post-enrichment pass
      // short-circuits. Individual tests can
      // override.
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    };
    const playerRepo = { find: jest.fn() };
    const staffRepo = { find: jest.fn() };
    const stadiumRepo = { find: jest.fn().mockResolvedValue([]) };
    const leagueRepo = { find: jest.fn() };
    const dataSource = {
      manager: {
        findOne: jest.fn().mockResolvedValue(null),
        // `createTeam` (in libs/database) calls
        // `manager.create(...)` and `manager.save(...)`
        // for every child row. We capture the
        // `.name` field via the `create` mock; `save`
        // is a no-op that returns whatever was passed.
        create: jest.fn((_Entity: unknown, data: any) => ({
          id: 'mock-id',
          ...((data as object) ?? {}),
        })),
        save: jest.fn(async (rows: any) => rows),
        // The `createTeam` helper also issues raw
        // `query` calls inside `scrubManagerSpecificData`
        // for the player soft-delete. Stub it.
        query: jest.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
        // `scrubManagerSpecificData` builds a
        // `createQueryBuilder().update().set().where()`
        // chain for the player soft-delete. Stub it.
        createQueryBuilder: jest.fn(() => {
          const chain: any = {};
          for (const m of ['update', 'set', 'where', 'andWhere']) {
            chain[m] = jest.fn(() => chain);
          }
          chain.execute = jest.fn().mockResolvedValue(undefined);
          return chain;
        }),
      },
      query: jest.fn().mockResolvedValue([]),
      transaction: jest.fn(async (cb: any) =>
        cb({ manager: dataSource.manager }),
      ),
    };
    return {
      gen: new (generatorModule.TeamGenerator as any)(
        mockLogger as any,
        teamRepo as any,
        playerRepo as any,
        staffRepo as any,
        stadiumRepo as any,
        leagueRepo as any,
        dataSource as any,
      ),
      teamRepo,
      leagueRepo,
      dataSource,
    };
  }

  it('emits `count` unique names that cover all three styles', async () => {
    // 8-city L1 league, 16 teams. The pool has
    // 8 × 29 = 232 candidates; the picker should
    // pull 16 unique names covering all three
    // styles (suffix / mascot / sponsor).
    const { gen, leagueRepo, dataSource } = buildGen();
    const league = {
      id: 'L-1' as Uuid,
      tier: 1,
      tierDivision: 1,
      maxTeams: 16,
      promotionSlots: 0,
      playoffSlots: 0,
      relegationSlots: 0,
    } as any;
    leagueRepo.find.mockResolvedValue([league]);
    // Capture the team names from the
    // `manager.create()` call. The dataSource's
    // `manager.create` is also called for player /
    // staff / finance rows that each have their own
    // `name` field — those aren't team names. Filter
    // to rows that carry `isBot` (only TeamEntity
    // rows do) so the assertion below is on team
    // names only.
    const createdNames: string[] = [];
    dataSource.manager.create = jest.fn(
      (_Entity: unknown, data: any) => {
        if (
          data &&
          typeof data.name === 'string' &&
          typeof data.isBot === 'boolean'
        ) {
          createdNames.push(data.name);
        }
        return { id: 'mock-id', ...data };
      },
    );

    await gen.generateAllTeams();

    // 16 unique names for a 16-team league.
    expect(createdNames).toHaveLength(16);
    expect(new Set(createdNames).size).toBe(16);
    // All three styles appear: at least one
    // city+suffix (e.g. `北京FC`), one city+mascot
    // (e.g. `北京雄狮`), one city+sponsor (e.g.
    // `北京能源`). The 3 mascots × 12 + 5 suffixes +
    // 12 sponsors × 8 cities mean each style has
    // 96 / 40 / 96 candidates, so 16 picks should
    // easily cover all three.
    const SUFFIX_VALUES = ['FC', 'United', 'Club', 'City', 'Athletic'];
    const MASCOT_VALUES = [
      '雄狮', '蓝鲸', '火焰', '飞鹰', '金龙', '白虎', '玄武', '朱雀',
      '麒麟', '猎豹', '战狼', '凤凰',
    ];
    const SPONSOR_VALUES = [
      '能源', '钢铁', '通讯', '航空', '金融', '物流', '化工', '电子',
      '重工', '汽车', '制药', '建工',
    ];
    const hasSuffix = createdNames.some((n) =>
      SUFFIX_VALUES.some((s) => n.endsWith(s)),
    );
    const hasMascot = createdNames.some((n) =>
      MASCOT_VALUES.some((m) => n.endsWith(m)),
    );
    const hasSponsor = createdNames.some((n) =>
      SPONSOR_VALUES.some((s) => n.endsWith(s)),
    );
    expect(hasSuffix).toBe(true);
    expect(hasMascot).toBe(true);
    expect(hasSponsor).toBe(true);
  });

  it('cross-league: L1 and L2 never share a name (the original collision bug)', async () => {
    // The first 8 entries of L1_CITIES and L2_CITIES
    // are identical (`北京`, `上海`, …). With the
    // old global-counter picker, the L1 first team
    // got `北京FC` and the L2 first team ALSO got
    // `北京FC` — two teams with the same name in
    // different leagues, confusing on the standings
    // page. The new code uses a single `Set<string>`
    // across the whole init so a L1 → L2 collision
    // is impossible.
    const { gen, leagueRepo, dataSource } = buildGen();
    const l1 = {
      id: 'L1' as Uuid,
      tier: 1,
      tierDivision: 1,
      maxTeams: 8,
      promotionSlots: 0,
      playoffSlots: 0,
      relegationSlots: 0,
    } as any;
    const l2 = {
      id: 'L2' as Uuid,
      tier: 2,
      tierDivision: 1,
      maxTeams: 8,
      promotionSlots: 0,
      playoffSlots: 0,
      relegationSlots: 0,
    } as any;
    leagueRepo.find.mockResolvedValue([l1, l2]);
    const createdNames: string[] = [];
    dataSource.manager.create = jest.fn(
      (_Entity: unknown, data: any) => {
        if (
          data &&
          typeof data.name === 'string' &&
          typeof data.isBot === 'boolean'
        ) {
          createdNames.push(data.name);
        }
        return { id: 'mock-id', ...data };
      },
    );

    await gen.generateAllTeams();

    // 8 L1 + 8 L2 = 16 unique names; no collisions.
    // We filter to TeamEntity rows (which carry
    // `isBot`) because `manager.create` is also
    // called for player / staff / finance rows that
    // each have their own `name` field — those
    // aren't team names.
    expect(createdNames).toHaveLength(16);
    expect(new Set(createdNames).size).toBe(16);
  });

  it('falls back to `第N联队` only when the pool is genuinely exhausted', async () => {
    // Configure a degenerate case: a 1-team league
    // with an exhausted `usedNames` Set, so the
    // pool builder must reach the fallback. The
    // standard 16-team pyramid never hits this; the
    // case pins the fallback contract so a future
    // "let me bump maxTeams to 200" change can't
    // silently overflow without a name.
    const { gen, leagueRepo, dataSource } = buildGen();
    const league = {
      id: 'L-BIG' as Uuid,
      tier: 1,
      tierDivision: 1,
      // 300 > the 232-candidate L1 pool → fallback
      // must fire for the trailing 68 names.
      maxTeams: 300,
      promotionSlots: 0,
      playoffSlots: 0,
      relegationSlots: 0,
    } as any;
    leagueRepo.find.mockResolvedValue([league]);
    const createdNames: string[] = [];
    dataSource.manager.create = jest.fn(
      (_Entity: unknown, data: any) => {
        if (
          data &&
          typeof data.name === 'string' &&
          typeof data.isBot === 'boolean'
        ) {
          createdNames.push(data.name);
        }
        return { id: 'mock-id', ...data };
      },
    );

    await gen.generateAllTeams();

    expect(createdNames).toHaveLength(300);
    // The trailing entries should include the
    // fallback `第N联队` shape.
    expect(createdNames.slice(232)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^第\d+联队$/)]),
    );
  });

  it('source-level: the team generator builds names from all 3 styles', () => {
    // The behavioural tests above cover the
    // contract; this tripwire pins the source so a
    // future "simplification" that drops a style
    // (e.g. drops MASCOTS to "keep the code simple")
    // fails at test time, not in production where
    // every team ends up with the same `北京FC`-
    // style name.
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.join(__dirname, 'team.generator.ts'),
      'utf8',
    );
    expect(source).toMatch(/MASCOTS\s*=/);
    expect(source).toMatch(/SPONSORS\s*=/);
    expect(source).toMatch(/SUFFIXES\s*=/);
    // The three-style NAME_STYLES table is the
    // single source of truth for the picker.
    expect(source).toMatch(/NAME_STYLES/);
  });
});
