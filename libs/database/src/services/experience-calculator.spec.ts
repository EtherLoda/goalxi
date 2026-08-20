import {
    getExperienceUpgradeCost,
    getExperienceLevel,
    calculateMatchExperience,
    addExperience,
    MATCH_EXPERIENCE_CONFIG,
} from './experience-calculator';
import { MatchType } from '../entities/match.entity';

describe('Experience Calculator', () => {
    describe('getExperienceUpgradeCost', () => {
        it('should return 10 for level 0 (XP needed to reach L1)', () => {
            expect(getExperienceUpgradeCost(0)).toBe(10);
        });

        it('should return 20 for level 5 (XP needed to reach L6)', () => {
            expect(getExperienceUpgradeCost(5)).toBe(20);
        });

        it('should return 30 for level 10 (XP needed to reach L11)', () => {
            expect(getExperienceUpgradeCost(10)).toBe(30);
        });

        it('should return 40 for level 15 (XP needed to reach L16)', () => {
            expect(getExperienceUpgradeCost(15)).toBe(40);
        });

        it('should follow the linear cost formula cost(L) = 10 + 2L', () => {
            expect(getExperienceUpgradeCost(20)).toBe(50);
            expect(getExperienceUpgradeCost(50)).toBe(110);
        });
    });

    describe('getExperienceLevel', () => {
        it('should return level 0 for 0 experience (level starts at 0)', () => {
            expect(getExperienceLevel(0)).toBe(0);
        });

        it('should return level 0 for 9 experience (one XP short of L1)', () => {
            expect(getExperienceLevel(9)).toBe(0);
        });

        it('should return level 1 for 10 experience', () => {
            expect(getExperienceLevel(10)).toBe(1);
        });

        it('should return level 1 for 21 experience (one short of L2 at 22)', () => {
            expect(getExperienceLevel(21)).toBe(1);
        });

        it('should return level 2 for 22 experience (L0:10 + L1:12)', () => {
            expect(getExperienceLevel(22)).toBe(2);
        });

        it('should return level 5 for 70 experience (cumulative: 10+12+14+16+18)', () => {
            expect(getExperienceLevel(70)).toBe(5);
        });

        it('should have no level cap (1000 XP → L27, 28 remaining)', () => {
            expect(getExperienceLevel(1000)).toBe(27);
        });

        it('should support very high levels (100k XP → L311)', () => {
            // sum(10+2k, k=0..N-1) = N^2 + 9N
            // N=311: 311*320 = 99520,  N=312: 312*321 = 100152 (overflows 100k)
            expect(getExperienceLevel(100000)).toBe(311);
        });
    });

    describe('calculateMatchExperience', () => {
        it('should return 0 for TOURNAMENT matches', () => {
            expect(calculateMatchExperience(MatchType.TOURNAMENT, 90)).toBe(0);
        });

        it('should return full XP for 90 minutes', () => {
            expect(calculateMatchExperience(MatchType.LEAGUE, 90)).toBe(1.0);
            expect(calculateMatchExperience(MatchType.CUP, 90)).toBe(1.0);
            expect(calculateMatchExperience(MatchType.PLAYOFF, 90)).toBe(2.0);
            expect(calculateMatchExperience(MatchType.NATIONAL_TEAM, 90)).toBe(5.0);
            expect(calculateMatchExperience(MatchType.FRIENDLY, 90)).toBe(0.1);
        });

        it('should scale proportionally for less than 90 minutes', () => {
            expect(calculateMatchExperience(MatchType.LEAGUE, 45)).toBe(0.5);
            expect(calculateMatchExperience(MatchType.LEAGUE, 30)).toBeCloseTo(0.333, 3);
            expect(calculateMatchExperience(MatchType.LEAGUE, 0)).toBe(0);
        });

        it('should cap at 90 minutes', () => {
            expect(calculateMatchExperience(MatchType.LEAGUE, 120)).toBe(1.0);
        });
    });

    describe('addExperience', () => {
        it('should add experience without level up (sub-L1 threshold)', () => {
            const result = addExperience(1, 0, 0.5);
            expect(result.experienceAfter).toBe(0.5);
            expect(result.levelBefore).toBe(0);
            expect(result.levelAfter).toBe(0);
            expect(result.experienceGained).toBe(0.5);
        });

        it('should level up to L1 with exactly 10 XP from 0', () => {
            const result = addExperience(1, 0, 10);
            expect(result.levelBefore).toBe(0);
            expect(result.levelAfter).toBe(1);
            expect(result.experienceAfter).toBe(0);
        });

        it('should level up multiple times (50 XP from 0 → L3, 14 remaining)', () => {
            // 10 + 12 + 14 = 36 spent, 50 - 36 = 14 remaining, level = 3
            const result = addExperience(1, 0, 50);
            expect(result.levelAfter).toBe(3);
            expect(result.experienceAfter).toBe(14);
        });

        it('should not cap at any level (1000 XP → L27, 28 remaining)', () => {
            const result = addExperience(1, 0, 1000);
            expect(result.levelAfter).toBe(27);
            expect(result.experienceAfter).toBe(28);
        });

        it('should preserve monotonicity of level (never decreases)', () => {
            // Start with 5 XP (L0), add 1 (still L0, total 6)
            const result = addExperience(1, 5, 1);
            expect(result.levelBefore).toBe(0);
            expect(result.levelAfter).toBe(0);
            expect(result.experienceAfter).toBe(6);
            expect(result.levelAfter).toBeGreaterThanOrEqual(result.levelBefore);
        });
    });

    describe('MATCH_EXPERIENCE_CONFIG', () => {
        it('should have correct values for all match types', () => {
            expect(MATCH_EXPERIENCE_CONFIG[MatchType.LEAGUE]).toBe(1.0);
            expect(MATCH_EXPERIENCE_CONFIG[MatchType.CUP]).toBe(1.0);
            expect(MATCH_EXPERIENCE_CONFIG[MatchType.TOURNAMENT]).toBe(0);
            expect(MATCH_EXPERIENCE_CONFIG[MatchType.FRIENDLY]).toBe(0.1);
            expect(MATCH_EXPERIENCE_CONFIG[MatchType.NATIONAL_TEAM]).toBe(5.0);
            expect(MATCH_EXPERIENCE_CONFIG[MatchType.PLAYOFF]).toBe(2.0);
        });
    });
});
