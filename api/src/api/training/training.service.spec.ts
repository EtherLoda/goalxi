import {
  getTotalTrainingCost,
  PlayerEntity,
  StaffEntity,
  StaffLevel,
  StaffRole,
  TrainingCategory,
  TrainingSlot,
} from '@goalxi/database';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TrainingService } from './training.service';

describe('TrainingService', () => {
  let service: TrainingService;
  let playerRepo: jest.Mocked<Repository<PlayerEntity>>;
  let staffRepo: jest.Mocked<Repository<StaffEntity>>;

  const createPlayer = (overrides = {}): PlayerEntity =>
    ({
      id: 'player-1',
      name: 'Test Player',
      teamId: 'team-1',
      age: 20,
      isGoalkeeper: false,
      trainingSlot: TrainingSlot.REGULAR,
      trainingCategory: TrainingCategory.PHYSICAL,
      currentSkills: {
        physical: { pace: 10, strength: 10 },
        technical: { finishing: 10, passing: 10, dribbling: 10, defending: 10 },
        mental: { positioning: 10, composure: 10 },
        setPieces: { freeKicks: 10, penalties: 10 },
      },
      potentialSkills: {
        physical: { pace: 17, strength: 17 },
        technical: { finishing: 17, passing: 17, dribbling: 17, defending: 17 },
        mental: { positioning: 17, composure: 17 },
        setPieces: { freeKicks: 17, penalties: 17 },
      },
      ...overrides,
    }) as unknown as PlayerEntity;

  const createStaff = (role: StaffRole, level: number): StaffEntity =>
    ({
      id: `staff-${role}`,
      teamId: 'team-1',
      name: 'Test Staff',
      role,
      level: level as StaffLevel,
      salary: 1000,
      contractExpiry: new Date(),
      autoRenew: true,
      isActive: true,
    }) as unknown as StaffEntity;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrainingService,
        {
          provide: getRepositoryToken(PlayerEntity),
          useValue: { save: jest.fn(), find: jest.fn() },
        },
        {
          provide: getRepositoryToken(StaffEntity),
          useValue: { find: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<TrainingService>(TrainingService);
    playerRepo = module.get(getRepositoryToken(PlayerEntity));
    staffRepo = module.get(getRepositoryToken(StaffEntity));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateWeeklyTrainingPoints', () => {
    it('should return 0 for NONE training slot', () => {
      const player = createPlayer({ trainingSlot: TrainingSlot.NONE });
      const points = service.calculateWeeklyTrainingPoints(player, []);
      expect(points).toBe(0);
    });

    it('should calculate base points for REGULAR slot with no coaches', () => {
      const player = createPlayer({
        age: 20,
        trainingSlot: TrainingSlot.REGULAR,
      });
      const points = service.calculateWeeklyTrainingPoints(player, []);
      // BASE=30, age=20 (factor≈0.895), no coaches
      // 30 × 1.0 × 0.895 ≈ 26.85
      expect(points).toBeGreaterThan(0);
      expect(points).toBeLessThan(30);
    });

    it('should apply ENHANCED multiplier (1.5x)', () => {
      const player = createPlayer({
        age: 20,
        trainingSlot: TrainingSlot.ENHANCED,
      });
      const regularPoints = service.calculateWeeklyTrainingPoints(
        createPlayer({ age: 20, trainingSlot: TrainingSlot.REGULAR }),
        [],
      );
      const enhancedPoints = service.calculateWeeklyTrainingPoints(player, []);
      expect(enhancedPoints).toBeCloseTo(regularPoints * 1.5, 1);
    });

    it('should apply head coach bonus', () => {
      const player = createPlayer({
        age: 20,
        trainingSlot: TrainingSlot.REGULAR,
      });
      const headCoach = createStaff(StaffRole.HEAD_COACH, 5); // +25%
      const noCoachPoints = service.calculateWeeklyTrainingPoints(player, []);
      const withCoachPoints = service.calculateWeeklyTrainingPoints(player, [
        headCoach,
      ]);
      expect(withCoachPoints).toBeGreaterThan(noCoachPoints);
    });

    it('should apply category-specific coach bonus', () => {
      const player = createPlayer({
        age: 20,
        trainingSlot: TrainingSlot.REGULAR,
      });
      const headCoach = createStaff(StaffRole.HEAD_COACH, 5);
      const fitnessCoach = createStaff(StaffRole.FITNESS_COACH, 5);
      const techCoach = createStaff(StaffRole.TECHNICAL_COACH, 5);

      const onlyHead = service.calculateWeeklyTrainingPoints(player, [
        headCoach,
      ]);
      const withFitness = service.calculateWeeklyTrainingPoints(player, [
        headCoach,
        fitnessCoach,
      ]);
      const withBoth = service.calculateWeeklyTrainingPoints(player, [
        headCoach,
        fitnessCoach,
        techCoach,
      ]);

      // Adding fitness coach (matching PHYSICAL category) increases points
      expect(withFitness).toBeGreaterThan(onlyHead);
      // Tech coach doesn't add bonus since category is PHYSICAL, not TECHNICAL
      expect(withBoth).toBe(withFitness);
    });

    it('should apply age factor (17 years = 1.0)', () => {
      const youngPlayer = createPlayer({
        age: 17,
        trainingSlot: TrainingSlot.REGULAR,
      });
      const oldPlayer = createPlayer({
        age: 30,
        trainingSlot: TrainingSlot.REGULAR,
      });

      const youngPoints = service.calculateWeeklyTrainingPoints(
        youngPlayer,
        [],
      );
      const oldPoints = service.calculateWeeklyTrainingPoints(oldPlayer, []);

      expect(youngPoints).toBeGreaterThan(oldPoints);
    });

    it('should cap at age 36', () => {
      const player36 = createPlayer({
        age: 36,
        trainingSlot: TrainingSlot.REGULAR,
      });
      const player40 = createPlayer({
        age: 40,
        trainingSlot: TrainingSlot.REGULAR,
      });

      const points36 = service.calculateWeeklyTrainingPoints(player36, []);
      const points40 = service.calculateWeeklyTrainingPoints(player40, []);

      expect(points36).toBe(points40);
    });

    it('should combine head coach and category coach bonus', () => {
      const player = createPlayer({
        age: 20,
        trainingSlot: TrainingSlot.REGULAR,
      });
      const headCoach = createStaff(StaffRole.HEAD_COACH, 5);
      const fitnessCoach = createStaff(StaffRole.FITNESS_COACH, 5);
      const techCoach = createStaff(StaffRole.TECHNICAL_COACH, 5);

      // Formula: 1 + headBonus + categoryBonus
      // headBonus = 0.25 (level 5 * 5%)
      // categoryBonus = 0.25 (fitness coach matches PHYSICAL category)
      // multiplier = 1 + 0.25 + 0.25 = 1.5
      // tech coach doesn't add since category is PHYSICAL
      const points = service.calculateWeeklyTrainingPoints(player, [
        headCoach,
        fitnessCoach,
        techCoach,
      ]);
      const noCoachPoints = service.calculateWeeklyTrainingPoints(player, []);

      // Should be exactly 1.5x (head + category coach matching PHYSICAL)
      expect(points / noCoachPoints).toBeCloseTo(1.5, 2);
    });
  });

  describe('applyTrainingToPlayer', () => {
    it('should not increase skills beyond potential', async () => {
      const player = createPlayer({
        currentSkills: {
          physical: { pace: 16, strength: 16 },
          technical: {
            finishing: 16,
            passing: 16,
            dribbling: 16,
            defending: 16,
          },
          mental: { positioning: 16, composure: 16 },
          setPieces: { freeKicks: 16, penalties: 16 },
        },
        potentialSkills: {
          physical: { pace: 17, strength: 17 },
          technical: {
            finishing: 17,
            passing: 17,
            dribbling: 17,
            defending: 17,
          },
          mental: { positioning: 17, composure: 17 },
          setPieces: { freeKicks: 17, penalties: 17 },
        },
      });

      playerRepo.save.mockImplementation((p) =>
        Promise.resolve(p as PlayerEntity),
      );
      const result = await service.applyTrainingToPlayer(player, 1, []);

      // Should not gain any levels since already at/near potential
      const totalGained = result.skillsGained.reduce(
        (sum, g) => sum + g.levels,
        0,
      );
      expect(totalGained).toBe(0);
    });

    it('should train only ONE random skill per session', async () => {
      const player = createPlayer({
        age: 17,
        trainingSlot: TrainingSlot.ENHANCED,
        currentSkills: {
          physical: { pace: 10, strength: 10 },
          technical: {
            finishing: 10,
            passing: 10,
            dribbling: 10,
            defending: 10,
          },
          mental: { positioning: 10, composure: 10 },
          setPieces: { freeKicks: 10, penalties: 10 },
        },
        potentialSkills: {
          physical: { pace: 17, strength: 17 },
          technical: {
            finishing: 17,
            passing: 17,
            dribbling: 17,
            defending: 17,
          },
          mental: { positioning: 17, composure: 17 },
          setPieces: { freeKicks: 17, penalties: 17 },
        },
      });

      playerRepo.save.mockImplementation((p) =>
        Promise.resolve(p as PlayerEntity),
      );
      const result = await service.applyTrainingToPlayer(player, 8, []);

      // Should have gained exactly one skill (random selection)
      expect(result.skillsGained.length).toBe(1);
      expect(result.totalPointsSpent).toBeGreaterThan(0);
    });

    it('should return 0 points for NONE slot', async () => {
      const player = createPlayer({ trainingSlot: TrainingSlot.NONE });
      const result = await service.applyTrainingToPlayer(player, 1, []);

      expect(result.weeklyPoints).toBe(0);
      expect(result.skillsGained.length).toBe(0);
    });

    it('should multiply points by weeks elapsed', async () => {
      const player = createPlayer({
        age: 17,
        trainingSlot: TrainingSlot.ENHANCED,
      });
      playerRepo.save.mockImplementation((p) =>
        Promise.resolve(p as PlayerEntity),
      );

      const result1 = await service.applyTrainingToPlayer(player, 1, []);
      const result4 = await service.applyTrainingToPlayer(player, 4, []);

      expect(result4.totalPointsSpent).toBeGreaterThan(
        result1.totalPointsSpent,
      );
    });

    it('should train specified skill when trainingSkill is provided', async () => {
      const player = createPlayer({
        age: 17,
        trainingSlot: TrainingSlot.ENHANCED,
        currentSkills: {
          physical: { pace: 10, strength: 10 },
          technical: {
            finishing: 10,
            passing: 10,
            dribbling: 10,
            defending: 10,
          },
          mental: { positioning: 10, composure: 10 },
          setPieces: { freeKicks: 10, penalties: 10 },
        },
        potentialSkills: {
          physical: { pace: 17, strength: 17 },
          technical: {
            finishing: 17,
            passing: 17,
            dribbling: 17,
            defending: 17,
          },
          mental: { positioning: 17, composure: 17 },
          setPieces: { freeKicks: 17, penalties: 17 },
        },
        trainingSkill: 'finishing',
      });

      playerRepo.save.mockImplementation((p) =>
        Promise.resolve(p as PlayerEntity),
      );
      const result = await service.applyTrainingToPlayer(player, 8, []);

      // Should have gained exactly one skill - the specified one
      // finishing speed=0.85, level10->11 costs (100+20)/0.85=141, 8 weeks=160 points enough
      expect(result.skillsGained.length).toBe(1);
      expect(result.skillsGained[0].skill).toBe('finishing');
      expect(result.totalPointsSpent).toBeGreaterThan(0);
    });
  });

  describe('processTeamTraining', () => {
    it('should process all players on team', async () => {
      const players = [
        createPlayer({ id: 'p1', name: 'Player 1' }),
        createPlayer({ id: 'p2', name: 'Player 2' }),
      ];
      playerRepo.find.mockResolvedValue(players);
      playerRepo.save.mockImplementation((p) =>
        Promise.resolve(p as PlayerEntity),
      );
      staffRepo.find.mockResolvedValue([]);

      const results = await service.processTeamTraining('team-1', 1);

      expect(results.length).toBe(2);
      expect(playerRepo.find).toHaveBeenCalled();
    });
  });

  describe('Training time scenarios', () => {
    const fullCoaches = [
      createStaff(StaffRole.HEAD_COACH, 5),
      createStaff(StaffRole.FITNESS_COACH, 5),
      createStaff(StaffRole.TECHNICAL_COACH, 5),
      createStaff(StaffRole.PSYCHOLOGY_COACH, 5),
      createStaff(StaffRole.SET_PIECE_COACH, 5),
    ];

    it('Scenario 1: 7 start -> 18 potential, ENHANCED, full coaches', async () => {
      // All skills at 7, potential 18
      const player = createPlayer({
        age: 17,
        trainingSlot: TrainingSlot.ENHANCED,
        currentSkills: {
          physical: { pace: 7, strength: 7 },
          technical: { finishing: 7, passing: 7, dribbling: 7, defending: 7 },
          mental: { positioning: 7, composure: 7 },
          setPieces: { freeKicks: 7, penalties: 7 },
        },
        potentialSkills: {
          physical: { pace: 18, strength: 18 },
          technical: {
            finishing: 18,
            passing: 18,
            dribbling: 18,
            defending: 18,
          },
          mental: { positioning: 18, composure: 18 },
          setPieces: { freeKicks: 18, penalties: 18 },
        },
      });

      playerRepo.save.mockImplementation((p) =>
        Promise.resolve(p as PlayerEntity),
      );

      const weeklyPoints = service.calculateWeeklyTrainingPoints(
        player,
        fullCoaches,
      );
      const totalCost = getTotalTrainingCost(7, 18); // 7->18 = 11 level-ups
      const weeksNeeded = Math.ceil(totalCost / weeklyPoints);

      console.log(
        `Scenario 1: ${weeklyPoints} pts/week, total cost ${totalCost.toFixed(0)}, ${weeksNeeded} weeks to reach potential`,
      );

      // Weekly = 20 * 1.5 (ENHANCED) * 1.0 (age 17) * 1.5 (full coaches) = 45
      expect(weeklyPoints).toBeCloseTo(45, 1);
      // Total cost 7->18 per skill: ~1914 points
      expect(totalCost).toBeGreaterThan(1900);
      // Single skill: 1914 / 45 ≈ 43 weeks
      expect(weeksNeeded).toBeLessThanOrEqual(43);
    });

    it('Scenario 2: 6 start -> 15 potential, ENHANCED, full coaches', async () => {
      const player = createPlayer({
        age: 17,
        trainingSlot: TrainingSlot.ENHANCED,
        currentSkills: {
          physical: { pace: 6, strength: 6 },
          technical: { finishing: 6, passing: 6, dribbling: 6, defending: 6 },
          mental: { positioning: 6, composure: 6 },
          setPieces: { freeKicks: 6, penalties: 6 },
        },
        potentialSkills: {
          physical: { pace: 15, strength: 15 },
          technical: {
            finishing: 15,
            passing: 15,
            dribbling: 15,
            defending: 15,
          },
          mental: { positioning: 15, composure: 15 },
          setPieces: { freeKicks: 15, penalties: 15 },
        },
      });

      playerRepo.save.mockImplementation((p) =>
        Promise.resolve(p as PlayerEntity),
      );

      const weeklyPoints = service.calculateWeeklyTrainingPoints(
        player,
        fullCoaches,
      );
      const totalCost = getTotalTrainingCost(6, 15); // 6->15 = 9 level-ups
      const weeksNeeded = Math.ceil(totalCost / weeklyPoints);

      console.log(
        `Scenario 2: ${weeklyPoints} pts/week, total cost ${totalCost.toFixed(0)}, ${weeksNeeded} weeks to reach potential`,
      );

      // Weekly = 20 * 1.5 (ENHANCED) * 1.0 (age 17) * 1.5 (full coaches) = 45
      expect(weeklyPoints).toBeCloseTo(45, 1);
      // Total cost 6->15 per skill: ~1140 points
      expect(totalCost).toBeGreaterThan(1100);
      // Single skill: 1140 / 45 ≈ 26 weeks
      expect(weeksNeeded).toBeLessThanOrEqual(26);
    });

    it('Scenario 3: 6 start -> 12 potential, REGULAR, full coaches', async () => {
      const player = createPlayer({
        age: 17,
        trainingSlot: TrainingSlot.REGULAR,
        currentSkills: {
          physical: { pace: 6, strength: 6 },
          technical: { finishing: 6, passing: 6, dribbling: 6, defending: 6 },
          mental: { positioning: 6, composure: 6 },
          setPieces: { freeKicks: 6, penalties: 6 },
        },
        potentialSkills: {
          physical: { pace: 12, strength: 12 },
          technical: {
            finishing: 12,
            passing: 12,
            dribbling: 12,
            defending: 12,
          },
          mental: { positioning: 12, composure: 12 },
          setPieces: { freeKicks: 12, penalties: 12 },
        },
      });

      playerRepo.save.mockImplementation((p) =>
        Promise.resolve(p as PlayerEntity),
      );

      const weeklyPoints = service.calculateWeeklyTrainingPoints(
        player,
        fullCoaches,
      );
      const totalCost = getTotalTrainingCost(6, 12); // 6->12 = 6 level-ups
      const weeksNeeded = Math.ceil(totalCost / weeklyPoints);

      console.log(
        `Scenario 3: ${weeklyPoints} pts/week, total cost ${totalCost.toFixed(0)}, ${weeksNeeded} weeks to reach potential`,
      );

      // Weekly = 20 * 1.0 (REGULAR) * 1.0 (age 17) * 1.5 (full coaches) = 30
      expect(weeklyPoints).toBeCloseTo(30, 1);
      // Total cost 6->12 per skill: ~571 points
      expect(totalCost).toBeGreaterThan(560);
      // Single skill: 571 / 30 ≈ 20 weeks
      expect(weeksNeeded).toBeLessThanOrEqual(20);
    });
  });
});
