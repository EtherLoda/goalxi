import { InjurySystem, InjuryType, InjurySeverity } from './injury.system';

describe('InjurySystem', () => {
    describe('calculateInjuryChance', () => {
        it('should return base chance for young player with good stamina at home', () => {
            const chance = InjurySystem.calculateInjuryChance(0.02, 22, 5, true);
            expect(chance).toBeGreaterThan(0);
            expect(chance).toBeLessThan(0.1);
        });

        it('should increase chance for older players', () => {
            const youngChance = InjurySystem.calculateInjuryChance(0.02, 22, 5, true);
            const oldChance = InjurySystem.calculateInjuryChance(0.02, 35, 5, true);
            expect(oldChance).toBeGreaterThan(youngChance);
        });

        it('should increase chance for players with low stamina', () => {
            const goodStaminaChance = InjurySystem.calculateInjuryChance(0.02, 25, 5, true);
            const lowStaminaChance = InjurySystem.calculateInjuryChance(0.02, 25, 2, true);
            expect(lowStaminaChance).toBeGreaterThan(goodStaminaChance);
        });

        it('should slightly decrease chance for home matches', () => {
            const homeChance = InjurySystem.calculateInjuryChance(0.02, 25, 4, true);
            const awayChance = InjurySystem.calculateInjuryChance(0.02, 25, 4, false);
            expect(homeChance).toBeLessThan(awayChance);
        });

        it('should combine all multipliers correctly', () => {
            // Old player, low stamina, away match - highest risk
            const highRisk = InjurySystem.calculateInjuryChance(0.02, 35, 2, false);
            // Young player, good stamina, home match - lowest risk
            const lowRisk = InjurySystem.calculateInjuryChance(0.02, 22, 5, true);
            expect(highRisk).toBeGreaterThan(lowRisk);
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
        it('should always return 1, 2, or 3', () => {
            for (let i = 0; i < 100; i++) {
                const severity = InjurySystem.determineSeverity();
                expect([1, 2, 3]).toContain(severity);
            }
        });

        it('should have majority of mild injuries (severity 1)', () => {
            const mildCount = Array.from({ length: 100 }, () => InjurySystem.determineSeverity())
                .filter(s => s === 1).length;
            expect(mildCount).toBeGreaterThan(50);
        });

        it('should have few severe injuries (severity 3)', () => {
            const severeCount = Array.from({ length: 100 }, () => InjurySystem.determineSeverity())
                .filter(s => s === 3).length;
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
            expect(result.estimatedMinDays).toBeGreaterThan(0);
            expect(result.estimatedMaxDays).toBeGreaterThanOrEqual(result.estimatedMinDays!);
        });

        it('should assign correct injury type based on action', () => {
            jest.spyOn(Math, 'random').mockReturnValue(0);
            expect(InjurySystem.generateInjury('tackle', 25, 4, true).injuryType).toBe('muscle');
            expect(InjurySystem.generateInjury('sprint', 25, 4, true).injuryType).toBe('muscle');
            expect(InjurySystem.generateInjury('jump', 25, 4, true).injuryType).toBe('joint');
            expect(InjurySystem.generateInjury('collision', 25, 4, true).injuryType).toBe('head');
        });

        it('should calculate injury value within expected ranges', () => {
            jest.spyOn(Math, 'random').mockReturnValue(0);
            // Use actual injury action type for correct injury type determination
            const result = InjurySystem.generateInjury('tackle', 25, 4, true);

            // Since tackle -> muscle, severity is random but based on mocked Math.random = 0
            // With Math.random = 0, severity will be 1 (since roll < 0.6)
            // Muscle severity 1: 20-40
            expect(result.injuryValue!).toBeGreaterThanOrEqual(20);
            expect(result.injuryValue!).toBeLessThanOrEqual(40);
        });

        it('should calculate recovery days based on injury value', () => {
            jest.spyOn(Math, 'random').mockReturnValue(0);
            const result = InjurySystem.generateInjury('tackle', 25, 4, true);

            // Recovery range should be reasonable for injury value
            expect(result.estimatedMinDays).toBeGreaterThan(0);
            expect(result.estimatedMaxDays).toBeGreaterThanOrEqual(result.estimatedMinDays!);
        });

        afterEach(() => {
            jest.restoreAllMocks();
        });
    });

    describe('getTreatmentTime', () => {
        it('should return 30 seconds for mild injury', () => {
            expect(InjurySystem.getTreatmentTime(1)).toBe(30);
        });

        it('should return 90 seconds for moderate injury', () => {
            expect(InjurySystem.getTreatmentTime(2)).toBe(90);
        });

        it('should return 180 seconds for severe injury', () => {
            expect(InjurySystem.getTreatmentTime(3)).toBe(180);
        });
    });

    describe('calculateDailyRecovery', () => {
        it('should return positive value', () => {
            const recovery = InjurySystem.calculateDailyRecovery(25);
            expect(recovery).toBeGreaterThan(0);
        });

        it('should return higher values for younger players on average', () => {
            // Run multiple times to account for random fluctuation
            let youngWins = 0;
            const iterations = 30;
            for (let i = 0; i < iterations; i++) {
                const youngRecovery = InjurySystem.calculateDailyRecovery(20);
                const oldRecovery = InjurySystem.calculateDailyRecovery(35);
                if (youngRecovery > oldRecovery) {
                    youngWins++;
                }
            }
            // Young players should recover faster more often than not
            expect(youngWins).toBeGreaterThan(iterations / 2);
        });

        it('should use sigmoid curve for age-based recovery on average', () => {
            // Run multiple times to account for random fluctuation
            let youngFasterThanMid = 0;
            let oldSlowerThanMid = 0;
            const iterations = 30;

            for (let i = 0; i < iterations; i++) {
                const recovery18 = InjurySystem.calculateDailyRecovery(18);
                const recovery28 = InjurySystem.calculateDailyRecovery(28);
                const recovery38 = InjurySystem.calculateDailyRecovery(38);

                if (recovery18 > recovery28) youngFasterThanMid++;
                if (recovery38 < recovery28) oldSlowerThanMid++;
            }

            // More often than not, younger should be faster than midpoint age
            expect(youngFasterThanMid).toBeGreaterThan(iterations / 2);
            // More often than not, older should be slower than midpoint age
            expect(oldSlowerThanMid).toBeGreaterThan(iterations / 2);
        });

        it('should be within expected range (2.5-14 with fluctuation)', () => {
            for (let age = 18; age <= 40; age++) {
                for (let i = 0; i < 50; i++) {
                    const recovery = InjurySystem.calculateDailyRecovery(age);
                    expect(recovery).toBeGreaterThanOrEqual(2);
                    expect(recovery).toBeLessThanOrEqual(15);
                }
            }
        });

        it('should vary between calls (random fluctuation)', () => {
            const recoveries = Array.from({ length: 10 }, () => InjurySystem.calculateDailyRecovery(25));
            const uniqueValues = new Set(recoveries);
            expect(uniqueValues.size).toBeGreaterThan(1);
        });
    });

    describe('calculateRecoveryRange', () => {
        it('should return min days less than max days', () => {
            const range = InjurySystem.calculateRecoveryRange(100);
            expect(range.min).toBeLessThan(range.max);
        });

        it('should return at least 1 day for any injury value', () => {
            const range = InjurySystem.calculateRecoveryRange(1);
            expect(range.min).toBeGreaterThanOrEqual(1);
            expect(range.max).toBeGreaterThanOrEqual(1);
        });

        it('should return more days for higher injury values', () => {
            const smallInjury = InjurySystem.calculateRecoveryRange(50);
            const largeInjury = InjurySystem.calculateRecoveryRange(200);
            expect(largeInjury.min).toBeGreaterThan(smallInjury.min);
            expect(largeInjury.max).toBeGreaterThan(smallInjury.max);
        });

        it('should use consistent range calculation (not age-dependent)', () => {
            // Range should be based on injury value and fluctuation, not age
            const range1 = InjurySystem.calculateRecoveryRange(100);
            const range2 = InjurySystem.calculateRecoveryRange(100);
            expect(range1.min).toBe(range2.min);
            expect(range1.max).toBe(range2.max);
        });
    });
});
