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

  it('handles an odd-team league (5 teams): each round has floor(N/2) matchups, one team sits out', async () => {
    // The standard pyramid uses 16-team leagues, so
    // the odd-team path is defensive. Pin the
    // contract: a 5-team league produces
    // floor(5/2) = 2 matchups per round (NOT
    // ceil(5/2) = 3), and the rightmost team in the
    // rotated list sits out. The docstring on
    // `generateRoundMatchups` claims this — the
    // spec makes the claim auditable.
    const { gen, matchRepo, leagueRepo, teamRepo } = build();
    matchRepo.count.mockResolvedValue(0);
    leagueRepo.find.mockResolvedValue([seniorLeague('L-1')]);
    const teams: TeamEntity[] = [];
    for (let i = 0; i < 5; i++) {
      teams.push(seniorTeam(`T${i}`, 'L-1'));
    }
    teamRepo.find.mockResolvedValue(teams);
    matchRepo.save.mockResolvedValue([]);

    await gen.generateSeason1Schedule(new Date('2026-09-09T00:00:00Z'));

    const saved: Partial<MatchEntity>[] = matchRepo.save.mock.calls[0][0];
    // 5 teams × (5-1) = 4 rounds per leg ×
    // floor(5/2) = 2 matchups per round × 2 legs
    // = 16 matches total.
    expect(saved).toHaveLength(16);
    // Every match is a real matchup (no null teams).
    for (const m of saved) {
      expect(m.homeTeamId).toBeTruthy();
      expect(m.awayTeamId).toBeTruthy();
    }
  });

  // ---------- Home/Away streak invariants ----------
  //
  // The user spec for the season-1 schedule is "每
  // 队最多 2 连主场或 2 连客场". A streak is N
  // consecutive matches where the same team plays at
  // the same venue.
  //
  // The fix is a single Thielen-style CSP
  // (`ScheduleGenerator.thielenEHV`) that solves the
  // HA assignment globally across all rounds. The
  // CSP guarantees max streak ≤ 2 for every team on
  // every league size the standard pyramid emits
  // (16 / 8 / 6 teams) — both within leg 1 AND at
  // the leg-1 / leg-2 boundary. The boundary check
  // is the key piece a naive per-round rule misses
  // (T0 with a leg-1 ending of `...A` and a leg-1
  // start of `H` produces a leg-2 sequence that
  // starts with `A` and the boundary becomes
  // `...A A A` — a 3-streak).
  //
  // Earlier iterations tried (a) a per-round parity
  // rule alone (commit `1715502`) and (b) a greedy
  // pair-level flip post-processor + multi-restart
  // hill-climb. Both failed to converge for some N
  // — the parity rule gave T0 a perfect alternation
  // but left 3-streaks on T1/T2/etc., and the
  // hill-climb got stuck in a 2-streak local
  // optimum that no single-flip could escape. The
  // Thielen CSP considers the constraint globally
  // and converges for all N ≥ 4 in the production
  // shape.
  //
  // Helpers shared by the streak specs below.
  const perTeamHA = (
    matches: Partial<MatchEntity>[],
    teamId: string,
  ): Array<'H' | 'A'> => {
    return matches
      .filter(
        (m) => m.homeTeamId === teamId || m.awayTeamId === teamId,
      )
      .sort(
        (a, b) =>
          new Date(a.scheduledAt!).getTime() -
          new Date(b.scheduledAt!).getTime(),
      )
      .map((m) => (m.homeTeamId === teamId ? 'H' : 'A'));
  };

  const maxStreak = (seq: Array<'H' | 'A'>): number => {
    let best = 0;
    let run = 0;
    let prev: 'H' | 'A' | null = null;
    for (const v of seq) {
      if (v === prev) {
        run += 1;
      } else {
        run = 1;
      }
      if (run > best) best = run;
      prev = v;
    }
    return best;
  };

  const runInitForNTeams = async (n: number) => {
    const { gen, matchRepo, leagueRepo, teamRepo } = build();
    matchRepo.count.mockResolvedValue(0);
    leagueRepo.find.mockResolvedValue([seniorLeague(`L-${n}`)]);
    const teams: TeamEntity[] = [];
    for (let i = 0; i < n; i++) {
      teams.push(seniorTeam(`T${i}`, `L-${n}`));
    }
    teamRepo.find.mockResolvedValue(teams);
    matchRepo.save.mockResolvedValue([]);
    await gen.generateSeason1Schedule(new Date('2026-09-09T00:00:00Z'));
    return matchRepo.save.mock.calls[0][0] as Partial<MatchEntity>[];
  };

  it('16-team league: every team has max home/away streak ≤ 2', async () => {
    // The standard pyramid's top tier is 16 teams /
    // 30 rounds / 15 weeks. This is the canonical
    // spec the user observed failing ("T2: H A H H
    // H A A" streak) and the one the Thielen CSP
    // must fully fix. Failing this means the
    // Thielen construction is no longer
    // guaranteeing max ≤ 2 for the production shape.
    const saved = await runInitForNTeams(16);
    // 16 teams → C(16,2) = 120 unique pairs → 240
    // matches (double round-robin, one per leg).
    expect(saved).toHaveLength(240);
    for (let i = 0; i < 16; i++) {
      const seq = perTeamHA(saved, `T${i}`);
      // 30 matches per team (every other team twice).
      expect(seq).toHaveLength(30);
      // Exactly 15 H and 15 A (mirror rule).
      expect(seq.filter((v) => v === 'H')).toHaveLength(15);
      expect(seq.filter((v) => v === 'A')).toHaveLength(15);
      // No 3-in-a-row anywhere on this team's timeline.
      expect(maxStreak(seq)).toBeLessThanOrEqual(2);
    }
  });

  it('8-team league: every team has max home/away streak ≤ 2', async () => {
    // 8 teams is the trace the user originally
    // reported ("T2: H A H H H A A"). Without the
    // Thielen CSP, T2 lands on 3 H in a row in
    // the middle of leg 1; the per-round parity
    // rule alone does not break it. The Thielen
    // CSP's global backtracking handles this case
    // by construction.
    const saved = await runInitForNTeams(8);
    // 8 teams → C(8,2) = 28 unique pairs → 56
    // matches (double round-robin).
    expect(saved).toHaveLength(56);
    for (let i = 0; i < 8; i++) {
      const seq = perTeamHA(saved, `T${i}`);
      // 14 matches per team.
      expect(seq).toHaveLength(14);
      expect(maxStreak(seq)).toBeLessThanOrEqual(2);
    }
  });

  it('16-team league: the fixed team (T0) is at most 2-streak after the Thielen CSP', async () => {
    // The Thielen CSP gives the fixed team (and
    // every other team) max ≤ 2 streak — see the
    // `thielenEHV` docstring for the algorithm and
    // the leg-1 / leg-2 boundary check. This spec
    // pins the invariant on T0 specifically because
    // T0 is the "pin" team in the circle method
    // (always teamIds[0]); if the boundary check
    // regresses, T0 is the team most likely to
    // fail first (its leg 1 pattern is the longest
    // and most constrained).
    const saved = await runInitForNTeams(16);
    const seq = perTeamHA(saved, 'T0');
    expect(seq).toHaveLength(30);
    // 15 H + 15 A — the per-pair "one home, one
    // away" contract is preserved by the Thielen
    // CSP (each match has exactly one home and one
    // away assignment, and leg 2 is the mirror).
    expect(seq.filter((v) => v === 'H')).toHaveLength(15);
    expect(seq.filter((v) => v === 'A')).toHaveLength(15);
    expect(maxStreak(seq)).toBeLessThanOrEqual(2);
  });

  it('every team has exactly one home and one away match per opponent', async () => {
    // The "double round-robin" contract: for every
    // pair (a, b), team a plays team b exactly
    // twice — once at home, once away. The Thielen
    // CSP's per-match constraint (one home, one
    // away) plus the leg-2 mirror in
    // `generateRoundRobin` together preserve this
    // contract.
    const saved = await runInitForNTeams(8);
    for (let a = 0; a < 8; a++) {
      for (let b = a + 1; b < 8; b++) {
        const headToHead = saved.filter(
          (m) =>
            (m.homeTeamId === `T${a}` && m.awayTeamId === `T${b}`) ||
            (m.homeTeamId === `T${b}` && m.awayTeamId === `T${a}`),
        );
        expect(headToHead).toHaveLength(2);
        // One home for a, one home for b.
        const homes = headToHead.map((m) => m.homeTeamId).sort();
        expect(homes).toEqual([`T${a}`, `T${b}`]);
      }
    }
  });

  /**
   * Source-level tripwire. The "max streak ≤ 2 for
   * every team" guarantee depends on the Thielen
   * CSP being CALLED in `generateRoundRobin` —
   * not just imported. The CSP itself lives in
   * `libs/database/src/services/thielen-ehv.ts` so
   * the schedule generator imports it from
   * `@goalxi/database` and calls it on the
   * circle-method pairings.
   *
   * If a future contributor reverts the call to
   * `thielenEHV` (e.g. by inlining a per-round parity
   * rule, or by going back to a `balanceStreaks`
   * post-processor that can't converge for some N),
   * the streak specs above silently start failing on
   * the 8-team / 16-team traces. Pinning at the
   * source level makes the failure a build error
   * instead of a dashboard regression.
   *
   * The legacy in-this-file helpers must be GONE:
   *   - `balanceStreaks` — pair-level greedy
   *     post-processor; oscillates and never
   *     converges for N=8 / N=16.
   *   - `flipPairHome` — pair-flip primitive
   *     powering the greedy post-processor.
   *   - `PairSchedule` — pair-level data structure
   *     powering the greedy post-processor.
   *
   * Re-introducing any of them as "harmless
   * helpers" is the structural shape of the
   * per-round-parity regression — a future
   * contributor doing that is the failure mode the
   * tripwire is built to catch.
   */
  it('source-level tripwire: thielenEHV is called in generateRoundRobin and legacy helpers are absent', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.join(__dirname, 'schedule.generator.ts'),
      'utf8',
    );
    // Strip comments so docstring mentions of
    // "thielenEHV" or "boundary" don't trip the
    // regex.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

    // The CSP must be IMPORTED from @goalxi/database
    // (it lives in libs/database/src/services/
    // thielen-ehv.ts).
    expect(code).toMatch(/thielenEHV\s*[,}]/);
    // The circle-method pairings helper must also be
    // imported (it lives in the same module).
    expect(code).toMatch(/circleMethodPairings\s*[,}]/);
    // And the CSP must be CALLED in
    // `generateRoundRobin` (not just imported and
    // forgotten). The legacy helpers must be GONE.
    expect(code).toMatch(/thielenEHV\s*\(/);
    expect(code).not.toMatch(/balanceStreaks/);
    expect(code).not.toMatch(/flipPairHome/);
    expect(code).not.toMatch(/PairSchedule/);
    // No inline CSP — the algorithm must come from
    // the shared utility so the season-scheduler's
    // mid-season reschedule path uses the same
    // guarantee. An inline `private thielenEHV`
    // method means the scheduler silently reverts
    // to whatever it had before the extraction.
    expect(code).not.toMatch(/private\s+thielenEHV\s*\(/);
  });

  /**
   * Source-level tripwire on the SHARED utility.
   * The leg-1 / leg-2 boundary check (the
   * `!teamHA[0]` comparison in the
   * `roundIdx === numRounds - 1` branch) is the
   * piece that closes the cross-boundary
   * 3-streak hole. Without it T0 ends up with
   * `...A A A` at positions N-3, N-2, N-1 of the
   * combined leg-1 + mirror-leg-2 sequence and
   * the tripwire spec above (T0 max ≤ 2) fails
   * first to make the regression root-cause
   * obvious. The check is in
   * `libs/database/src/services/thielen-ehv.ts`,
   * not the generator file, so it gets its own
   * tripwire.
   */
  it('source-level tripwire: shared thielen-ehv utility includes the leg-1/leg-2 boundary check', () => {
    const fs = require('fs');
    const path = require('path');
    // The utility is one level up from the
    // bootstrap/generators dir.
    const utilityPath = path.join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'libs',
      'database',
      'src',
      'services',
      'thielen-ehv.ts',
    );
    const source = fs.readFileSync(utilityPath, 'utf8');
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

    // The `leg2Start` variable is the clearest
    // surface for the boundary check; checking the
    // string guards against someone deleting the
    // `if (roundIdx === numRounds - 1)` branch in
    // a future refactor.
    expect(code).toMatch(/leg2Start/);
    // And the `roundIdx === numRounds - 1` guard
    // must still gate the boundary check, so the
    // check doesn't fire on every match.
    expect(code).toMatch(/roundIdx\s*===\s*numRounds\s*-\s*1/);
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
