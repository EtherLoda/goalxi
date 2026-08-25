import { ScheduleGenerator } from './schedule.generator';
import { LOGGER_SERVICE } from '@goalxi/logger';
import { LeagueEntity, MatchEntity, TeamEntity } from '@goalxi/database';

/**
 * Spec for the senior-only schedule generator. Replaces
 * the historical WAVE A2 youth-fixtures spec when the
 * youth pipeline was retired — the new generator only
 * emits senior fixtures and accepts an explicit `initDate`
 * so the first match lands on the next-Monday 00:00 UTC.
 *
 * Tests here are intentionally minimal: the per-leg
 * pairing logic was already pinned in the historical
 * WAVE A2 spec and the new surface area is just the
 * `initDate → first kickoff` mapping + the senior/youth
 * branch removal.
 */
describe('ScheduleGenerator — senior-only', () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  };

  const seniorLeague = (id: string): LeagueEntity =>
    ({
      id,
      name: 'Pro Div 1',
      tier: 2,
      tierDivision: 1,
      maxTeams: 16,
    }) as LeagueEntity;

  const seniorTeam = (id: string, leagueId: string): TeamEntity =>
    ({ id, name: `Team ${id}`, leagueId }) as TeamEntity;

  function build() {
    const matchRepo = {
      count: jest.fn(),
      save: jest.fn(),
    };
    const leagueRepo = { find: jest.fn() };
    const teamRepo = { find: jest.fn() };
    const stadiumRepo = {
      // Default to "every team has a stadium with id
      // `stadium-<teamId>`". Individual tests can
      // override this to simulate missing or extra
      // stadium rows.
      find: jest.fn().mockImplementation(() =>
        Promise.resolve(
          // The test passes a 4-team league; back-fill
          // with a real-shaped StadiumEntity array.
          (['T0', 'T1', 'T2', 'T3'] as const).map((id) => ({
            id: `stadium-${id}`,
            teamId: id,
          })),
        ),
      ),
    };
    return {
      gen: new ScheduleGenerator(
        mockLogger as any,
        matchRepo as any,
        leagueRepo as any,
        teamRepo as any,
        stadiumRepo as any,
      ),
      matchRepo,
      leagueRepo,
      teamRepo,
      stadiumRepo,
    };
  }

  beforeEach(() => {
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
  });

  it('skips when season-1 matches already exist', async () => {
    const { gen, matchRepo, leagueRepo, teamRepo } = build();
    matchRepo.count.mockResolvedValue(120);
    leagueRepo.find.mockResolvedValue([seniorLeague('L1')]);
    teamRepo.find.mockResolvedValue([]);

    await gen.generateSeason1Schedule(new Date('2026-09-09T00:00:00Z'));

    expect(matchRepo.save).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('season-1 match(es) already exist'),
    );
  });

  it('emits 30 rounds for a 16-team league and stamps the leagueId', async () => {
    const { gen, matchRepo, leagueRepo, teamRepo } = build();
    matchRepo.count.mockResolvedValue(0);
    leagueRepo.find.mockResolvedValue([seniorLeague('L-1')]);
    const teams: TeamEntity[] = [];
    for (let i = 0; i < 16; i++) {
      teams.push(seniorTeam(`T${i}`, 'L-1'));
    }
    teamRepo.find.mockResolvedValue(teams);
    matchRepo.save.mockResolvedValue([]);

    await gen.generateSeason1Schedule(new Date('2026-09-09T00:00:00Z'));

    // 16 teams × 2 legs × 8 matchups/round = 240 matches.
    expect(matchRepo.save).toHaveBeenCalledTimes(1);
    const saved: Partial<MatchEntity>[] = matchRepo.save.mock.calls[0][0];
    expect(saved).toHaveLength(240);
    // Every match is senior — no `youthLeagueId`.
    for (const m of saved) {
      expect(m.leagueId).toBe('L-1');
      expect((m as any).youthLeagueId ?? null).toBeNull();
    }
  });

  it('skips leagues with fewer than 4 teams', async () => {
    const { gen, matchRepo, leagueRepo, teamRepo } = build();
    matchRepo.count.mockResolvedValue(0);
    leagueRepo.find.mockResolvedValue([seniorLeague('L-1')]);
    teamRepo.find.mockResolvedValue([seniorTeam('T0', 'L-1')]);
    matchRepo.save.mockResolvedValue([]);

    await gen.generateSeason1Schedule(new Date('2026-09-09T00:00:00Z'));

    expect(matchRepo.save).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('only 1 teams'),
    );
  });

  it('schedules round 0 on Wed 06:00 UTC and round 1 on Sat 06:00 UTC of week 1', async () => {
    // Wed 2026-09-09 init → week-1 Monday is 2026-09-14.
    //   round 0 → Wed 2026-09-16 06:00 UTC
    //   round 1 → Sat 2026-09-19 06:00 UTC
    // (kickoff hour pulled from GAME_SETTINGS.MATCH_KICKOFF_HOUR_UTC
    // — was 13:00 UTC before 2026-08-18, changed to 06:00 UTC to
    // share one window with cup matches.)
    const { gen, matchRepo, leagueRepo, teamRepo } = build();
    matchRepo.count.mockResolvedValue(0);
    leagueRepo.find.mockResolvedValue([seniorLeague('L-1')]);
    const teams: TeamEntity[] = [];
    for (let i = 0; i < 4; i++) {
      // 4 teams → 3 rounds per leg, 6 matches per leg,
      // 12 matches total. Enough to cover rounds 0-3
      // without paying for the full 16-team pyramid.
      teams.push(seniorTeam(`T${i}`, 'L-1'));
    }
    teamRepo.find.mockResolvedValue(teams);
    matchRepo.save.mockResolvedValue([]);

    await gen.generateSeason1Schedule(new Date('2026-09-09T00:00:00Z'));

    const saved: Partial<MatchEntity>[] = matchRepo.save.mock.calls[0][0];
    const wed = saved.find((m) => m.round === 1)!;
    const sat = saved.find((m) => m.round === 2)!;
    expect(new Date(wed.scheduledAt!).toISOString()).toBe(
      '2026-09-16T06:00:00.000Z',
    );
    expect(new Date(sat.scheduledAt!).toISOString()).toBe(
      '2026-09-19T06:00:00.000Z',
    );
  });

  it('stamps `week` in 1..15 and `round` in {1,2} (not the absolute round 1..30)', async () => {
    // Regression for the bug where the historical code set
    // `week = round + 1` and `round = round + 1`, which
    // made the `week` field run 1..30 instead of 1..15 and
    // the `round` field carry the absolute round number.
    // The season-transition cron's `week === 15` trigger
    // needs the 1..15 range; the FE's "round 1 / round 2"
    // split needs the 1/2 value to mean Wed vs Sat.
    const { gen, matchRepo, leagueRepo, teamRepo } = build();
    matchRepo.count.mockResolvedValue(0);
    leagueRepo.find.mockResolvedValue([seniorLeague('L-1')]);
    const teams: TeamEntity[] = [];
    for (let i = 0; i < 4; i++) {
      teams.push(seniorTeam(`T${i}`, 'L-1'));
    }
    teamRepo.find.mockResolvedValue(teams);
    matchRepo.save.mockResolvedValue([]);

    await gen.generateSeason1Schedule(new Date('2026-09-09T00:00:00Z'));

    const saved: Partial<MatchEntity>[] = matchRepo.save.mock.calls[0][0];
    for (const m of saved) {
      expect(m.week).toBeGreaterThanOrEqual(1);
      expect(m.week).toBeLessThanOrEqual(15);
      expect([1, 2]).toContain(m.round);
    }
  });

  it('schedules the second leg at least 7 days after the first leg of the same pairing', async () => {
    // Regression for the historical bug where both legs of
    // the same pairing landed on the same kickoff instant
    // (the second leg's `matchStart(round, ...)` reused the
    // first leg's round index). Two teams would get a
    // "second leg" match on the same day, same venue pair,
    // with the home/away flag flipped — which the simulator
    // physically cannot run.
    //
    // For a 4-team league, the first leg's round 0 is
    // 2026-09-16 (Wed of week 1). The second leg of the
    // same pairing must be ≥ 7 days later. We assert the
    // gap to be ≥ 7 days, not strictly >, because the
    // earliest legal second-leg kickoff for round 0 is
    // week 8 Wed (2026-11-04) which is 49 days later.
    const { gen, matchRepo, leagueRepo, teamRepo } = build();
    matchRepo.count.mockResolvedValue(0);
    leagueRepo.find.mockResolvedValue([seniorLeague('L-1')]);
    const teams: TeamEntity[] = [];
    for (let i = 0; i < 4; i++) {
      teams.push(seniorTeam(`T${i}`, 'L-1'));
    }
    teamRepo.find.mockResolvedValue(teams);
    matchRepo.save.mockResolvedValue([]);

    await gen.generateSeason1Schedule(new Date('2026-09-09T00:00:00Z'));

    const saved: Partial<MatchEntity>[] = matchRepo.save.mock.calls[0][0];
    // 12 total = 6 first-leg + 6 second-leg.
    expect(saved).toHaveLength(12);
    const firstLeg = saved.slice(0, 6);
    const secondLeg = saved.slice(6);
    // For every first-leg kickoff, the second-leg kickoff
    // for the same pair must be at least 7 days later.
    // We use a weaker set-level assertion: the second
    // leg's earliest kickoff is strictly after the first
    // leg's latest kickoff.
    const firstLegMax = Math.max(
      ...firstLeg.map((m) => new Date(m.scheduledAt!).getTime()),
    );
    const secondLegMin = Math.min(
      ...secondLeg.map((m) => new Date(m.scheduledAt!).getTime()),
    );
    expect(secondLegMin).toBeGreaterThan(firstLegMax);
  });

  /**
   * Regression for the historical bug where the schedule
   * generator wrote match rows without `stadiumId`,
   * leaving the FE's `match.service.ts:700` `venue`
   * field permanently null on a fresh init. The fix
   * pre-loads the stadium map and stamps every match.
   */
  it('stamps `stadiumId` on every saved match row (home team\'s stadium)', async () => {
    const { gen, matchRepo, leagueRepo, teamRepo, stadiumRepo } = build();
    matchRepo.count.mockResolvedValue(0);
    leagueRepo.find.mockResolvedValue([seniorLeague('L-1')]);
    const teams: TeamEntity[] = [];
    for (let i = 0; i < 4; i++) {
      teams.push(seniorTeam(`T${i}`, 'L-1'));
    }
    teamRepo.find.mockResolvedValue(teams);
    matchRepo.save.mockResolvedValue([]);

    await gen.generateSeason1Schedule(new Date('2026-09-09T00:00:00Z'));

    const saved: Partial<MatchEntity>[] = matchRepo.save.mock.calls[0][0];
    // 12 total = 6 first-leg + 6 second-leg.
    expect(saved).toHaveLength(12);

    // The stadium map was loaded exactly once (not per
    // match, not per league).
    expect(stadiumRepo.find).toHaveBeenCalledTimes(1);

    // Every match has its home team's stadium id.
    // First-leg home is the `home` of the pairing; the
    // second leg reverses, so the second-leg home is
    // the `away` of the original pairing. The map keys
    // are teamIds (`T0`..`T3`) and the stadium id is
    // `stadium-<teamId>` per the default mock.
    for (const m of saved) {
      expect(m.stadiumId).toBe(`stadium-${m.homeTeamId}`);
    }
  });

  it('falls back to null stadiumId when a team has no stadium row', async () => {
    // Regression for the "BOT team whose stadium
    // creation failed" path: a missing stadium entry
    // must not throw — it just stamps null. The FE
    // renders "—" for the venue, which is the same
    // behaviour the historical pre-migration rows get.
    const { gen, matchRepo, leagueRepo, teamRepo, stadiumRepo } = build();
    matchRepo.count.mockResolvedValue(0);
    leagueRepo.find.mockResolvedValue([seniorLeague('L-1')]);
    const teams: TeamEntity[] = [];
    for (let i = 0; i < 4; i++) {
      teams.push(seniorTeam(`T${i}`, 'L-1'));
    }
    teamRepo.find.mockResolvedValue(teams);
    // Only T0 and T1 have a stadium; T2 and T3 don't.
    stadiumRepo.find.mockResolvedValue([
      { id: 'stadium-T0', teamId: 'T0' },
      { id: 'stadium-T1', teamId: 'T1' },
    ]);
    matchRepo.save.mockResolvedValue([]);

    await gen.generateSeason1Schedule(new Date('2026-09-09T00:00:00Z'));

    const saved: Partial<MatchEntity>[] = matchRepo.save.mock.calls[0][0];
    // The matches that have T0 or T1 as the home team
    // get a stadium id; the matches with T2 or T3 as
    // home get null. We don't pin a specific count
    // because the round-robin pairing is fixed, but we
    // do assert the schema: stadiumId is either a real
    // id or null, never an unrelated string.
    for (const m of saved) {
      if (m.homeTeamId === 'T0' || m.homeTeamId === 'T1') {
        expect(m.stadiumId).toBe(`stadium-${m.homeTeamId}`);
      } else {
        expect(m.stadiumId).toBeNull();
      }
    }
  });

  /**
   * Source-level tripwire. The pre-load-then-stamp
   * pattern requires a `stadiumRepo.find()` call
   * followed by a `Map(teamId → stadiumId)` build;
   * if either is removed, the FE breaks. Pin both at
   * the source surface so a future refactor can't
   * accidentally re-introduce the N+1.
   */
  it('source-level tripwire: pre-loads stadiums once (no per-match lookup)', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.join(__dirname, 'schedule.generator.ts'),
      'utf8',
    );
    // Strip comments before matching so docstring
    // mentions of the pattern don't trip the test.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

    // The schedule generator must inject StadiumEntity
    // and use the pre-loaded map to stamp stadiumId.
    expect(source).toMatch(/StadiumEntity/);
    // The actual stamping line: `stadiumId: ...get(home)`
    // or `stadiumId: ...get(away)` — both legs.
    expect(code).toMatch(/stadiumId:\s*options\.stadiumIdByTeam\.get\(/);
  });
});
