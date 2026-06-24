import { InjurySystem, InjuryType, InjurySeverity } from './injury.system';

describe('InjurySystem', () => {
  describe('calculateInjuryChance', () => {
    it('should return base chance for player with good stamina at home', () => {
      const chance = InjurySystem.calculateInjuryChance(0.02, 22, 5, true);
      expect(chance).toBeGreaterThan(0);
      expect(chance).toBeLessThan(0.1);
    });

    it('should increase chance for players with low stamina', () => {
      const goodStaminaChance = InjurySystem.calculateInjuryChance(
        0.02,
        25,
        5,
        true,
      );
      const lowStaminaChance = InjurySystem.calculateInjuryChance(
        0.02,
        25,
        2,
        true,
      );
      expect(lowStaminaChance).toBeGreaterThan(goodStaminaChance);
    });

    it('should slightly decrease chance for home matches', () => {
      const homeChance = InjurySystem.calculateInjuryChance(0.02, 25, 4, true);
      const awayChance = InjurySystem.calculateInjuryChance(0.02, 25, 4, false);
      expect(homeChance).toBeLessThan(awayChance);
    });

    it('should combine stamina and home multipliers correctly', () => {
      // Low stamina, away match - highest risk
      const highRisk = InjurySystem.calculateInjuryChance(0.02, 25, 2, false);
      // Good stamina, home match - lowest risk
      const lowRisk = InjurySystem.calculateInjuryChance(0.02, 25, 5, true);
      expect(highRisk).toBeGreaterThan(lowRisk);
    });

    it('should reduce injury chance when team doctor is present', () => {
      const withoutDoctor = InjurySystem.calculateInjuryChance(
        0.02,
        25,
        4,
        true,
        0,
      );
      const withDoctor = InjurySystem.calculateInjuryChance(
        0.02,
        25,
        4,
        true,
        5,
      );
      expect(withDoctor).toBeLessThan(withoutDoctor);
      // Level 5 doctor reduces by 50% (1 - 0.1 * 5 = 0.5)
      expect(withDoctor).toBeCloseTo(withoutDoctor * 0.5, 5);
    });

    it('should reduce injury chance by 10% per doctor level', () => {
      const withoutDoctor = InjurySystem.calculateInjuryChance(
        0.02,
        25,
        4,
        true,
        0,
      );
      const level1 = InjurySystem.calculateInjuryChance(0.02, 25, 4, true, 1);
      const level3 = InjurySystem.calculateInjuryChance(0.02, 25, 4, true, 3);
      expect(level1).toBeCloseTo(withoutDoctor * 0.9, 5);
      expect(level3).toBeCloseTo(withoutDoctor * 0.7, 5);
    });
  });

  describe('determineInjuryType', () => {
    it('should return muscle for tackle', () => {
      expect(InjurySystem.determineInjuryType('tackle')).toBe('muscle');
    });

    it('should return muscle for sprint', () => {
      expect(InjurySystem.determineInjuryType('sprint')).toBe('muscle');
    });

    it('should return joint for jump', () => {
      expect(InjurySystem.determineInjuryType('jump')).toBe('joint');
    });

    it('should return head for collision', () => {
      expect(InjurySystem.determineInjuryType('collision')).toBe('head');
    });

    it('should return other for unknown action', () => {
      expect(InjurySystem.determineInjuryType('other')).toBe('other');
    });
  });

  describe('determineSeverity', () => {
    it('should always return mild, moderate, or severe', () => {
      for (let i = 0; i < 100; i++) {
        const severity = InjurySystem.determineSeverity();
        expect(['mild', 'moderate', 'severe']).toContain(severity);
      }
    });

    it('should have majority of mild injuries', () => {
      const mildCount = Array.from({ length: 100 }, () =>
        InjurySystem.determineSeverity(),
      ).filter((s) => s === 'mild').length;
      expect(mildCount).toBeGreaterThan(50);
    });

    it('should have few severe injuries', () => {
      const severeCount = Array.from({ length: 100 }, () =>
        InjurySystem.determineSeverity(),
      ).filter((s) => s === 'severe').length;
      expect(severeCount).toBeLessThan(30);
    });
  });

  describe('generateInjury', () => {
    it('should return willInjure false when random roll exceeds chance', () => {
      // Force low random values to avoid injury
      jest.spyOn(Math, 'random').mockReturnValue(1);
      const result = InjurySystem.generateInjury('tackle', 25, 4, true);
      expect(result.willInjure).toBe(false);
      expect(result.injuryType).toBeNull();
      expect(result.injuryValue).toBeNull();
    });

    it('should return injury details when injury occurs', () => {
      // Force high chance by mocking random to 0
      jest.spyOn(Math, 'random').mockReturnValue(0);
      const result = InjurySystem.generateInjury('tackle', 25, 4, true);

      expect(result.willInjure).toBe(true);
      expect(result.injuryType).toBeDefined();
      expect(result.severity).toBeDefined();
      expect(result.injuryValue).toBeGreaterThan(0);
      expect(result.estimatedDays).toBeGreaterThan(0);
    });

    it('should assign correct injury type based on action', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0);
      expect(
        InjurySystem.generateInjury('tackle', 25, 4, true).injuryType,
      ).toBe('muscle');
      expect(
        InjurySystem.generateInjury('sprint', 25, 4, true).injuryType,
      ).toBe('muscle');
      expect(InjurySystem.generateInjury('jump', 25, 4, true).injuryType).toBe(
        'joint',
      );
      expect(
        InjurySystem.generateInjury('collision', 25, 4, true).injuryType,
      ).toBe('head');
    });

    it('should calculate injury value within expected ranges', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0);
      // Use actual injury action type for correct injury type determination
      const result = InjurySystem.generateInjury('tackle', 25, 4, true);

      // Since tackle -> muscle, severity is random but based on mocked Math.random = 0
      // With Math.random = 0, severity will be 'mild' (since roll < 0.6)
      // Muscle mild: 20-40
      expect(result.injuryValue).toBeGreaterThanOrEqual(20);
      expect(result.injuryValue).toBeLessThanOrEqual(40);
    });

    it('should calculate recovery days based on injury value', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0);
      const result = InjurySystem.generateInjury('tackle', 25, 4, true);

      // Recovery should be a positive integer day count
      expect(result.estimatedDays).toBeGreaterThan(0);
      expect(Number.isInteger(result.estimatedDays)).toBe(true);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });
  });

  describe('getTreatmentTime', () => {
    it('should return 30 seconds for mild injury', () => {
      expect(InjurySystem.getTreatmentTime('mild')).toBe(30);
    });

    it('should return 90 seconds for moderate injury', () => {
      expect(InjurySystem.getTreatmentTime('moderate')).toBe(90);
    });

    it('should return 180 seconds for severe injury', () => {
      expect(InjurySystem.getTreatmentTime('severe')).toBe(180);
    });
  });

  describe('estimateRecoveryDays', () => {
    it('should return at least 1 day for any positive injury value', () => {
      expect(InjurySystem.estimateRecoveryDays(1, 25)).toBeGreaterThanOrEqual(
        1,
      );
      expect(InjurySystem.estimateRecoveryDays(100, 25)).toBeGreaterThanOrEqual(
        1,
      );
    });

    it('should return more days for higher injury values', () => {
      const smallInjury = InjurySystem.estimateRecoveryDays(50, 25);
      const largeInjury = InjurySystem.estimateRecoveryDays(200, 25);
      expect(largeInjury).toBeGreaterThan(smallInjury);
    });

    it('should be deterministic for same inputs', () => {
      const a = InjurySystem.estimateRecoveryDays(100, 25);
      const b = InjurySystem.estimateRecoveryDays(100, 25);
      expect(a).toBe(b);
    });

    it('should recover faster for younger players', () => {
      const young = InjurySystem.estimateRecoveryDays(100, 18);
      const old = InjurySystem.estimateRecoveryDays(100, 36);
      expect(young).toBeLessThan(old);
    });

    it('should recover faster with a higher-level team doctor', () => {
      const noDoctor = InjurySystem.estimateRecoveryDays(100, 25, 0);
      const level5Doctor = InjurySystem.estimateRecoveryDays(100, 25, 5);
      expect(level5Doctor).toBeLessThan(noDoctor);
    });
  });
});
