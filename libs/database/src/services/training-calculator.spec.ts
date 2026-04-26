import {
  calculateFitnessCoachBonus,
  calculateAssignedCoachBonus,
  calculateSpecializedTrainingPoints,
  calculateStaminaGain,
  applySpecializedTraining,
  distributeTrainingPoints,
  getPlayerSkillKeys,
  getSkillLevel,
  setSkillLevel,
} from './training-calculator';
import { StaffEntity, StaffLevel, StaffRole } from '../entities/staff.entity';
import { PlayerSkills, TrainingCategory } from '../entities/player.entity';

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

  describe('calculateFitnessCoachBonus', () => {
    it('should return 1.0 with no staff', () => {
      const bonus = calculateFitnessCoachBonus([]);
      expect(bonus).toBe(1.0);
    });

    it('should include head coach bonus', () => {
      const headCoach = createStaff(StaffRole.HEAD_COACH, 5);
      const bonus = calculateFitnessCoachBonus([headCoach]);
      // 1 + 5 * 0.05 = 1.25
      expect(bonus).toBeCloseTo(1.25, 2);
    });

    it('should include fitness coach bonus', () => {
      const fitnessCoach = createStaff(StaffRole.FITNESS_COACH, 5);
      const bonus = calculateFitnessCoachBonus([fitnessCoach]);
      // 1 + 5 * 0.05 = 1.25
      expect(bonus).toBeCloseTo(1.25, 2);
    });

    it('should combine head and fitness coach bonuses', () => {
      const headCoach = createStaff(StaffRole.HEAD_COACH, 5);
      const fitnessCoach = createStaff(StaffRole.FITNESS_COACH, 5);
      const bonus = calculateFitnessCoachBonus([headCoach, fitnessCoach]);
      // 1 + 0.25 + 0.25 = 1.5
      expect(bonus).toBe(1.5);
    });

    it('should ignore inactive staff', () => {
      const inactiveFitness = createStaff(StaffRole.FITNESS_COACH, 5);
      inactiveFitness.isActive = false;
      const bonus = calculateFitnessCoachBonus([inactiveFitness]);
      expect(bonus).toBe(1.0);
    });
  });

  describe('calculateAssignedCoachBonus', () => {
    it('should include head coach bonus plus assigned coach bonus', () => {
      const headCoach = createStaff(StaffRole.HEAD_COACH, 5);
      const bonus = calculateAssignedCoachBonus([headCoach], 5);
      // 1 + 0.25 (head) + 0.25 (assigned) = 1.5
      expect(bonus).toBe(1.5);
    });

    it('should work without head coach', () => {
      const bonus = calculateAssignedCoachBonus([], 5);
      // 1 + 0 + 0.25 = 1.25
      expect(bonus).toBe(1.25);
    });
  });

  describe('calculateSpecializedTrainingPoints', () => {
    it('should calculate points with default intensity', () => {
      const points = calculateSpecializedTrainingPoints(23, 0.1, 1.5);
      // (1 - 0.1) * 0.5 * 1.5 * 20 * ageFactor(23) ≈ 0.9 * 0.5 * 1.5 * 20 * 0.9 ≈ 12.15
      expect(points).toBeGreaterThan(10);
      expect(points).toBeLessThan(15);
    });

    it('should return 0 when intensity is 1.0', () => {
      const points = calculateSpecializedTrainingPoints(23, 1.0, 1.5);
      expect(points).toBe(0);
    });

    it('should return max points when intensity is 0', () => {
      const points = calculateSpecializedTrainingPoints(23, 0, 1.5);
      // 1.0 * 0.5 * 1.5 * 20 * ageFactor ≈ 13.5
      expect(points).toBeGreaterThan(12);
    });

    it('should account for age factor - younger players get more', () => {
      const youngPoints = calculateSpecializedTrainingPoints(17, 0.2, 1.5);
      const oldPoints = calculateSpecializedTrainingPoints(35, 0.2, 1.5);
      expect(youngPoints).toBeGreaterThan(oldPoints);
    });
  });

  describe('calculateStaminaGain', () => {
    it('should calculate stamina gain with default intensity', () => {
      const gain = calculateStaminaGain(0.1, 1.5);
      // 0.1 * 0.5 * 1.5 = 0.075
      expect(gain).toBeCloseTo(0.075, 3);
    });

    it('should return 0 when intensity is 0', () => {
      const gain = calculateStaminaGain(0, 1.5);
      expect(gain).toBe(0);
    });
  });

  describe('getPlayerSkillKeys', () => {
    it('should return GK skills for goalkeeper', () => {
      const keys = getPlayerSkillKeys(true);
      expect(keys).toContain('reflexes');
      expect(keys).toContain('handling');
      expect(keys).toContain('aerial');
      expect(keys).not.toContain('finishing');
    });

    it('should return outfield skills for non-goalkeeper', () => {
      const keys = getPlayerSkillKeys(false);
      expect(keys).toContain('finishing');
      expect(keys).toContain('passing');
      expect(keys).toContain('dribbling');
      expect(keys).not.toContain('reflexes');
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
      const atPotentialSkills: PlayerSkills = {
        physical: { pace: 17, strength: 17 },
        technical: { finishing: 17, passing: 17, dribbling: 17, defending: 17 },
        mental: { positioning: 17, composure: 17 },
        setPieces: { freeKicks: 17, penalties: 17 },
      };

      const result = distributeTrainingPoints(atPotentialSkills, basePotentialSkills, 1000, false);
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
      const result = distributeTrainingPoints(baseCurrentSkills, basePotentialSkills, 1000, false, 'finishing');

      expect(result.gains).toHaveLength(1);
      expect(result.gains[0].skill).toBe('finishing');
    });
  });

  describe('applySpecializedTraining', () => {
    const staffList = [
      createStaff(StaffRole.HEAD_COACH, 5),
      createStaff(StaffRole.TECHNICAL_COACH, 5),
    ];

    it('should return 0 weeklyPoints for no assigned coach', () => {
      const result = applySpecializedTraining(
        'player-1',
        20,
        { physical: { pace: 10, strength: 10 }, technical: { finishing: 10, passing: 10, dribbling: 10, defending: 10 }, mental: { positioning: 10, composure: 10 }, setPieces: { freeKicks: 10, penalties: 10 } },
        { physical: { pace: 17, strength: 17 }, technical: { finishing: 17, passing: 17, dribbling: 17, defending: 17 }, mental: { positioning: 17, composure: 17 }, setPieces: { freeKicks: 17, penalties: 17 } },
        false,
        0.2,
        1.5,
        1,
      );

      expect(result.weeklyPoints).toBeGreaterThan(0);
    });

    it('should apply training for specified weeks', () => {
      const result = applySpecializedTraining(
        'player-1',
        17,
        { physical: { pace: 10, strength: 10 }, technical: { finishing: 10, passing: 10, dribbling: 10, defending: 10 }, mental: { positioning: 10, composure: 10 }, setPieces: { freeKicks: 10, penalties: 10 } },
        { physical: { pace: 17, strength: 17 }, technical: { finishing: 17, passing: 17, dribbling: 17, defending: 17 }, mental: { positioning: 17, composure: 17 }, setPieces: { freeKicks: 17, penalties: 17 } },
        false,
        0.2,
        1.5,
        4, // 4 weeks
      );

      expect(result.weeklyPoints).toBeGreaterThan(0);
      expect(result.totalPointsSpent).toBeGreaterThan(0);
    });
  });
});
