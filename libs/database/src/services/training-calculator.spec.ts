import {
  calculateWeeklyTrainingPoints,
  distributeTrainingPoints,
  applyTrainingToPlayer,
  getPlayerSkillKeys,
  getSkillLevel,
  setSkillLevel,
} from './training-calculator';
import { StaffEntity, StaffLevel, StaffRole } from '../entities/staff.entity';
import { PlayerSkills, TrainingCategory, TrainingSlot } from '../entities/player.entity';

describe('TrainingCalculator', () => {
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

  describe('getPlayerSkillKeys', () => {
    it('should return GK skills for goalkeeper', () => {
      const keys = getPlayerSkillKeys(true);
      expect(keys).toContain('reflexes');
      expect(keys).toContain('handling');
      expect(keys).toContain('distribution');
      expect(keys).not.toContain('finishing');
      expect(keys).not.toContain('dribbling');
    });

    it('should return outfield skills for non-goalkeeper', () => {
      const keys = getPlayerSkillKeys(false);
      expect(keys).toContain('finishing');
      expect(keys).toContain('passing');
      expect(keys).toContain('dribbling');
      expect(keys).not.toContain('reflexes');
      expect(keys).not.toContain('handling');
    });
  });

  describe('getSkillLevel', () => {
    it('should return skill level from player skills', () => {
      const skills: PlayerSkills = {
        physical: { pace: 15, strength: 12 },
        technical: { finishing: 10, passing: 8, dribbling: 9, defending: 7 },
        mental: { positioning: 11, composure: 13 },
        setPieces: { freeKicks: 5, penalties: 6 },
      };

      expect(getSkillLevel(skills, 'pace')).toBe(15);
      expect(getSkillLevel(skills, 'finishing')).toBe(10);
      expect(getSkillLevel(skills, 'positioning')).toBe(11);
    });

    it('should return 0 for non-existent skill', () => {
      const skills: PlayerSkills = {
        physical: { pace: 15, strength: 12 },
        technical: { finishing: 10, passing: 8, dribbling: 9, defending: 7 },
        mental: { positioning: 11, composure: 13 },
        setPieces: { freeKicks: 5, penalties: 6 },
      };

      expect(getSkillLevel(skills, 'unknown')).toBe(0);
    });
  });

  describe('setSkillLevel', () => {
    it('should set skill level', () => {
      const skills: PlayerSkills = {
        physical: { pace: 15, strength: 12 },
        technical: { finishing: 10, passing: 8, dribbling: 9, defending: 7 },
        mental: { positioning: 11, composure: 13 },
        setPieces: { freeKicks: 5, penalties: 6 },
      };

      setSkillLevel(skills, 'pace', 20);
      expect(skills.physical.pace).toBe(20);
    });
  });

  describe('calculateWeeklyTrainingPoints', () => {
    it('should return 0 for NONE training slot', () => {
      const points = calculateWeeklyTrainingPoints(20, TrainingSlot.NONE, TrainingCategory.PHYSICAL, []);
      expect(points).toBe(0);
    });

    it('should calculate base points for REGULAR slot', () => {
      const points = calculateWeeklyTrainingPoints(20, TrainingSlot.REGULAR, TrainingCategory.PHYSICAL, []);
      // BASE=30, age 20 factor≈0.895, no coaches
      // 30 * 1.0 * 0.895 ≈ 26.85
      expect(points).toBeGreaterThan(25);
      expect(points).toBeLessThan(30);
    });

    it('should apply ENHANCED multiplier (1.5x)', () => {
      const regular = calculateWeeklyTrainingPoints(20, TrainingSlot.REGULAR, TrainingCategory.PHYSICAL, []);
      const enhanced = calculateWeeklyTrainingPoints(20, TrainingSlot.ENHANCED, TrainingCategory.PHYSICAL, []);
      expect(enhanced).toBeCloseTo(regular * 1.5, 1);
    });

    it('should apply head coach bonus', () => {
      const headCoach = createStaff(StaffRole.HEAD_COACH, 5);
      const noCoach = calculateWeeklyTrainingPoints(20, TrainingSlot.REGULAR, TrainingCategory.PHYSICAL, []);
      const withCoach = calculateWeeklyTrainingPoints(20, TrainingSlot.REGULAR, TrainingCategory.PHYSICAL, [headCoach]);
      expect(withCoach).toBeGreaterThan(noCoach);
    });

    it('should apply category-specific coach bonus', () => {
      const headCoach = createStaff(StaffRole.HEAD_COACH, 5);
      const fitnessCoach = createStaff(StaffRole.FITNESS_COACH, 5);

      const onlyHead = calculateWeeklyTrainingPoints(20, TrainingSlot.REGULAR, TrainingCategory.PHYSICAL, [headCoach]);
      const withFitness = calculateWeeklyTrainingPoints(20, TrainingSlot.REGULAR, TrainingCategory.PHYSICAL, [headCoach, fitnessCoach]);

      // Adding fitness coach (matching PHYSICAL category) increases points
      expect(withFitness).toBeGreaterThan(onlyHead);
    });

    it('should combine head and category coach bonuses', () => {
      const headCoach = createStaff(StaffRole.HEAD_COACH, 5);
      const fitnessCoach = createStaff(StaffRole.FITNESS_COACH, 5);

      const points = calculateWeeklyTrainingPoints(20, TrainingSlot.REGULAR, TrainingCategory.PHYSICAL, [headCoach, fitnessCoach]);
      const noCoach = calculateWeeklyTrainingPoints(20, TrainingSlot.REGULAR, TrainingCategory.PHYSICAL, []);

      // Formula: 1 + 0.25 (head) + 0.25 (fitness) = 1.5
      expect(points / noCoach).toBe(1.5);
    });
  });

  describe('distributeTrainingPoints', () => {
    const baseCurrentSkills: PlayerSkills = {
      physical: { pace: 10, strength: 10 },
      technical: { finishing: 10, passing: 10, dribbling: 10, defending: 10 },
      mental: { positioning: 10, composure: 10 },
      setPieces: { freeKicks: 10, penalties: 10 },
    };

    const basePotentialSkills: PlayerSkills = {
      physical: { pace: 17, strength: 17 },
      technical: { finishing: 17, passing: 17, dribbling: 17, defending: 17 },
      mental: { positioning: 17, composure: 17 },
      setPieces: { freeKicks: 17, penalties: 17 },
    };

    it('should return empty when all skills at potential', () => {
      const currentSkills: PlayerSkills = {
        physical: { pace: 17, strength: 17 },
        technical: { finishing: 17, passing: 17, dribbling: 17, defending: 17 },
        mental: { positioning: 17, composure: 17 },
        setPieces: { freeKicks: 17, penalties: 17 },
      };

      const result = distributeTrainingPoints(currentSkills, basePotentialSkills, 1000, false);
      expect(result.gains).toHaveLength(0);
      expect(result.totalSpent).toBe(0);
    });

    it('should train one random skill when trainingSkill not specified', () => {
      const result = distributeTrainingPoints(baseCurrentSkills, basePotentialSkills, 1000, false);

      expect(result.gains).toHaveLength(1);
      expect(result.gains[0].levels).toBeGreaterThan(0);
      expect(result.totalSpent).toBeGreaterThan(0);
    });

    it('should train specified skill when trainingSkill is provided', () => {
      const currentSkills: PlayerSkills = {
        physical: { pace: 17, strength: 17 },
        technical: { finishing: 5, passing: 17, dribbling: 17, defending: 17 },
        mental: { positioning: 17, composure: 17 },
        setPieces: { freeKicks: 17, penalties: 17 },
      };
      const potentialSkills: PlayerSkills = {
        physical: { pace: 17, strength: 17 },
        technical: { finishing: 10, passing: 17, dribbling: 17, defending: 17 },
        mental: { positioning: 17, composure: 17 },
        setPieces: { freeKicks: 17, penalties: 17 },
      };

      // Use low starting level (5) so points are enough to gain levels
      // 5->10 costs about 200 pts, and we have 1000
      const result = distributeTrainingPoints(currentSkills, potentialSkills, 1000, false, 'finishing');

      expect(result.gains).toHaveLength(1);
      expect(result.gains[0].skill).toBe('finishing');
      expect(result.gains[0].levels).toBeGreaterThan(0);
    });

    it('should train specified skill even if not in eligible category (random fallback)', () => {
      // If specified skill is at potential, should fall back to random eligible
      const skillsNearPotential: PlayerSkills = {
        physical: { pace: 17, strength: 17 },
        technical: { finishing: 17, passing: 10, dribbling: 10, defending: 10 },
        mental: { positioning: 10, composure: 10 },
        setPieces: { freeKicks: 10, penalties: 10 },
      };

      const result = distributeTrainingPoints(skillsNearPotential, basePotentialSkills, 1000, false, 'pace');

      // pace is at potential (17), so should fall back to random
      expect(result.gains).toHaveLength(1);
    });

    it('should spend all points within potential limit', () => {
      const result = distributeTrainingPoints(baseCurrentSkills, basePotentialSkills, 500, false, 'finishing');

      // Should not exceed potential
      expect(result.gains[0]?.levels).toBeLessThanOrEqual(7); // 10 -> 17 = max 7 levels
    });
  });

  describe('applyTrainingToPlayer', () => {
    const staffList = [
      createStaff(StaffRole.HEAD_COACH, 5),
      createStaff(StaffRole.FITNESS_COACH, 5),
    ];

    it('should return 0 weeklyPoints for NONE slot', () => {
      const result = applyTrainingToPlayer(
        'player-1',
        20,
        { physical: { pace: 10, strength: 10 }, technical: { finishing: 10, passing: 10, dribbling: 10, defending: 10 }, mental: { positioning: 10, composure: 10 }, setPieces: { freeKicks: 10, penalties: 10 } },
        { physical: { pace: 17, strength: 17 }, technical: { finishing: 17, passing: 17, dribbling: 17, defending: 17 }, mental: { positioning: 17, composure: 17 }, setPieces: { freeKicks: 17, penalties: 17 } },
        TrainingSlot.NONE,
        TrainingCategory.PHYSICAL,
        false,
        staffList,
        1,
      );

      expect(result.weeklyPoints).toBe(0);
      expect(result.skillsGained).toHaveLength(0);
    });

    it('should apply training for specified weeks', () => {
      const result = applyTrainingToPlayer(
        'player-1',
        17,
        { physical: { pace: 10, strength: 10 }, technical: { finishing: 10, passing: 10, dribbling: 10, defending: 10 }, mental: { positioning: 10, composure: 10 }, setPieces: { freeKicks: 10, penalties: 10 } },
        { physical: { pace: 17, strength: 17 }, technical: { finishing: 17, passing: 17, dribbling: 17, defending: 17 }, mental: { positioning: 17, composure: 17 }, setPieces: { freeKicks: 17, penalties: 17 } },
        TrainingSlot.ENHANCED,
        TrainingCategory.PHYSICAL,
        false,
        staffList,
        4,
      );

      expect(result.weeklyPoints).toBeGreaterThan(0);
      expect(result.totalPointsSpent).toBeGreaterThan(0);
    });

    it('should train specified skill when trainingSkill provided', () => {
      const currentSkills = { physical: { pace: 10, strength: 10 }, technical: { finishing: 10, passing: 10, dribbling: 10, defending: 10 }, mental: { positioning: 10, composure: 10 }, setPieces: { freeKicks: 10, penalties: 10 } };
      const potentialSkills = { physical: { pace: 17, strength: 17 }, technical: { finishing: 17, passing: 17, dribbling: 17, defending: 17 }, mental: { positioning: 17, composure: 17 }, setPieces: { freeKicks: 17, penalties: 17 } };

      // Use 4 weeks to accumulate enough points (4 * ~56 pts = ~225 pts, but 10->17 costs ~436)
      // Actually let's use the actual staff that matches TECHNICAL category
      const techStaff = createStaff(StaffRole.TECHNICAL_COACH, 5);
      const result = applyTrainingToPlayer(
        'player-1',
        17,
        currentSkills,
        potentialSkills,
        TrainingSlot.ENHANCED,
        TrainingCategory.TECHNICAL,
        false,
        [createStaff(StaffRole.HEAD_COACH, 5), techStaff],
        4, // 4 weeks to accumulate more points
        'finishing',
      );

      expect(result.skillsGained).toHaveLength(1);
      expect(result.skillsGained[0].skill).toBe('finishing');
    });
  });
});
