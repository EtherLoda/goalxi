import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { YouthStructureGenerator } from './youth-structure.generator';
import { LOGGER_SERVICE } from '@goalxi/logger';
import {
  LeagueEntity,
  TeamEntity,
  YouthLeagueEntity,
  YouthTeamEntity,
} from '@goalxi/database';

describe('YouthStructureGenerator', () => {
  let gen: YouthStructureGenerator;
  let leagueRepo: jest.Mocked<Repository<LeagueEntity>>;
  let youthLeagueRepo: jest.Mocked<Repository<YouthLeagueEntity>>;
  let teamRepo: jest.Mocked<Repository<TeamEntity>>;
  let youthTeamRepo: jest.Mocked<Repository<YouthTeamEntity>>;

  const league = (id: string, name: string, tier = 2): LeagueEntity =>
    ({ id, name, tier, tierDivision: 1, maxTeams: 16 } as LeagueEntity);

  const team = (id: string, leagueId: string | null): TeamEntity =>
    ({ id, name: `Team ${id}`, leagueId } as TeamEntity);

  const mockLeagueRepo = {
    find: jest.fn(),
  };
  const mockYouthLeagueRepo = {
    findOne: jest.fn(),
    create: jest.fn().mockImplementation((d) => d),
    save: jest.fn().mockImplementation(async (d) => ({ id: `yl-${d.name}`, ...d })),
  };
  const mockTeamRepo = {
    find: jest.fn(),
  };
  const mockYouthTeamRepo = {
    findOne: jest.fn(),
    create: jest.fn().mockImplementation((d) => d),
    save: jest.fn().mockImplementation(async (d) => ({ id: `yt-${d.teamId}`, ...d })),
  };
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockYouthLeagueRepo.create.mockImplementation((d: any) => ({
      id: `yl-${Math.random()}`,
      ...d,
    }));
    mockYouthTeamRepo.create.mockImplementation((d: any) => ({
      id: `yt-${Math.random()}`,
      ...d,
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YouthStructureGenerator,
        { provide: LOGGER_SERVICE, useValue: mockLogger },
        { provide: getRepositoryToken(LeagueEntity), useValue: mockLeagueRepo },
        { provide: getRepositoryToken(YouthLeagueEntity), useValue: mockYouthLeagueRepo },
        { provide: getRepositoryToken(TeamEntity), useValue: mockTeamRepo },
        { provide: getRepositoryToken(YouthTeamEntity), useValue: mockYouthTeamRepo },
      ],
    }).compile();

    gen = module.get(YouthStructureGenerator);
    leagueRepo = module.get(getRepositoryToken(LeagueEntity));
    youthLeagueRepo = module.get(getRepositoryToken(YouthLeagueEntity));
    teamRepo = module.get(getRepositoryToken(TeamEntity));
    youthTeamRepo = module.get(getRepositoryToken(YouthTeamEntity));
  });

  it('no-ops when there are no senior leagues', async () => {
    leagueRepo.find.mockResolvedValue([]);
    await gen.generate();
    expect(youthLeagueRepo.create).not.toHaveBeenCalled();
    expect(youthTeamRepo.create).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('No senior leagues'),
    );
  });

  it('creates 1 youth_league per senior_league when none exist', async () => {
    leagueRepo.find.mockResolvedValue([
      league('L1', 'Elite League', 1),
      league('L2.d1', 'Pro Div 1', 2),
    ]);
    // No existing youth_league for either
    mockYouthLeagueRepo.findOne.mockResolvedValue(null);
    mockTeamRepo.find.mockResolvedValue([]);

    await gen.generate();

    expect(youthLeagueRepo.create).toHaveBeenCalledTimes(2);
    const calls = youthLeagueRepo.create.mock.calls.map((c) => c[0]);
    expect(calls[0]).toMatchObject({
      name: '青训联赛 Elite League',
      parentTier: 1,
      maxTeams: 16,
      seniorLeagueId: 'L1',
    });
    expect(calls[1]).toMatchObject({
      name: '青训联赛 Pro Div 1',
      parentTier: 2,
      seniorLeagueId: 'L2.d1',
    });
    expect(youthLeagueRepo.save).toHaveBeenCalledTimes(2);
  });

  it('reuses an existing youth_league (1:1 by senior_league_id)', async () => {
    leagueRepo.find.mockResolvedValue([league('L1', 'Elite League', 1)]);
    // Existing youth_league is found
    mockYouthLeagueRepo.findOne.mockResolvedValue({
      id: 'yl-existing',
      name: '青训联赛 Elite League',
      parentTier: 1,
      seniorLeagueId: 'L1',
    } as YouthLeagueEntity);
    mockTeamRepo.find.mockResolvedValue([]);

    await gen.generate();

    expect(youthLeagueRepo.create).not.toHaveBeenCalled();
    expect(youthLeagueRepo.save).not.toHaveBeenCalled();
  });

  it('creates 1 youth_team per senior_team with the right youthLeagueId', async () => {
    leagueRepo.find.mockResolvedValue([league('L2.d1', 'Pro Div 1', 2)]);
    mockYouthLeagueRepo.findOne.mockResolvedValue(null);
    const savedYouthLeague = {
      id: 'YL2.d1',
      name: '青训联赛 Pro Div 1',
      parentTier: 2,
      seniorLeagueId: 'L2.d1',
    } as YouthLeagueEntity;
    mockYouthLeagueRepo.save.mockResolvedValue(savedYouthLeague);
    mockYouthTeamRepo.findOne.mockResolvedValue(null);
    mockTeamRepo.find.mockResolvedValue([
      team('T1', 'L2.d1'),
      team('T2', 'L2.d1'),
      team('T3', 'L2.d1'),
    ]);

    await gen.generate();

    expect(youthTeamRepo.create).toHaveBeenCalledTimes(3);
    const calls = youthTeamRepo.create.mock.calls.map((c) => c[0]);
    expect(calls.map((c) => c.teamId).sort()).toEqual(['T1', 'T2', 'T3']);
    for (const c of calls) {
      expect(c.youthLeagueId).toBe('YL2.d1');
      expect(c.name).toContain('青年队');
    }
  });

  it('reuses an existing youth_team (1:1 by team_id)', async () => {
    leagueRepo.find.mockResolvedValue([league('L2.d1', 'Pro Div 1', 2)]);
    mockYouthLeagueRepo.findOne.mockResolvedValue({
      id: 'YL',
      seniorLeagueId: 'L2.d1',
    } as YouthLeagueEntity);
    mockYouthTeamRepo.findOne.mockResolvedValue({
      id: 'yt-existing',
      teamId: 'T1',
      youthLeagueId: 'YL',
    } as YouthTeamEntity);
    mockTeamRepo.find.mockResolvedValue([team('T1', 'L2.d1')]);

    await gen.generate();

    expect(youthTeamRepo.create).not.toHaveBeenCalled();
    expect(youthTeamRepo.save).not.toHaveBeenCalled();
  });

  it('skips teams with no senior leagueId (free agents)', async () => {
    leagueRepo.find.mockResolvedValue([league('L2.d1', 'Pro Div 1', 2)]);
    mockYouthLeagueRepo.findOne.mockResolvedValue({
      id: 'YL',
      seniorLeagueId: 'L2.d1',
    } as YouthLeagueEntity);
    mockYouthTeamRepo.findOne.mockResolvedValue(null);
    mockTeamRepo.find.mockResolvedValue([
      team('T1', 'L2.d1'),
      team('T2', null), // free agent
      team('T3', 'L2.d1'),
    ]);

    await gen.generate();

    expect(youthTeamRepo.create).toHaveBeenCalledTimes(2);
    const calls = youthTeamRepo.create.mock.calls.map((c) => c[0]);
    expect(calls.map((c) => c.teamId).sort()).toEqual(['T1', 'T3']);
  });

  it('is idempotent — running twice does not create duplicate rows', async () => {
    leagueRepo.find.mockResolvedValue([league('L2.d1', 'Pro Div 1', 2)]);
    // First call: nothing exists. Second call: same queries return the
    // just-saved rows.
    let savedLeague: YouthLeagueEntity | null = null;
    let savedTeams: YouthTeamEntity[] = [];

    mockYouthLeagueRepo.findOne.mockImplementation(async () => savedLeague);
    mockYouthLeagueRepo.save.mockImplementation(async (d: any) => {
      const row = { id: 'YL', ...d } as YouthLeagueEntity;
      savedLeague = row;
      return row;
    });
    mockYouthTeamRepo.findOne.mockImplementation(
      async ({ where }: any) =>
        savedTeams.find((t) => t.teamId === where.teamId) ?? null,
    );
    mockYouthTeamRepo.save.mockImplementation(async (d: any) => {
      const row = { id: `yt-${d.teamId}`, ...d } as YouthTeamEntity;
      savedTeams.push(row);
      return row;
    });
    mockTeamRepo.find.mockResolvedValue([team('T1', 'L2.d1')]);

    await gen.generate();
    const firstCreateLeague = youthLeagueRepo.create.mock.calls.length;
    const firstCreateTeam = youthTeamRepo.create.mock.calls.length;

    // Re-run with the now-saved rows visible
    await gen.generate();
    const secondCreateLeague = youthLeagueRepo.create.mock.calls.length;
    const secondCreateTeam = youthTeamRepo.create.mock.calls.length;

    expect(firstCreateLeague).toBe(1);
    expect(firstCreateTeam).toBe(1);
    expect(secondCreateLeague).toBe(firstCreateLeague);
    expect(secondCreateTeam).toBe(firstCreateTeam);
  });
});
