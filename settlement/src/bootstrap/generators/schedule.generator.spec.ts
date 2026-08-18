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
    return {
      gen: new ScheduleGenerator(
        mockLogger as any,
        matchRepo as any,
        leagueRepo as any,
        teamRepo as any,
      ),
      matchRepo,
      leagueRepo,
      teamRepo,
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
});
