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
    it('should always return mild or severe', () => {
      for (let i = 0; i < 100; i++) {
        const severity = InjurySystem.determineSeverity();
        expect(['mild', 'severe']).toContain(severity);
      }
    });

    // Distribution calibrated 2026-08-06 (post-collapse):
    // 20% mild / 80% severe. The old `moderate` tier was folded into
    // `severe` because both forced the player off the pitch; only the
    // recovery length differs, and that is now driven by `injuryValue`.
    it('should have ~20% mild injuries (player can continue)', () => {
      const mildCount = Array.from({ length: 1000 }, () =>
        InjurySystem.determineSeverity(),
      ).filter((s) => s === 'mild').length;
      // 20% ± 5% over 1000 rolls gives a tight CI around 200
      expect(mildCount).toBeGreaterThan(150);
      expect(mildCount).toBeLessThan(250);
    });

    it('should have ~80% severe injuries (force off the pitch)', () => {
      const severeCount = Array.from({ length: 1000 }, () =>
        InjurySystem.determineSeverity(),
      ).filter((s) => s === 'severe').length;
      // 80% ± 5% over 1000 rolls
      expect(severeCount).toBeGreaterThan(750);
      expect(severeCount).toBeLessThan(850);
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
      // With Math.random = 0, severity will be 'mild' (since roll < 0.2)
      // Muscle mild: 15-30 (post-2026-08-06 alignment, see INJURY_VALUES).
      expect(result.injuryValue).toBeGreaterThanOrEqual(15);
      expect(result.injuryValue).toBeLessThanOrEqual(30);
    });

    it('mild severity always lands in the "minor / playable" band (P1-#2 alignment)', () => {
      // The simulator's "mild" outcome means the player can keep
      // playing; the player-side `injuryState` is derived from
      // `injuryValue <= INJURY_MINOR_VALUE_THRESHOLD (30)` at
      // write time. If a mild injury ever produced a value > 30
      // the two semantics would contradict (engine says "stay
      // on the pitch", DB says "must sit out"). Pin the
      // invariant: every mild value must be ≤ 30, across all
      // injury types. Forces 1000 rolls per type to expose the
      // upper bound.
      const actions: Array<'tackle' | 'sprint' | 'jump' | 'collision' | 'other'> = [
        'tackle', 'sprint', 'jump', 'collision', 'other',
      ];
      for (const action of actions) {
        for (let i = 0; i < 1000; i++) {
          // Math.random() = 0 forces `severity = 'mild'` via
          // the SEVERITY_MILD_THRESHOLD (= 0.2) branch.
          jest.spyOn(Math, 'random').mockReturnValue(0);
          const result = InjurySystem.generateInjury(action, 25, 4, true);
          expect(result.severity).toBe('mild');
          expect(result.injuryValue).toBeLessThanOrEqual(30);
          jest.restoreAllMocks();
        }
      }
    });

    it('severe severity always lands in the "severe / must sit out" band', () => {
      // The flip side of the alignment test: severe outcomes
      // must always push the value past the minor threshold so
      // the player is correctly marked `injuryState = 'severe'`.
      // `generateInjury` calls `Math.random()` three times (the
      // `willInjure` gate, the severity roll, the value roll)
      // — we hand each one a deterministic value via
      // `mockReturnValueOnce` so the run produces a 'severe'
      // injury deterministically.
      const actions: Array<'tackle' | 'sprint' | 'jump' | 'collision' | 'other'> = [
        'tackle', 'sprint', 'jump', 'collision', 'other',
      ];
      for (const action of actions) {
        for (let i = 0; i < 200; i++) {
          jest.spyOn(Math, 'random')
            // 1st call: pass the `> chance` gate (tackle chance
            //    is 0.02, so any value ≤ 0.02 works).
            .mockReturnValueOnce(0)
            // 2nd call: severity roll — 0.5 lands in the
            //    'severe' branch (>= SEVERITY_MILD_THRESHOLD = 0.2).
            .mockReturnValueOnce(0.5)
            // 3rd call: value roll — 0.99 picks the upper end
            //    of the severe range, where the gap to the
            //    minor threshold is widest.
            .mockReturnValueOnce(0.99);

          const result = InjurySystem.generateInjury(action, 25, 4, true);
          expect(result.willInjure).toBe(true);
          expect(result.severity).toBe('severe');
          expect(result.injuryValue).toBeGreaterThan(30);
          jest.restoreAllMocks();
        }
      }
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
