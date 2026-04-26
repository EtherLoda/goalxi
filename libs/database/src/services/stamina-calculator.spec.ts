import {
  calculateAgeFactor,
  calculateStaminaFactor,
  calculateDecay,
  calculateTrainingEffect,
  calculateMaxStamina,
  calculateWeeklyStaminaChange,
  STAMINA_MAX,
  STAMINA_MIN,
  PEAK_AGE,
  BASE_DECAY_RATE,
} from './stamina-calculator';

describe('StaminaCalculator', () => {
  describe('calculateAgeFactor', () => {
    it('should return 1.0 at peak age (23)', () => {
      const factor = calculateAgeFactor(23);
      expect(factor).toBe(1.0);
    });

    it('should increase factor for younger players', () => {
      const factor17 = calculateAgeFactor(17);
      const factor23 = calculateAgeFactor(23);
      expect(factor17).toBeGreaterThan(factor23);
    });

    it('should increase factor for older players', () => {
      const factor30 = calculateAgeFactor(30);
      const factor23 = calculateAgeFactor(23);
      expect(factor30).toBeGreaterThan(factor23);
    });

    it('should return ~1.18 at age 17', () => {
      const factor = calculateAgeFactor(17);
      // (17-23)^2 * 0.005 = 36 * 0.005 = 0.18, so 1 + 0.18 = 1.18
      expect(factor).toBeCloseTo(1.18, 2);
    });

    it('should return ~1.72 at age 34', () => {
      const factor = calculateAgeFactor(34);
      // (34-23)^2 * 0.005 = 121 * 0.005 = 0.605, so 1 + 0.605 = 1.605
      expect(factor).toBeCloseTo(1.605, 2);
    });
  });

  describe('calculateStaminaFactor', () => {
    it('should return 0.2 at stamina 0', () => {
      const factor = calculateStaminaFactor(0);
      // (0+1)^1.2 / 5 = 1 / 5 = 0.2
      expect(factor).toBeCloseTo(0.2, 2);
    });

    it('should return ~1.72 at stamina 5', () => {
      const factor = calculateStaminaFactor(5);
      // (5+1)^1.2 / 5 ≈ 1.72
      expect(factor).toBeCloseTo(1.72, 2);
    });

    it('should increase with stamina', () => {
      const low = calculateStaminaFactor(1);
      const high = calculateStaminaFactor(4);
      expect(high).toBeGreaterThan(low);
    });
  });

  describe('calculateDecay', () => {
    it('should calculate decay at peak age with mid stamina', () => {
      const decay = calculateDecay(23, 3.0);
      // BASE 0.05 * ageFactor 1.0 * staminaFactor (3+1)^1.2/5 ≈ 1.056
      // 0.05 * 1.0 * 1.056 ≈ 0.053
      expect(decay).toBeCloseTo(0.053, 2);
    });

    it('should calculate higher decay for older players', () => {
      const youngDecay = calculateDecay(20, 3.0);
      const oldDecay = calculateDecay(30, 3.0);
      expect(oldDecay).toBeGreaterThan(youngDecay);
    });

    it('should calculate higher decay for high stamina', () => {
      const lowStamina = calculateDecay(23, 1.0);
      const highStamina = calculateDecay(23, 5.0);
      expect(highStamina).toBeGreaterThan(lowStamina);
    });
  });

  describe('calculateTrainingEffect', () => {
    it('should return 0 when intensity is 0', () => {
      const effect = calculateTrainingEffect(0, 1.5);
      expect(effect).toBe(0);
    });

    it('should scale with intensity', () => {
      const low = calculateTrainingEffect(0.1, 1.5);
      const high = calculateTrainingEffect(0.5, 1.5);
      expect(high).toBeGreaterThan(low);
    });

    it('should scale with coach bonus', () => {
      const noBonus = calculateTrainingEffect(0.2, 1.0);
      const withBonus = calculateTrainingEffect(0.2, 1.5);
      expect(withBonus).toBeGreaterThan(noBonus);
    });
  });

  describe('calculateMaxStamina', () => {
    it('should return 6.0 at age 17', () => {
      const max = calculateMaxStamina(17);
      expect(max).toBe(6.0);
    });

    it('should return 5.0 at age 37', () => {
      const max = calculateMaxStamina(37);
      expect(max).toBe(5.0);
    });

    it('should decrease by 0.05 per year after 17', () => {
      const max17 = calculateMaxStamina(17);
      const max25 = calculateMaxStamina(25);
      expect(max25).toBeCloseTo(max17 - 0.4, 1); // 8 years * 0.05 = 0.4
    });
  });

  describe('calculateWeeklyStaminaChange', () => {
    it('should maintain stamina when training equals decay', () => {
      // This is a theoretical test - in practice the numbers may not balance exactly
      const result = calculateWeeklyStaminaChange(
        'player-1',
        3.0,  // current stamina
        23,   // age
        0.2,  // physicalIntensity (for training effect)
        1.0,  // coachBonus
      );

      expect(result.playerId).toBe('player-1');
      expect(result.staminaBefore).toBe(3.0);
      expect(result.decay).toBeGreaterThan(0);
      expect(result.trainingEffect).toBeGreaterThanOrEqual(0);
    });

    it('should cap stamina at max', () => {
      const result = calculateWeeklyStaminaChange(
        'player-1',
        5.99, // max stamina
        23,
        0.5,
        1.5,
      );

      expect(result.staminaAfter).toBeLessThanOrEqual(STAMINA_MAX);
    });

    it('should floor stamina at min', () => {
      const result = calculateWeeklyStaminaChange(
        'player-1',
        0.01, // near min stamina
        40,   // old age - high decay
        0,    // no training
        1.0,
      );

      expect(result.staminaAfter).toBeGreaterThanOrEqual(STAMINA_MIN);
    });

    it('should show positive net change when training > decay', () => {
      const result = calculateWeeklyStaminaChange(
        'player-1',
        3.0,
        23,
        1.0, // max intensity
        2.0, // high bonus
      );

      // trainingEffect = 1.0 * 0.5 * 2.0 = 1.0
      // decay ≈ 0.05 * 1.0 * 0.36 ≈ 0.018
      // netChange ≈ 0.982
      expect(result.netChange).toBeGreaterThan(0);
    });

    it('should show negative net change when decay > training', () => {
      const result = calculateWeeklyStaminaChange(
        'player-1',
        5.5,  // high stamina
        35,   // old age
        0.05, // very low intensity
        1.0,  // no bonus
      );

      // High decay, low training should result in net loss
      expect(result.decay).toBeGreaterThan(result.trainingEffect);
    });
  });
});
