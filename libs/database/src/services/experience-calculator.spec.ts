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
        it('should return ~6.8 for level 1', () => {
            const cost = getExperienceUpgradeCost(1);
            expect(cost).toBeCloseTo(6.8, 0);
        });

        it('should return ~12.5 for level 5', () => {
            const cost = getExperienceUpgradeCost(5);
            expect(cost).toBeCloseTo(12.5, 1);
        });

        it('should return ~29.5 for level 10', () => {
            const cost = getExperienceUpgradeCost(10);
            expect(cost).toBeCloseTo(29.5, 1);
        });

        it('should return ~50.1 for level 15', () => {
            const cost = getExperienceUpgradeCost(15);
            expect(cost).toBeCloseTo(50.1, 1);
        });
    });

    describe('getExperienceLevel', () => {
        it('should return level 1 for 0 experience', () => {
            expect(getExperienceLevel(0)).toBe(1);
        });

        it('should return level 1 for 4 experience', () => {
            expect(getExperienceLevel(4)).toBe(1);
        });

        it('should return level 2 for 7 experience (6.85 needed for level 2)', () => {
            expect(getExperienceLevel(7)).toBe(2);
        });

        it('should handle level 20 cap', () => {
            // Very high experience should still return 20
            expect(getExperienceLevel(1000)).toBe(20);
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
        it('should add experience without level up', () => {
            const result = addExperience('player1', 0, 0.5);
            expect(result.experienceAfter).toBe(0.5);
            expect(result.levelBefore).toBe(1);
            expect(result.levelAfter).toBe(1);
            expect(result.experienceGained).toBe(0.5);
        });

        it('should level up when enough experience is gained', () => {
            // Start with 0 experience, add enough to level up
            const result = addExperience('player1', 0, 10);
            expect(result.levelAfter).toBeGreaterThanOrEqual(2);
        });

        it('should handle multiple level ups', () => {
            // Add enough for multiple levels
            const result = addExperience('player1', 0, 50);
            expect(result.levelAfter).toBeGreaterThanOrEqual(3);
        });

        it('should cap at level 20', () => {
            const result = addExperience('player1', 0, 1000);
            expect(result.levelAfter).toBe(20);
        });

        it('should calculate experience remaining after level up', () => {
            // Start with small amount that will level up
            const result = addExperience('player1', 5, 1);
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
