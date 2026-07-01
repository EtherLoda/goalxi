import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScheduleGenerator } from './schedule.generator';
import { LOGGER_SERVICE } from '@goalxi/logger';
import {
  LeagueEntity,
  MatchEntity,
  MatchStatus,
  MatchType,
  TeamEntity,
  YouthLeagueEntity,
  YouthTeamEntity,
} from '@goalxi/database';

describe('ScheduleGenerator — WAVE A2 youth fixtures', () => {
  let gen: ScheduleGenerator;
  let matchRepo: { count: jest.Mock; save: jest.Mock };
  let leagueRepo: { find: jest.Mock };
  let teamRepo: { find: jest.Mock };
  let youthLeagueRepo: { find: jest.Mock };
  let youthTeamRepo: { find: jest.Mock };

  const seniorLeague = (id: string, name = 'Pro Div 1'): LeagueEntity =>
    ({ id, name, tier: 2, tierDivision: 1, maxTeams: 16 } as LeagueEntity);

  const seniorTeam = (id: string, leagueId: string): TeamEntity =>
    ({ id, name: `Team ${id}`, leagueId } as TeamEntity);

  const youthLeague = (
    id: string,
    seniorId: string,
    name = `青训联赛 ${seniorId}`,
  ): YouthLeagueEntity =>
    ({
      id,
      name,
      parentTier: 2,
      seniorLeagueId: seniorId,
    } as YouthLeagueEntity);

  const youthTeam = (ytId: string, seniorTeamId: string, ylId: string): YouthTeamEntity =>
    ({
      id: ytId,
      teamId: seniorTeamId,
      youthLeagueId: ylId,
      name: `Team ${seniorTeamId} 青年队`,
    } as YouthTeamEntity);

  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  };

  // Captures the matches the generator would persist, so tests can
  // assert on the generated shape without spinning up a real DB.
  let savedBatches: any[][] = [];

  beforeEach(async () => {
    // Reset the logger mock so cross-test pollution (e.g. previous
    // "no youth_league" warnings) doesn't bleed into the current
    // test's assertions.
    jest.clearAllMocks();
    savedBatches = [];
    matchRepo = {
      count: jest.fn().mockResolvedValue(0),
      save: jest.fn().mockImplementation(async (data: any) => {
        savedBatches.push(Array.isArray(data) ? data : [data]);
        return data;
      }),
    };
    leagueRepo = { find: jest.fn() };
    teamRepo = { find: jest.fn() };
    youthLeagueRepo = { find: jest.fn() };
    youthTeamRepo = { find: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduleGenerator,
        { provide: LOGGER_SERVICE, useValue: mockLogger },
        { provide: getRepositoryToken(MatchEntity), useValue: matchRepo },
        { provide: getRepositoryToken(LeagueEntity), useValue: leagueRepo },
        { provide: getRepositoryToken(TeamEntity), useValue: teamRepo },
        {
          provide: getRepositoryToken(YouthLeagueEntity),
          useValue: youthLeagueRepo,
        },
        {
          provide: getRepositoryToken(YouthTeamEntity),
          useValue: youthTeamRepo,
        },
      ],
    }).compile();

    gen = module.get(ScheduleGenerator);
  });

  it('generates both senior AND youth fixtures in one run', async () => {
    // 16 senior teams in 1 senior league
    const sl = seniorLeague('L1');
    const seniorTeams = Array.from({ length: 16 }, (_, i) =>
      seniorTeam(`T${i + 1}`, 'L1'),
    );
    leagueRepo.find.mockResolvedValue([sl]);
    teamRepo.find.mockResolvedValue(seniorTeams);

    // 1 youth league pointing back to L1, with 16 youth teams
    const yl = youthLeague('YL1', 'L1');
    const youthTeams = seniorTeams.map((t) =>
      youthTeam(`YT-${t.id}`, t.id, 'YL1'),
    );
    youthLeagueRepo.find.mockResolvedValue([yl]);
    youthTeamRepo.find.mockResolvedValue(youthTeams);

    await gen.generateSeason1Schedule();

    expect(matchRepo.save).toHaveBeenCalledTimes(2);
    const seniorBatch = savedBatches[0];
    const youthBatch = savedBatches[1];

    expect(seniorBatch.length).toBeGreaterThan(0);
    expect(youthBatch.length).toBeGreaterThan(0);
    expect(seniorBatch.length).toBe(youthBatch.length); // round-robin symmetry
  });

  it('senior fixtures carry leagueId and youthLeagueId=null', async () => {
    const sl = seniorLeague('L1');
    const seniorTeams = Array.from({ length: 16 }, (_, i) =>
      seniorTeam(`T${i + 1}`, 'L1'),
    );
    leagueRepo.find.mockResolvedValue([sl]);
    teamRepo.find.mockResolvedValue(seniorTeams);
    youthLeagueRepo.find.mockResolvedValue([]); // no youth leagues

    await gen.generateSeason1Schedule();

    const seniorBatch = savedBatches[0];
    for (const m of seniorBatch) {
      expect(m.leagueId).toBe('L1');
      expect(m.youthLeagueId).toBeNull();
    }
  });

  it('youth fixtures carry leagueId=null and youthLeagueId set', async () => {
    const sl = seniorLeague('L1');
    const seniorTeams = Array.from({ length: 16 }, (_, i) =>
      seniorTeam(`T${i + 1}`, 'L1'),
    );
    leagueRepo.find.mockResolvedValue([sl]);
    teamRepo.find.mockResolvedValue(seniorTeams);

    const yl = youthLeague('YL1', 'L1');
    const youthTeams = seniorTeams.map((t) =>
      youthTeam(`YT-${t.id}`, t.id, 'YL1'),
    );
    youthLeagueRepo.find.mockResolvedValue([yl]);
    youthTeamRepo.find.mockResolvedValue(youthTeams);

    await gen.generateSeason1Schedule();

    const youthBatch = savedBatches[1];
    for (const m of youthBatch) {
      expect(m.leagueId).toBeNull();
      expect(m.youthLeagueId).toBe('YL1');
      // youth match uses senior team ids (since youth_team.teamId = senior team id)
      expect(['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12', 'T13', 'T14', 'T15', 'T16'])
        .toContain(m.homeTeamId);
    }
  });

  it('every match has a scheduledAt so the preprocessor can pick it up', async () => {
    const sl = seniorLeague('L1');
    const seniorTeams = Array.from({ length: 16 }, (_, i) =>
      seniorTeam(`T${i + 1}`, 'L1'),
    );
    leagueRepo.find.mockResolvedValue([sl]);
    teamRepo.find.mockResolvedValue(seniorTeams);
    const yl = youthLeague('YL1', 'L1');
    youthLeagueRepo.find.mockResolvedValue([yl]);
    youthTeamRepo.find.mockResolvedValue(
      seniorTeams.map((t) => youthTeam(`YT-${t.id}`, t.id, 'YL1')),
    );

    await gen.generateSeason1Schedule();

    const all = [...savedBatches[0], ...savedBatches[1]];
    for (const m of all) {
      expect(m.scheduledAt).toBeInstanceOf(Date);
      // must be in the future (otherwise the preprocessor fires everything on tick 1)
      expect(m.scheduledAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
    }
  });

  it('matches within the same round share the same week number', async () => {
    const sl = seniorLeague('L1');
    const seniorTeams = Array.from({ length: 16 }, (_, i) =>
      seniorTeam(`T${i + 1}`, 'L1'),
    );
    leagueRepo.find.mockResolvedValue([sl]);
    teamRepo.find.mockResolvedValue(seniorTeams);
    youthLeagueRepo.find.mockResolvedValue([]);
    youthTeamRepo.find.mockResolvedValue([]);

    await gen.generateSeason1Schedule();

    const seniorBatch = savedBatches[0];
    // 16 teams → 15 first-half rounds, each with 8 matchups.
    // Group by week and assert each group has exactly 8 entries.
    const byWeek = new Map<number, number>();
    for (const m of seniorBatch) {
      byWeek.set(m.week, (byWeek.get(m.week) ?? 0) + 1);
    }
    for (const [, count] of byWeek) {
      expect(count).toBe(8);
    }
  });

  it('schedules return legs in weeks 16..30 (first half is 1..15)', async () => {
    const sl = seniorLeague('L1');
    const seniorTeams = Array.from({ length: 16 }, (_, i) =>
      seniorTeam(`T${i + 1}`, 'L1'),
    );
    leagueRepo.find.mockResolvedValue([sl]);
    teamRepo.find.mockResolvedValue(seniorTeams);
    youthLeagueRepo.find.mockResolvedValue([]);
    youthTeamRepo.find.mockResolvedValue([]);

    await gen.generateSeason1Schedule();

    const seniorBatch = savedBatches[0];
    const weeks = new Set(seniorBatch.map((m: any) => m.week));
    expect(weeks.size).toBe(30); // 15 first-half + 15 return-leg rounds
    expect(Math.min(...weeks)).toBe(1);
    expect(Math.max(...weeks)).toBe(30);
  });

  it('skips a youth league with fewer than 4 teams (round-robin needs 4+)', async () => {
    const sl = seniorLeague('L1');
    const seniorTeams = Array.from({ length: 16 }, (_, i) =>
      seniorTeam(`T${i + 1}`, 'L1'),
    );
    leagueRepo.find.mockResolvedValue([sl]);
    teamRepo.find.mockResolvedValue(seniorTeams);

    // Two youth leagues: one with 16 teams, one with only 2. Give the
    // tiny one a distinguishing name so we can match the warn message.
    const ylFull = youthLeague('YLfull', 'L1', '青训联赛 L1');
    const ylTiny = youthLeague('YLtiny', 'L1', '青训联赛 迷你组');
    youthLeagueRepo.find.mockResolvedValue([ylFull, ylTiny]);
    youthTeamRepo.find.mockImplementation(async ({ where }: any) => {
      if (where.youthLeagueId === 'YLfull') {
        return seniorTeams.map((t) => youthTeam(`yt-${t.id}`, t.id, 'YLfull'));
      }
      return [
        youthTeam('yt-1', 'T1', 'YLtiny'),
        youthTeam('yt-2', 'T2', 'YLtiny'),
      ];
    });

    await gen.generateSeason1Schedule();

    const youthBatch = savedBatches[1];
    // All youth matches must belong to YLfull (YLtiny was skipped).
    for (const m of youthBatch) {
      expect(m.youthLeagueId).toBe('YLfull');
    }
    // The skip is logged with the youth league's name.
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('迷你组'),
    );
  });

  it('warns and skips youth fixtures when no youth_league rows exist', async () => {
    const sl = seniorLeague('L1');
    const seniorTeams = Array.from({ length: 16 }, (_, i) =>
      seniorTeam(`T${i + 1}`, 'L1'),
    );
    leagueRepo.find.mockResolvedValue([sl]);
    teamRepo.find.mockResolvedValue(seniorTeams);
    youthLeagueRepo.find.mockResolvedValue([]);

    await gen.generateSeason1Schedule();

    // Only senior batch saved, no youth batch.
    expect(matchRepo.save).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('No youth_league'),
    );
  });

  it('youth match scheduledAt is offset by 2 days from senior (no same-instant clash)', async () => {
    const sl = seniorLeague('L1');
    const seniorTeams = Array.from({ length: 16 }, (_, i) =>
      seniorTeam(`T${i + 1}`, 'L1'),
    );
    leagueRepo.find.mockResolvedValue([sl]);
    teamRepo.find.mockResolvedValue(seniorTeams);
    const yl = youthLeague('YL1', 'L1');
    youthLeagueRepo.find.mockResolvedValue([yl]);
    youthTeamRepo.find.mockResolvedValue(
      seniorTeams.map((t) => youthTeam(`yt-${t.id}`, t.id, 'YL1')),
    );

    await gen.generateSeason1Schedule();

    const seniorBatch = savedBatches[0];
    const youthBatch = savedBatches[1];

    // Find a senior + youth match in the same round and assert the
    // youth scheduledAt is later (offset by exactly 2 days = 48h).
    const seniorWeek1 = seniorBatch.find((m: any) => m.week === 1);
    const youthWeek1 = youthBatch.find((m: any) => m.week === 1);
    expect(seniorWeek1).toBeDefined();
    expect(youthWeek1).toBeDefined();
    const diffMs = youthWeek1.scheduledAt.getTime() - seniorWeek1.scheduledAt.getTime();
    // 2 days ± 60s tolerance for "now"-clamping logic
    expect(diffMs).toBeGreaterThanOrEqual(2 * 24 * 60 * 60 * 1000 - 60_000);
    expect(diffMs).toBeLessThanOrEqual(2 * 24 * 60 * 60 * 1000 + 60_000);
  });

  it('every match has the right base shape (status, type, defaults)', async () => {
    const sl = seniorLeague('L1');
    const seniorTeams = Array.from({ length: 16 }, (_, i) =>
      seniorTeam(`T${i + 1}`, 'L1'),
    );
    leagueRepo.find.mockResolvedValue([sl]);
    teamRepo.find.mockResolvedValue(seniorTeams);
    const yl = youthLeague('YL1', 'L1');
    youthLeagueRepo.find.mockResolvedValue([yl]);
    youthTeamRepo.find.mockResolvedValue(
      seniorTeams.map((t) => youthTeam(`yt-${t.id}`, t.id, 'YL1')),
    );

    await gen.generateSeason1Schedule();

    const all = [...savedBatches[0], ...savedBatches[1]];
    for (const m of all) {
      expect(m.status).toBe(MatchStatus.SCHEDULED);
      expect(m.type).toBe(MatchType.LEAGUE);
      expect(m.season).toBe(1);
      expect(m.tacticsLocked).toBe(false);
      expect(m.homeForfeit).toBe(false);
      expect(m.awayForfeit).toBe(false);
    }
  });

  it('skips entirely when any match already exists (idempotent)', async () => {
    matchRepo.count.mockResolvedValue(120); // pretend the DB has matches

    await gen.generateSeason1Schedule();

    expect(matchRepo.save).not.toHaveBeenCalled();
    expect(leagueRepo.find).not.toHaveBeenCalled();
  });
});
