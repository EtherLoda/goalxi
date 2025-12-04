import { DurationCalculator } from './duration.calculator';
import { MatchType } from '@goalxi/database';

describe('DurationCalculator', () => {
    describe('calculateMatchDuration', () => {
        it('should calculate duration for a league match', () => {
            const duration = DurationCalculator.calculateMatchDuration(
                MatchType.LEAGUE,
                false,
            );

            expect(duration.firstHalfMinutes).toBe(45);
            expect(duration.secondHalfMinutes).toBe(45);
            expect(duration.halfTimeBreak).toBe(15);
            expect(duration.firstHalfInjuryTime).toBeGreaterThanOrEqual(1);
            expect(duration.firstHalfInjuryTime).toBeLessThanOrEqual(5);
            expect(duration.secondHalfInjuryTime).toBeGreaterThanOrEqual(1);
            expect(duration.secondHalfInjuryTime).toBeLessThanOrEqual(5);
            expect(duration.hasExtraTime).toBe(false);
            expect(duration.extraTimeFirstHalf).toBeUndefined();
            expect(duration.extraTimeSecondHalf).toBeUndefined();
        });

        it('should calculate duration for a tournament match without draw', () => {
            const duration = DurationCalculator.calculateMatchDuration(
                MatchType.TOURNAMENT,
                false,
            );

            expect(duration.firstHalfMinutes).toBe(45);
            expect(duration.secondHalfMinutes).toBe(45);
            expect(duration.hasExtraTime).toBe(false);
        });

        it('should calculate duration for a tournament match with draw (extra time)', () => {
            const duration = DurationCalculator.calculateMatchDuration(
                MatchType.TOURNAMENT,
                true,
            );

            expect(duration.firstHalfMinutes).toBe(45);
            expect(duration.secondHalfMinutes).toBe(45);
            expect(duration.hasExtraTime).toBe(true);
            expect(duration.extraTimeFirstHalf).toBe(15);
            expect(duration.extraTimeSecondHalf).toBe(15);
            expect(duration.extraTimeBreak).toBe(5);
            // Extra time has no injury time (as per requirements)
        });

        it('should generate different injury times on multiple calls', () => {
            const durations = Array.from({ length: 10 }, () =>
                DurationCalculator.calculateMatchDuration(MatchType.LEAGUE, false),
            );

            const uniqueFirstHalfTimes = new Set(
                durations.map((d) => d.firstHalfInjuryTime),
            );
            const uniqueSecondHalfTimes = new Set(
                durations.map((d) => d.secondHalfInjuryTime),
            );

            // With 10 samples and 5 possible values, we should get some variety
            expect(uniqueFirstHalfTimes.size).toBeGreaterThan(1);
            expect(uniqueSecondHalfTimes.size).toBeGreaterThan(1);
        });

        it('should handle cup matches like league matches', () => {
            const duration = DurationCalculator.calculateMatchDuration(
                MatchType.CUP,
                false,
            );

            expect(duration.firstHalfMinutes).toBe(45);
            expect(duration.secondHalfMinutes).toBe(45);
            expect(duration.hasExtraTime).toBe(false);
            expect(duration.firstHalfInjuryTime).toBeGreaterThanOrEqual(1);
            expect(duration.firstHalfInjuryTime).toBeLessThanOrEqual(5);
        });

        it('should handle friendly matches', () => {
            const duration = DurationCalculator.calculateMatchDuration(
                MatchType.FRIENDLY,
                false,
            );

            expect(duration.firstHalfMinutes).toBe(45);
            expect(duration.secondHalfMinutes).toBe(45);
            expect(duration.hasExtraTime).toBe(false);
        });
    });

    describe('randomInjuryTime', () => {
        it('should always return values between min and max', () => {
            for (let i = 0; i < 100; i++) {
                const time = DurationCalculator['randomInjuryTime'](1, 5);
                expect(time).toBeGreaterThanOrEqual(1);
                expect(time).toBeLessThanOrEqual(5);
            }
        });

        it('should return min when min equals max', () => {
            const time = DurationCalculator['randomInjuryTime'](3, 3);
            expect(time).toBe(3);
        });
    });
});
