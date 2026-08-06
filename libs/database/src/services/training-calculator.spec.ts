import {
  calculateFitnessCoachBonus,
  calculateAssignedCoachBonus,
  calculateSpecializedTrainingPoints,
  calculateStaminaGain,
  applySpecializedTraining,
  computeWeeklyTrainingPoints,
  distributeTrainingPoints,
  getPlayerSkillKeys,
  getSkillLevel,
  setSkillLevel,
} from './training-calculator';
import { getSkillTrainingSpeed } from '../constants/training.constants';
import { StaffEntity, StaffLevel, StaffRole } from '../entities/staff.entity';
import {
  PlayerSkills,
  TrainingCategory,
} from '../entities/player.entity';

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
        1,
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
        1,
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

  // The historical `applyYouthCoachCategoryTraining` describe block
  // was removed together with the YOUTH_COACH staff role. The senior
  // training path is fully covered by the
  // `applySpecializedTraining` / `distributeTrainingPoints` blocks
  // above.

  describe('computeWeeklyTrainingPoints', () => {
    // Shared helper used by BOTH the API preview and the settlement
    // worker. The whole point is they call this exact function so
    // the number shown to the manager can never disagree with the
    // number actually applied to the player.

    it('returns 0 for an empty assignment list', () => {
      expect(computeWeeklyTrainingPoints(20, 0.2, 3, [])).toBe(0);
    });

    it('sums the per-assignment weekly points', () => {
      // Hand-rolled value: head=3, single coach=3, stamina=0.2, age=20.
      // The helper must produce the same value as the per-assignment
      // loop the API preview used to inline.
      const headLevel = 3;
      const oneCoach = computeWeeklyTrainingPoints(20, 0.2, headLevel, [
        { level: 3, trainedSkill: 'pace' },
      ]);
      const twoCoaches = computeWeeklyTrainingPoints(20, 0.2, headLevel, [
        { level: 3, trainedSkill: 'pace' },
        { level: 4, trainedSkill: 'passing' },
      ]);
      // 1 coach < 2 coaches (more coaches always adds bonus points)
      expect(twoCoaches).toBeGreaterThan(oneCoach);
      // 2 coaches is exactly the sum of the two individual calls
      const onlyA = computeWeeklyTrainingPoints(20, 0.2, headLevel, [
        { level: 3, trainedSkill: 'pace' },
      ]);
      const onlyB = computeWeeklyTrainingPoints(20, 0.2, headLevel, [
        { level: 4, trainedSkill: 'passing' },
      ]);
      expect(twoCoaches).toBeCloseTo(onlyA + onlyB, 5);
    });

    it('applies the head-coach bonus multiplicatively across all assignments', () => {
      const noHead = computeWeeklyTrainingPoints(20, 0.2, 0, [
        { level: 3, trainedSkill: 'pace' },
      ]);
      const withHead = computeWeeklyTrainingPoints(20, 0.2, 5, [
        { level: 3, trainedSkill: 'pace' },
      ]);
      // Higher head-coach level should raise the per-assignment bonus
      // and therefore the total weekly points.
      expect(withHead).toBeGreaterThan(noHead);
    });

    it('matches the legacy single-assignment preview math', () => {
      // The helper is a thin refactor of the loop the API preview
      // used to inline. For one assignment, both must produce the
      // same number (modulo a final round-to-2dp).
      const age = 25;
      const staminaIntensity = 0.3;
      const headCoachLevel = 4;
      const assignedCoachLevel = 3;
      // legacy formula: 1 + (head + assigned) × 0.05
      const bonus =
        1 + (headCoachLevel + assignedCoachLevel) * 0.05;
      const expected = calculateSpecializedTrainingPoints(
        age,
        staminaIntensity,
        bonus,
      );
      const got = computeWeeklyTrainingPoints(
        age,
        staminaIntensity,
        headCoachLevel,
        [{ level: assignedCoachLevel, trainedSkill: 'pace' }],
      );
      expect(got).toBeCloseTo(expected, 5);
    });
  });

  describe('getSkillTrainingSpeed', () => {
    // Regression: the speed map used to carry GK keys with a `gk_`
    // prefix (e.g. `gk_reflexes`), which never matched the runtime
    // skill keys returned by `getPlayerSkillKeys(true)` so every GK
    // training silently fell back to 1.0. The map now uses the
    // un-prefixed keys shared with the outfield mental category, and
    // this block pins the contract so a future rename can't re-introduce
    // the prefix mismatch.
    it('returns the designed speed for every GK-only skill', () => {
      // The three GK-only skills must hit the dedicated multipliers
      // (0.80/0.85/0.82) — NOT the 1.0 fallback.
      expect(getSkillTrainingSpeed('reflexes')).toBeCloseTo(0.80, 5);
      expect(getSkillTrainingSpeed('handling')).toBeCloseTo(0.85, 5);
      expect(getSkillTrainingSpeed('aerial')).toBeCloseTo(0.82, 5);
    });

    it('returns the designed speed for every outfield skill', () => {
      expect(getSkillTrainingSpeed('pace')).toBeCloseTo(0.88, 5);
      expect(getSkillTrainingSpeed('strength')).toBeCloseTo(0.90, 5);
      expect(getSkillTrainingSpeed('finishing')).toBeCloseTo(0.85, 5);
      expect(getSkillTrainingSpeed('defending')).toBeCloseTo(0.90, 5);
      expect(getSkillTrainingSpeed('dribbling')).toBeCloseTo(1.00, 5);
      expect(getSkillTrainingSpeed('passing')).toBeCloseTo(1.10, 5);
      // mental skills (shared between GK and outfield)
      expect(getSkillTrainingSpeed('positioning')).toBeCloseTo(1.25, 5);
      expect(getSkillTrainingSpeed('composure')).toBeCloseTo(1.30, 5);
    });

    it('boosts set-piece skills by 5x to make them trainable in a season', () => {
      expect(getSkillTrainingSpeed('freeKicks')).toBe(5.0);
      expect(getSkillTrainingSpeed('penalties')).toBe(5.0);
    });

    it('returns 1.0 for unknown skill keys (safe fallback)', () => {
      expect(getSkillTrainingSpeed('unknown_skill')).toBe(1.0);
    });
  });
});
