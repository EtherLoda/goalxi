import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ScoutsService } from './scouts.service';
import {
  PlayerEntity,
  ScoutCandidateEntity,
  TeamEntity,
  YouthLeagueEntity,
  YouthTeamEntity,
} from '@goalxi/database';

describe('ScoutsService.selectCandidate — persistence invariants', () => {
  let service: ScoutsService;
  let playerRepo: { create: jest.Mock; save: jest.Mock };
  let candidateRepo: { findOneByOrFail: jest.Mock; delete: jest.Mock };
  let teamRepo: Record<string, jest.Mock>;
  let youthTeamRepo: { findOne: jest.Mock };

  const baseSkills = {
    physical: { pace: 10, strength: 10 },
    technical: { finishing: 10, passing: 10, dribbling: 10, defending: 10 },
    mental: { positioning: 10, composure: 10 },
    setPieces: { freeKicks: 10, penalties: 10 },
  };

  // Three "tiers" of potential skills: low (~PA 30), high (~PA 80), elite (~PA 95).
  const lowPotential = {
    physical: { pace: 8, strength: 8 },
    technical: { finishing: 8, passing: 8, dribbling: 8, defending: 8 },
    mental: { positioning: 6, composure: 6 },
    setPieces: { freeKicks: 5, penalties: 5 },
  };
  const highPotential = {
    physical: { pace: 17, strength: 17 },
    technical: { finishing: 17, passing: 17, dribbling: 17, defending: 17 },
    mental: { positioning: 16, composure: 16 },
    setPieces: { freeKicks: 15, penalties: 15 },
  };
  const elitePotential = {
    physical: { pace: 20, strength: 20 },
    technical: { finishing: 20, passing: 20, dribbling: 20, defending: 20 },
    mental: { positioning: 20, composure: 20 },
    setPieces: { freeKicks: 20, penalties: 20 },
  };

  const buildCandidate = (
    overrides: Partial<ScoutCandidateEntity> = {},
  ): ScoutCandidateEntity =>
    ({
      id: 'candidate-1',
      teamId: 'team-A',
      playerData: {
        name: 'Test Scout',
        createdDay: 0,
        nationality: 'GB',
        isGoalkeeper: false,
        position: 'CM',
        currentSkills: baseSkills,
        potentialSkills: highPotential,
        abilities: ['long_passer'],
        potentialTier: 'REGULAR',
        potentialRevealed: true,
        revealedSkills: ['pace', 'strength', 'finishing', 'passing'],
        joinedAt: new Date(),
      },
      expiresAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as ScoutCandidateEntity;

  beforeEach(async () => {
    playerRepo = {
      // Mirror the real `create` semantics: it returns the input object
      // (TypeORM would add type metadata; we don't need that here).
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockImplementation(async (data) => data),
    };
    candidateRepo = {
      findOneByOrFail: jest.fn(),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    teamRepo = {};
    youthTeamRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ScoutsService,
        { provide: getRepositoryToken(ScoutCandidateEntity), useValue: candidateRepo },
        { provide: getRepositoryToken(PlayerEntity), useValue: playerRepo },
        { provide: getRepositoryToken(TeamEntity), useValue: teamRepo },
        { provide: getRepositoryToken(YouthTeamEntity), useValue: youthTeamRepo },
        { provide: getRepositoryToken(YouthLeagueEntity), useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(ScoutsService);
  });

  it('persists the formation position from the candidate', async () => {
    candidateRepo.findOneByOrFail.mockResolvedValue(
      buildCandidate({
        playerData: { ...buildCandidate().playerData, position: 'CB' },
      }),
    );

    await service.selectCandidate('candidate-1', 'team-A');

    const saved = playerRepo.save.mock.calls[0][0];
    expect(saved.position).toBe('CB');
  });

  it('falls back to null when no position is on the candidate (legacy data)', async () => {
    const candidate = buildCandidate();
    delete (candidate.playerData as any).position;
    candidateRepo.findOneByOrFail.mockResolvedValue(candidate);

    await service.selectCandidate('candidate-1', 'team-A');

    const saved = playerRepo.save.mock.calls[0][0];
    expect(saved.position).toBeNull();
  });

  // Regression test for the old "potentialAbility: 50" bug — the UI
  // badge must reflect the candidate's *true* potential, not a constant.
  it('recomputes potentialAbility from potentialSkills (not the legacy constant 50)', async () => {
    candidateRepo.findOneByOrFail.mockResolvedValue(
      buildCandidate({ playerData: { ...buildCandidate().playerData, potentialSkills: elitePotential } }),
    );

    await service.selectCandidate('candidate-1', 'team-A');

    const saved = playerRepo.save.mock.calls[0][0];
    expect(saved.potentialAbility).toBeGreaterThan(85);
    expect(saved.potentialAbility).not.toBe(50);
  });

  it('recomputes potentialAbility for low-tier candidates correctly (well below 50)', async () => {
    candidateRepo.findOneByOrFail.mockResolvedValue(
      buildCandidate({ playerData: { ...buildCandidate().playerData, potentialSkills: lowPotential } }),
    );

    await service.selectCandidate('candidate-1', 'team-A');

    const saved = playerRepo.save.mock.calls[0][0];
    expect(saved.potentialAbility).toBeLessThan(50);
  });

  it('recomputes potentialAbility for high-tier candidates correctly (well above 50)', async () => {
    candidateRepo.findOneByOrFail.mockResolvedValue(
      buildCandidate({ playerData: { ...buildCandidate().playerData, potentialSkills: highPotential } }),
    );

    await service.selectCandidate('candidate-1', 'team-A');

    const saved = playerRepo.save.mock.calls[0][0];
    expect(saved.potentialAbility).toBeGreaterThan(60);
  });

  it('derives revealLevel from revealedSkills.length, capped at the total key count', async () => {
    const candidate = buildCandidate();
    candidate.playerData = {
      ...candidate.playerData,
      revealedSkills: ['pace', 'strength', 'finishing', 'passing', 'dribbling'],
    };
    candidateRepo.findOneByOrFail.mockResolvedValue(candidate);

    await service.selectCandidate('candidate-1', 'team-A');

    const saved = playerRepo.save.mock.calls[0][0];
    // 10 outfield keys → 5 revealed → revealLevel 5
    expect(saved.revealLevel).toBe(5);
    expect(saved.revealedSkills).toHaveLength(5);
  });

  it('caps revealLevel at the outfield key count (10) even if revealedSkills overflows', async () => {
    const candidate = buildCandidate();
    candidate.playerData = {
      ...candidate.playerData,
      // Garbage in: 12 entries (only 10 are valid keys).
      revealedSkills: [
        'pace', 'strength', 'finishing', 'passing', 'dribbling',
        'defending', 'positioning', 'composure', 'freeKicks', 'penalties',
        'nonsense1', 'nonsense2',
      ],
    };
    candidateRepo.findOneByOrFail.mockResolvedValue(candidate);

    await service.selectCandidate('candidate-1', 'team-A');

    const saved = playerRepo.save.mock.calls[0][0];
    expect(saved.revealLevel).toBe(10);
  });

  it('handles a goalkeeper candidate (9 keys instead of 10)', async () => {
    const candidate = buildCandidate();
    candidate.playerData = {
      ...candidate.playerData,
      isGoalkeeper: true,
      currentSkills: {
        physical: { pace: 10, strength: 10 },
        technical: { reflexes: 10, handling: 10, aerial: 10 },
        mental: { positioning: 10, composure: 10 },
        setPieces: { freeKicks: 10, penalties: 10 },
      },
      potentialSkills: {
        physical: { pace: 17, strength: 17 },
        technical: { reflexes: 17, handling: 17, aerial: 17 },
        mental: { positioning: 17, composure: 17 },
        setPieces: { freeKicks: 17, penalties: 17 },
      },
      revealedSkills: ['reflexes', 'handling', 'aerial'],
    };
    candidateRepo.findOneByOrFail.mockResolvedValue(candidate);

    await service.selectCandidate('candidate-1', 'team-A');

    const saved = playerRepo.save.mock.calls[0][0];
    expect(saved.isGoalkeeper).toBe(true);
    // GK has 9 keys, 3 revealed → revealLevel 3
    expect(saved.revealLevel).toBe(3);
  });

  it('rejects a candidate that does not belong to the requesting team', async () => {
    candidateRepo.findOneByOrFail.mockResolvedValue(buildCandidate());

    await expect(
      service.selectCandidate('candidate-1', 'team-B'),
    ).rejects.toThrow(/does not belong to team team-B/);
    expect(playerRepo.save).not.toHaveBeenCalled();
  });

  it('preserves specialty and youth_league_id from the candidate', async () => {
    candidateRepo.findOneByOrFail.mockResolvedValue(buildCandidate());
    youthTeamRepo.findOne.mockResolvedValue({
      id: 'yt-1',
      teamId: 'team-A',
      youthLeagueId: 'league-1',
    } as YouthTeamEntity);

    await service.selectCandidate('candidate-1', 'team-A');

    const saved = playerRepo.save.mock.calls[0][0];
    expect(saved.specialty).toBe('long_passer');
    expect(saved.youthLeagueId).toBe('league-1');
  });

  it('deletes the candidate row after a successful save', async () => {
    candidateRepo.findOneByOrFail.mockResolvedValue(buildCandidate());

    await service.selectCandidate('candidate-1', 'team-A');

    expect(candidateRepo.delete).toHaveBeenCalledWith({ id: 'candidate-1' });
  });
});
