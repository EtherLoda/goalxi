import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScoutSchedulerService } from './scout-scheduler.service';
import { LOGGER_SERVICE } from '@goalxi/logger';
import {
  ScoutCandidateEntity,
  SCOUT_CANDIDATES_PER_TEAM,
  SCOUT_CANDIDATE_TTL_DAYS,
  TeamEntity,
} from '@goalxi/database';

describe('ScoutSchedulerService', () => {
  let service: ScoutSchedulerService;
  let teamRepo: jest.Mocked<Repository<TeamEntity>>;
  let scoutRepo: jest.Mocked<Repository<ScoutCandidateEntity>>;

  const teamA = { id: 'team-a', name: 'Team A' } as TeamEntity;
  const teamB = { id: 'team-b', name: 'Team B' } as TeamEntity;

  const mockTeamRepo = {
    find: jest.fn(),
  };

  // Captures the create() payload so we can assert the generated
  // shape, instead of just counting save() calls.
  const createCalls: any[] = [];
  const saveCalls: any[] = [];

  const mockScoutRepo = {
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
    find: jest.fn(),
    create: jest.fn().mockImplementation((data: any) => {
      createCalls.push(data);
      return data;
    }),
    save: jest.fn().mockImplementation(async (data: any) => {
      saveCalls.push(data);
      return data;
    }),
  };

  const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(async () => {
    createCalls.length = 0;
    saveCalls.length = 0;
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScoutSchedulerService,
        { provide: LOGGER_SERVICE, useValue: mockLogger },
        { provide: getRepositoryToken(TeamEntity), useValue: mockTeamRepo },
        { provide: getRepositoryToken(ScoutCandidateEntity), useValue: mockScoutRepo },
      ],
    }).compile();

    service = module.get(ScoutSchedulerService);
    teamRepo = module.get(getRepositoryToken(TeamEntity));
    scoutRepo = module.get(getRepositoryToken(ScoutCandidateEntity));
  });

  it('purges expired candidates before regenerating', async () => {
    teamRepo.find.mockResolvedValue([]);
    await service.generateScoutCandidates();
    expect(scoutRepo.delete).toHaveBeenCalledTimes(1);
    expect(scoutRepo.delete).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt: expect.anything() }),
    );
  });

  it('skips teams that already have active candidates', async () => {
    teamRepo.find.mockResolvedValue([teamA]);
    scoutRepo.find.mockResolvedValue([
      { id: 'existing', teamId: teamA.id } as any,
    ]);

    await service.generateScoutCandidates();

    expect(scoutRepo.create).not.toHaveBeenCalled();
    expect(scoutRepo.save).not.toHaveBeenCalled();
  });

  it('generates the configured number of candidates per eligible team', async () => {
    teamRepo.find.mockResolvedValue([teamA, teamB]);
    scoutRepo.find.mockResolvedValue([]); // neither team has active candidates

    await service.generateScoutCandidates();

    expect(scoutRepo.create).toHaveBeenCalledTimes(
      SCOUT_CANDIDATES_PER_TEAM * 2,
    );
    expect(scoutRepo.save).toHaveBeenCalledTimes(
      SCOUT_CANDIDATES_PER_TEAM * 2,
    );
  });

  // Regression test for the original "Pending Migration" bug.
  // The cron must produce real player data through the shared generator,
  // not placeholder rows with empty skills / literal "Pending Migration".
  it('uses the shared generator — never emits "Pending Migration" placeholders', async () => {
    teamRepo.find.mockResolvedValue([teamA]);
    scoutRepo.find.mockResolvedValue([]);

    await service.generateScoutCandidates();

    expect(createCalls).toHaveLength(SCOUT_CANDIDATES_PER_TEAM);
    for (const call of createCalls) {
      expect(call.teamId).toBe(teamA.id);
      const pd = call.playerData;
      expect(pd.name).not.toBe('Pending Migration');
      expect(pd.name.length).toBeGreaterThan(0);
      expect(pd.currentSkills).toBeDefined();
      expect(Object.keys(pd.currentSkills).length).toBeGreaterThan(0);
      expect(pd.potentialSkills).toBeDefined();
      expect(Object.keys(pd.potentialSkills).length).toBeGreaterThan(0);
      // national code must be 2-letter
      expect(pd.nationality).toMatch(/^[A-Z]{2}$/);
      // joinedAt must be a Date instance
      expect(pd.joinedAt).toBeInstanceOf(Date);
      // revealedSkills should not be empty (generator always reveals ≥1)
      expect(Array.isArray(pd.revealedSkills)).toBe(true);
    }
  });

  it('hides potentialTier when potentialRevealed is false', async () => {
    teamRepo.find.mockResolvedValue([teamA]);
    scoutRepo.find.mockResolvedValue([]);

    await service.generateScoutCandidates();

    for (const call of createCalls) {
      const pd = call.playerData;
      if (pd.potentialRevealed === false) {
        expect(pd.potentialTier).toBeUndefined();
      } else {
        expect(typeof pd.potentialTier).toBe('string');
      }
    }
  });

  it('sets expiresAt to the configured TTL in the future', async () => {
    teamRepo.find.mockResolvedValue([teamA]);
    scoutRepo.find.mockResolvedValue([]);

    const before = Date.now();
    await service.generateScoutCandidates();
    const after = Date.now();

    for (const call of createCalls) {
      const ttlMs = call.expiresAt.getTime() - before;
      const expectedMin =
        (SCOUT_CANDIDATE_TTL_DAYS - 1) * 24 * 60 * 60 * 1000;
      const expectedMax =
        (SCOUT_CANDIDATE_TTL_DAYS + 1) * 24 * 60 * 60 * 1000;
      expect(ttlMs).toBeGreaterThanOrEqual(expectedMin);
      expect(ttlMs).toBeLessThanOrEqual(expectedMax + (after - before));
    }
  });

  it('logs and continues when a single team fails', async () => {
    teamRepo.find.mockResolvedValue([teamA, teamB]);
    scoutRepo.find.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    // teamA's first save throws (callCount becomes 1), the rest succeed.
    // The inner `for` exits on the first throw, so teamA only attempts
    // 1 save. teamB's 3 saves all succeed (callCount 2..4).
    let callCount = 0;
    scoutRepo.save.mockImplementation(async (data: any) => {
      callCount++;
      if (callCount === 1) {
        throw new Error('DB down');
      }
      return data;
    });

    await expect(service.generateScoutCandidates()).resolves.not.toThrow();
    // teamA's catch fired (logged "team-a")
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('team-a'),
      expect.any(String),
    );
    // teamB's loop ran to completion: 3 saves after the first failure.
    expect(callCount).toBe(4);
    // And teamB's debug log confirms success
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('team team-b'),
    );
  });
});
