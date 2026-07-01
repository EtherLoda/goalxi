import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { YouthProgressionProcessor } from './youth-progression.processor';
import { LOGGER_SERVICE } from '@goalxi/logger';
import {
  CoachPlayerAssignmentEntity,
  GKTechnical,
  OutfieldTechnical,
  PlayerEntity,
  StaffEntity,
  StaffLevel,
  StaffRole,
} from '@goalxi/database';

describe('YouthProgressionProcessor', () => {
  let processor: YouthProgressionProcessor;
  let playerRepo: jest.Mocked<Repository<PlayerEntity>>;
  let staffRepo: jest.Mocked<Repository<StaffEntity>>;
  let assignmentRepo: jest.Mocked<Repository<CoachPlayerAssignmentEntity>>;

  // ---- fixtures ----
  const outfieldSkills = () => ({
    physical: { pace: 10, strength: 10 },
    technical: { finishing: 10, passing: 10, dribbling: 10, defending: 10 },
    mental: { positioning: 10, composure: 10 },
    setPieces: { freeKicks: 10, penalties: 10 },
  });
  const gkSkills = () => ({
    physical: { pace: 10, strength: 10 },
    technical: { reflexes: 10, handling: 10, aerial: 10 },
    mental: { positioning: 10, composure: 10 },
    setPieces: { freeKicks: 10, penalties: 10 },
  });

  const outfieldYouth = (
    id: string,
    teamId: string,
    overrides: Partial<PlayerEntity> = {},
  ): PlayerEntity =>
    ({
      id,
      teamId,
      isYouth: true,
      isGoalkeeper: false,
      currentSkills: outfieldSkills(),
      potentialSkills: {
        physical: { pace: 18, strength: 18 },
        technical: { finishing: 18, passing: 18, dribbling: 18, defending: 18 },
        mental: { positioning: 18, composure: 18 },
        setPieces: { freeKicks: 18, penalties: 18 },
      },
      revealedSkills: ['pace', 'strength'],
      revealLevel: 2,
      fractionalAge: 16,
      ...overrides,
    }) as PlayerEntity;

  const gkYouth = (
    id: string,
    teamId: string,
    overrides: Partial<PlayerEntity> = {},
  ): PlayerEntity =>
    ({
      id,
      teamId,
      isYouth: true,
      isGoalkeeper: true,
      currentSkills: gkSkills(),
      potentialSkills: {
        physical: { pace: 18, strength: 18 },
        technical: { reflexes: 18, handling: 18, aerial: 18 },
        mental: { positioning: 18, composure: 18 },
        setPieces: { freeKicks: 18, penalties: 18 },
      },
      revealedSkills: ['reflexes'],
      revealLevel: 1,
      fractionalAge: 16,
      ...overrides,
    }) as PlayerEntity;

  const youthCoach = (
    id: string,
    teamId: string,
    trainedSkill: string | null,
    level: StaffLevel = StaffLevel.LEVEL_3,
  ): StaffEntity =>
    ({
      id,
      teamId,
      role: StaffRole.YOUTH_COACH,
      isActive: true,
      trainedSkill,
      level,
    }) as StaffEntity;

  // ---- mocks ----
  const mockPlayerRepo = {
    find: jest.fn(),
    save: jest.fn().mockImplementation(async (p: any) => p),
  };
  const mockStaffRepo = {
    find: jest.fn(),
  };
  const mockAssignmentRepo = {
    find: jest.fn(),
  };
  const mockLogger = {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPlayerRepo.save.mockImplementation(async (p: any) => p);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        // Always-positive RNG so growth always fires.
        { provide: YouthProgressionProcessor, useFactory: () => new YouthProgressionProcessor(
          mockLogger as any,
          mockPlayerRepo as any,
          mockStaffRepo as any,
          mockAssignmentRepo as any,
          () => 1,
        ) },
        { provide: LOGGER_SERVICE, useValue: mockLogger },
        { provide: getRepositoryToken(PlayerEntity), useValue: mockPlayerRepo },
        { provide: getRepositoryToken(StaffEntity), useValue: mockStaffRepo },
        {
          provide: getRepositoryToken(CoachPlayerAssignmentEntity),
          useValue: mockAssignmentRepo,
        },
      ],
    }).compile();

    processor = module.get(YouthProgressionProcessor);
    playerRepo = module.get(getRepositoryToken(PlayerEntity));
    staffRepo = module.get(getRepositoryToken(StaffEntity));
    assignmentRepo = module.get(getRepositoryToken(CoachPlayerAssignmentEntity));
  });

  // -------- 1: base growth only --------

  it('applies base weekly growth + reveal when no youth coach exists', async () => {
    const youth = outfieldYouth('y1', 'teamA');
    staffRepo.find.mockResolvedValue([]); // no youth coaches
    mockAssignmentRepo.find.mockResolvedValue([]);
    playerRepo.find.mockResolvedValue([youth]);

    const result = await processor.process({} as Job);

    expect(result.youthProcessed).toBe(1);
    expect(result.youthGrew).toBe(1);
    expect(result.youthCoachBoosted).toBe(0);
    expect(result.youthRevealed).toBe(1);
    expect(playerRepo.save).toHaveBeenCalledTimes(1);

    // Growth: every skill in currentSkills grew by 0.1 toward potential.
    expect(youth.currentSkills.physical.pace).toBeCloseTo(10.1, 5);
    expect(youth.currentSkills.physical.strength).toBeCloseTo(10.1, 5);
    // revealLevel must follow revealedSkills length.
    expect(youth.revealLevel).toBe(youth.revealedSkills.length);
  });

  // -------- 2: coach on physical, outfield youth --------

  it('boosts every skill in the coach\'s chosen category', async () => {
    const youth = outfieldYouth('y1', 'teamA');
    const coach = youthCoach('c1', 'teamA', 'physical', StaffLevel.LEVEL_3);
    staffRepo.find.mockResolvedValue([coach]);
    mockAssignmentRepo.find.mockResolvedValue([
      { coachId: 'c1', playerId: 'y1', trainingCategory: 'physical' } as CoachPlayerAssignmentEntity,
    ]);
    playerRepo.find.mockResolvedValue([youth]);

    await processor.process({} as Job);

    // physical skills: started at 10, base growth 0.1, plus a coach bonus.
    // The coach bonus is computed by calculateAssignedCoachBonus which
    // depends on level; level 3 + head coach absent → bonus = 1 + 0.15.
    // We don't pin the exact decimal, but pace MUST exceed the no-coach
    // baseline of 10.1.
    expect(youth.currentSkills.physical.pace).toBeGreaterThan(10.1);
    expect(youth.currentSkills.physical.strength).toBeGreaterThan(10.1);
    // non-physical skills should not be boosted (only base growth)
    expect((youth.currentSkills.technical as OutfieldTechnical).finishing).toBeCloseTo(10.1, 5);
    expect(youth.currentSkills.mental.positioning).toBeCloseTo(10.1, 5);
  });

  // -------- 3: youth coach exists but category not set --------

  it('does not crash and skips boost when youth coach has no trainedSkill', async () => {
    const youth = outfieldYouth('y1', 'teamA');
    const coach = youthCoach('c1', 'teamA', null);
    staffRepo.find.mockResolvedValue([coach]);
    mockAssignmentRepo.find.mockResolvedValue([
      { coachId: 'c1', playerId: 'y1', trainingCategory: null } as unknown as CoachPlayerAssignmentEntity,
    ]);
    playerRepo.find.mockResolvedValue([youth]);

    const result = await processor.process({} as Job);

    expect(result.youthCoachBoosted).toBe(0);
    // No crash, save still happens (base growth + reveal).
    expect(playerRepo.save).toHaveBeenCalled();
  });

  // -------- 4: switchable category — coach on technical --------

  it('honors a switched category without restarting the player', async () => {
    const youth = outfieldYouth('y1', 'teamA');
    const coach = youthCoach('c1', 'teamA', 'technical', StaffLevel.LEVEL_4);
    staffRepo.find.mockResolvedValue([coach]);
    mockAssignmentRepo.find.mockResolvedValue([
      { coachId: 'c1', playerId: 'y1', trainingCategory: 'technical' } as CoachPlayerAssignmentEntity,
    ]);
    playerRepo.find.mockResolvedValue([youth]);

    await processor.process({} as Job);

    // technical skills should be boosted (narrow the union)
    expect((youth.currentSkills.technical as OutfieldTechnical).finishing).toBeGreaterThan(10.1);
    // physical skills should be at the no-bonus baseline
    expect(youth.currentSkills.physical.pace).toBeCloseTo(10.1, 5);
  });

  // -------- 5: outfield youth + coach on "goalkeeper" --------

  it('produces no coach boost for an outfield youth when coach is on goalkeeper', async () => {
    const youth = outfieldYouth('y1', 'teamA');
    const coach = youthCoach('c1', 'teamA', 'goalkeeper', StaffLevel.LEVEL_3);
    staffRepo.find.mockResolvedValue([coach]);
    mockAssignmentRepo.find.mockResolvedValue([
      { coachId: 'c1', playerId: 'y1', trainingCategory: 'goalkeeper' } as CoachPlayerAssignmentEntity,
    ]);
    playerRepo.find.mockResolvedValue([youth]);

    const result = await processor.process({} as Job);

    // No skill keys to boost for an outfield player on the GK category.
    expect(result.youthCoachBoosted).toBe(0);
  });

  // -------- 6: GK youth + coach on goalkeeper --------

  it('boosts GK-specific skills for a GK youth when coach is on goalkeeper', async () => {
    const youth = gkYouth('y1', 'teamA');
    const coach = youthCoach('c1', 'teamA', 'goalkeeper', StaffLevel.LEVEL_3);
    staffRepo.find.mockResolvedValue([coach]);
    mockAssignmentRepo.find.mockResolvedValue([
      { coachId: 'c1', playerId: 'y1', trainingCategory: 'goalkeeper' } as CoachPlayerAssignmentEntity,
    ]);
    playerRepo.find.mockResolvedValue([youth]);

    await processor.process({} as Job);

    expect((youth.currentSkills.technical as GKTechnical).reflexes).toBeGreaterThan(10.1);
    expect((youth.currentSkills.technical as GKTechnical).handling).toBeGreaterThan(10.1);
    expect((youth.currentSkills.technical as GKTechnical).aerial).toBeGreaterThan(10.1);
  });

  // -------- 7: free-agent youth --------

  it('skips free-agent youth (no teamId) without crashing', async () => {
    const freeAgent = outfieldYouth('y1', null as any);
    staffRepo.find.mockResolvedValue([]);
    mockAssignmentRepo.find.mockResolvedValue([]);
    playerRepo.find.mockResolvedValue([freeAgent]);

    const result = await processor.process({} as Job);

    expect(result.youthProcessed).toBe(1);
    // Free agents are not saved (no growth expected for them yet).
    expect(playerRepo.save).not.toHaveBeenCalled();
  });

  // -------- 8: reveal level sync --------

  it('keeps revealLevel in sync with revealedSkills.length after every tick', async () => {
    const youth = outfieldYouth('y1', 'teamA', {
      revealedSkills: [
        'pace', 'strength', 'finishing', 'passing', 'dribbling',
      ],
    });
    staffRepo.find.mockResolvedValue([]);
    mockAssignmentRepo.find.mockResolvedValue([]);
    playerRepo.find.mockResolvedValue([youth]);

    await processor.process({} as Job);

    expect(youth.revealLevel).toBe(youth.revealedSkills.length);
    expect(youth.revealLevel).toBeGreaterThanOrEqual(5);
  });

  // -------- 9: 3-player cap is the assignment side, not the processor --------

  it('processes all assigned youths in a single tick (3 max is enforced at assignment time)', async () => {
    const youths = ['a', 'b', 'c'].map((id) => outfieldYouth(id, 'teamA'));
    const coach = youthCoach('c1', 'teamA', 'physical', StaffLevel.LEVEL_3);
    staffRepo.find.mockResolvedValue([coach]);
    mockAssignmentRepo.find.mockResolvedValue(
      youths.map(
        (p) =>
          ({
            coachId: 'c1',
            playerId: p.id,
            trainingCategory: 'physical',
          }) as unknown as CoachPlayerAssignmentEntity,
      ),
    );
    playerRepo.find.mockResolvedValue(youths);

    const result = await processor.process({} as Job);

    expect(result.youthProcessed).toBe(3);
    expect(result.youthCoachBoosted).toBe(3);
  });

  // -------- 10: no save when nothing changed --------

  it('skips the DB write when nothing changed (no growth, no reveal, no boost)', async () => {
    const youth = outfieldYouth('y1', 'teamA', {
      currentSkills: {
        physical: { pace: 18, strength: 18 },
        technical: { finishing: 18, passing: 18, dribbling: 18, defending: 18 },
        mental: { positioning: 18, composure: 18 },
        setPieces: { freeKicks: 18, penalties: 18 },
      },
      // All skills already revealed → no new reveal.
      revealedSkills: [
        'pace', 'strength', 'finishing', 'passing', 'dribbling', 'defending',
        'positioning', 'composure', 'freeKicks', 'penalties',
      ],
    });
    staffRepo.find.mockResolvedValue([]); // no coach
    mockAssignmentRepo.find.mockResolvedValue([]);
    playerRepo.find.mockResolvedValue([youth]);

    const result = await processor.process({} as Job);

    expect(result.youthGrew).toBe(0);
    expect(result.youthRevealed).toBe(0);
    expect(result.youthCoachBoosted).toBe(0);
    expect(playerRepo.save).not.toHaveBeenCalled();
  });
});
