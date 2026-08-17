import { TeamGenerator } from './team.generator';
import { LOGGER_SERVICE } from '@goalxi/logger';
import { TeamEntity, StadiumEntity } from '@goalxi/database';

/**
 * Smoke spec for the post-enrichment pass in
 * `TeamGenerator`. The pass is the one that turns a
 * freshly-`createTeam()`-ed row into something
 * visible (city, foundedYear, jerseyTertiary,
 * eloRating, bio, stadium.name). A regression
 * would manifest as "every team is named Home
 * Stadium and has no bio" — caught by these
 * three cases.
 */
describe('TeamGenerator — post-enrich', () => {
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
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const playerRepo = { find: jest.fn() };
    const staffRepo = { find: jest.fn() };
    const stadiumRepo = {
      find: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const leagueRepo = { find: jest.fn() };
    const dataSource = {
      manager: {
        findOne: jest.fn(),
      },
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

  beforeEach(() => {
    mockLogger.info.mockClear();
  });

  it('extracts the Chinese city prefix from "北京FC"', async () => {
    const { gen, teamRepo, stadiumRepo } = build();
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

    // The enrich method is private; we exercise it
    // indirectly by calling generateAllTeams, which
    // short-circuits on the existing-teams check
    // (count > 0). To hit the enrich path we
    // override count to 0 and let the team-loop
    // skip (createBotTeam is also a no-op here
    // because no leagues exist).
    //
    // For a focused unit test we reach in via
    // `(gen as any).enrichAllTeams()`.
    await (gen as any).enrichAllTeams();

    expect(teamRepo.update).toHaveBeenCalledTimes(1);
    const [teamId, patch] = teamRepo.update.mock.calls[0];
    expect(teamId).toBe('T1');
    expect(patch.city).toBe('北京');
    expect(patch.foundedYear).toBeGreaterThanOrEqual(1950);
    expect(patch.foundedYear).toBeLessThanOrEqual(2010);
    expect(patch.eloRating).toBe(1500); // botLevel 5 → mid ELO
    expect(patch.bio).toContain('北京');
    expect(patch.jerseyColorTertiary).toMatch(/^#[0-9A-F]{6}$/i);

    expect(stadiumRepo.update).toHaveBeenCalledTimes(1);
    const [stadiumId, stadiumPatch] = stadiumRepo.update.mock.calls[0];
    expect(stadiumId).toBe('S1');
    expect(stadiumPatch.name).toBe('北京体育中心');
  });

  it('falls back to "中国" when no city prefix is found', async () => {
    const { gen, teamRepo, stadiumRepo } = build();
    const t = {
      id: 'T2',
      name: 'FC',
      leagueId: 'L1',
      botLevel: 5,
    } as unknown as TeamEntity;
    teamRepo.find.mockResolvedValue([t]);
    stadiumRepo.find.mockResolvedValue([]);

    await (gen as any).enrichAllTeams();

    expect(teamRepo.update.mock.calls[0][1].city).toBe('中国');
    // No stadium to update.
    expect(stadiumRepo.update).not.toHaveBeenCalled();
  });

  it('scales ELO with botLevel', async () => {
    const { gen, teamRepo, stadiumRepo } = build();
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
    expect(teamRepo.update.mock.calls[0][1].eloRating).toBe(1540);
  });
});
