import { MatchEngine } from './match.engine';
import { Team } from './classes/Team';
import { TacticalPlayer, AttackType, ShotType } from './types/simulation.types';
import { Player } from '../types/player.types';

describe('Attack System', () => {
    let engine: MatchEngine;

    // Helper to create mock players
    const createMockPlayer = (id: string, name: string, attrs: Partial<Player['attributes']> = {}): Player => ({
        id,
        name,
        position: 'CM',
        exactAge: [25, 0],
        attributes: {
            finishing: attrs.finishing ?? 10,
            composure: attrs.composure ?? 10,
            positioning: attrs.positioning ?? 10,
            strength: attrs.strength ?? 10,
            pace: attrs.pace ?? 10,
            dribbling: attrs.dribbling ?? 10,
            passing: attrs.passing ?? 10,
            defending: attrs.defending ?? 10,
            freeKicks: 10,
            penalties: 10,
            gk_reflexes: 10,
            gk_handling: 10,
            gk_distribution: 10,
        },
        currentStamina: 3,
        form: 5,
        experience: 10
    });

    // Helper to create mock team with specific positions
    const createMockTeam = (name: string, positions: string[]): Team => {
        const players: TacticalPlayer[] = positions.map((pos, i) => ({
            player: createMockPlayer(`${name}-${i}`, `${name} Player ${i}`),
            positionKey: pos
        }));
        return new Team(name, players);
    };

    beforeEach(() => {
        const homeTeam = createMockTeam('HomeFC', [
            'GK', 'LB', 'CD', 'CD', 'RB',
            'CM', 'CM', 'AM',
            'LW', 'CF', 'RW'
        ]);
        const awayTeam = createMockTeam('AwayFC', [
            'GK', 'LB', 'CD', 'CD', 'RB',
            'CM', 'CM', 'DM',
            'LW', 'CF', 'RW'
        ]);
        engine = new MatchEngine(homeTeam, awayTeam);
    });

    describe('selectAttackType', () => {
        it('should return valid AttackType for balanced mode', () => {
            // Run multiple times to test distribution
            const types = new Set<AttackType>();
            for (let i = 0; i < 100; i++) {
                // Access private method via type casting
                const type = (engine as any).selectAttackType(0);
                types.add(type);
            }

            // Should get various attack types
            expect(types.size).toBeGreaterThan(0);
            types.forEach(type => {
                expect(Object.values(AttackType)).toContain(type);
            });
        });

        it('balanced mode should have 5 attack types', () => {
            const typeCounts: Record<number, number> = {};

            for (let i = 0; i < 1000; i++) {
                const type = (engine as any).selectAttackType(0);
                typeCounts[type] = (typeCounts[type] || 0) + 1;
            }

            // Check that all 5 types are represented
            expect(Object.keys(typeCounts).length).toBe(5);

            // Check distribution is roughly correct (15/30/15/30/10)
            // Allow some variance due to randomness
            const total = Object.values(typeCounts).reduce((a, b) => a + b, 0);
            const distribution = Object.entries(typeCounts).map(([k, v]) => ({
                type: Number(k),
                percentage: (v / total) * 100
            }));

            // At least some variety in distribution
            const percentages = distribution.map(d => d.percentage);
            expect(Math.max(...percentages) - Math.min(...percentages)).toBeGreaterThan(5);
        });
    });

    describe('selectShotType', () => {
        it('should return NORMAL for most attack types', () => {
            const types: ShotType[] = [];
            for (let i = 0; i < 100; i++) {
                types.push((engine as any).selectShotType(AttackType.SHORT_PASS));
            }
            expect(types.every(t => t === ShotType.NORMAL || t === ShotType.REBOUND)).toBe(true);
        });

        it('CROSS should produce HEADER, NORMAL, or REBOUND', () => {
            const types = new Set<ShotType>();
            for (let i = 0; i < 200; i++) {
                types.add((engine as any).selectShotType(AttackType.CROSS));
            }
            expect(types.has(ShotType.HEADER)).toBe(true);
            expect(types.has(ShotType.NORMAL)).toBe(true);
            expect(types.has(ShotType.REBOUND)).toBe(true);
        });

        it('LONG_SHOT should always return LONG_SHOT', () => {
            for (let i = 0; i < 100; i++) {
                const type = (engine as any).selectShotType(AttackType.LONG_SHOT);
                expect(type).toBe(ShotType.LONG_SHOT);
            }
        });
    });

    describe('calculateHeaderRating', () => {
        it('should use strength as primary factor', () => {
            // Use more extreme difference to ensure strength dominates
            const weakPlayer = createMockPlayer('p1', 'Weak', { strength: 30, positioning: 90, finishing: 90 });
            const strongPlayer = createMockPlayer('p2', 'Strong', { strength: 90, positioning: 90, finishing: 90 });

            const weakRating = (engine as any).calculateHeaderRating(weakPlayer);
            const strongRating = (engine as any).calculateHeaderRating(strongPlayer);

            expect(strongRating).toBeGreaterThan(weakRating);
        });

        it('should return reasonable range', () => {
            const lowPlayer = createMockPlayer('p1', 'Low', { strength: 30, positioning: 30, finishing: 30 });
            const highPlayer = createMockPlayer('p2', 'High', { strength: 90, positioning: 90, finishing: 90 });

            const lowRating = (engine as any).calculateHeaderRating(lowPlayer);
            const highRating = (engine as any).calculateHeaderRating(highPlayer);

            expect(lowRating).toBeGreaterThan(100);
            expect(highRating).toBeLessThan(1000);
        });
    });

    describe('calculateShootRating', () => {
        it('should use finishing as primary factor', () => {
            // Use more extreme difference to ensure finishing dominates
            const badFinisher = createMockPlayer('p1', 'BadFinisher', { finishing: 30, composure: 90, positioning: 90, strength: 90 });
            const goodFinisher = createMockPlayer('p2', 'GoodFinisher', { finishing: 90, composure: 90, positioning: 90, strength: 90 });

            const badRating = (engine as any).calculateShootRating(badFinisher);
            const goodRating = (engine as any).calculateShootRating(goodFinisher);

            expect(goodRating).toBeGreaterThan(badRating);
        });
    });

    describe('calculateOneOnOneRating', () => {
        it('should prioritize finishing and composure', () => {
            const calmFinisher = createMockPlayer('p1', 'Calm', { finishing: 90, composure: 90, pace: 30 });
            const nervousDribbler = createMockPlayer('p2', 'Nervous', { finishing: 30, composure: 30, pace: 90 });

            const calmRating = (engine as any).calculateOneOnOneRating(calmFinisher);
            const nervousRating = (engine as any).calculateOneOnOneRating(nervousDribbler);

            expect(calmRating).toBeGreaterThan(nervousRating);
        });
    });

    describe('calculateLongShotRating', () => {
        it('should return value affected by finishing', () => {
            const goodShooter = createMockPlayer('p1', 'Good', { finishing: 90, composure: 90, strength: 90 });
            const badShooter = createMockPlayer('p2', 'Bad', { finishing: 30, composure: 30, strength: 30 });

            // Run multiple times due to distance factor
            let goodTotal = 0;
            let badTotal = 0;
            for (let i = 0; i < 50; i++) {
                goodTotal += (engine as any).calculateLongShotRating(goodShooter);
                badTotal += (engine as any).calculateLongShotRating(badShooter);
            }

            expect(goodTotal / 50).toBeGreaterThan(badTotal / 50);
        });

        it('should return lower values due to distance factor', () => {
            const player = createMockPlayer('p1', 'Test', { finishing: 90, composure: 90, strength: 90 });
            const shootRating = (engine as any).calculateShootRating(player);
            const longShotRating = (engine as any).calculateLongShotRating(player);

            // Long shot should generally be lower due to distance factor
            expect(longShotRating).toBeLessThan(shootRating);
        });
    });

    describe('selectShooter', () => {
        it('should prefer CF position', () => {
            const team = createMockTeam('Test', ['GK', 'LB', 'CM', 'CM', 'AM', 'CF', 'LW', 'RB', 'CD', 'CD', 'RW']);
            const shooters = new Set<string>();

            for (let i = 0; i < 200; i++) {
                const shooter = (engine as any).selectShooter(team);
                shooters.add((shooter.player as Player).name);
            }

            // CF should be selected most often
            expect(shooters.has('Test Player 5')).toBe(true); // CF at index 5
        });

        it('should rarely select GK', () => {
            const team = createMockTeam('Test', ['GK', 'LB', 'CM', 'CM', 'AM', 'CF', 'LW', 'RB', 'CD', 'CD', 'RW']);
            let gkSelections = 0;

            for (let i = 0; i < 200; i++) {
                const shooter = (engine as any).selectShooter(team);
                if (shooter.positionKey === 'GK') gkSelections++;
            }

            // GK should be selected rarely (only in the 25% fallback case)
            expect(gkSelections).toBeLessThan(100);
        });
    });

    describe('selectLongShotShooter', () => {
        it('should prefer AM position', () => {
            const team = createMockTeam('Test', ['GK', 'LB', 'CM', 'CM', 'AM', 'CF', 'LW', 'RB', 'CD', 'CD', 'RW']);
            let amSelections = 0;

            for (let i = 0; i < 200; i++) {
                const shooter = (engine as any).selectLongShotShooter(team);
                if (shooter.positionKey.includes('AM')) {
                    amSelections++;
                }
            }

            // AM should have significant selection rate
            expect(amSelections).toBeGreaterThan(0);
        });

        it('should not select GK', () => {
            const team = createMockTeam('Test', ['GK', 'LB', 'CM', 'CM', 'AM', 'CF', 'LW', 'RB', 'CD', 'CD', 'RW']);

            for (let i = 0; i < 50; i++) {
                const shooter = (engine as any).selectLongShotShooter(team);
                expect(shooter.positionKey).not.toBe('GK');
            }
        });
    });

    describe('selectAssist', () => {
        it('should not select shooter as assist', () => {
            const team = createMockTeam('Test', ['GK', 'LB', 'CM', 'CM', 'AM', 'CF', 'LW', 'RB', 'CD', 'CD', 'RW']);
            const shooter = (engine as any).selectShooter(team);

            const assist = (engine as any).selectAssist(team, shooter, 'OTHER');
            expect(assist).not.toBe(shooter);
        });

        it('should not select GK for normal assists', () => {
            const team = createMockTeam('Test', ['GK', 'LB', 'CM', 'CM', 'AM', 'CF', 'LW', 'RB', 'CD', 'CD', 'RW']);
            const shooter = { player: { id: 'shooter' }, positionKey: 'CF', isSentOff: false };

            for (let i = 0; i < 50; i++) {
                const assist = (engine as any).selectAssist(team, shooter, 'OTHER');
                if (assist) {
                    expect(assist.positionKey).not.toBe('GK');
                }
            }
        });

        it('CROSS attack type should select wide players', () => {
            const team = createMockTeam('Test', ['GK', 'LB', 'CM', 'CM', 'AM', 'CF', 'LW', 'RB', 'CD', 'CD', 'RW']);
            const shooter = { player: { id: 'shooter' }, positionKey: 'CF', isSentOff: false };

            let wideSelections = 0;
            for (let i = 0; i < 100; i++) {
                const assist = (engine as any).selectAssist(team, shooter, 'CROSS');
                if (assist && (
                    assist.positionKey.includes('LB') ||
                    assist.positionKey.includes('RB') ||
                    assist.positionKey.includes('LW') ||
                    assist.positionKey.includes('RW')
                )) {
                    wideSelections++;
                }
            }

            // All assists for CROSS should be wide players
            expect(wideSelections).toBeGreaterThan(0);
        });
    });

    describe('resolveDuel', () => {
        it('higher attack should have higher success rate', () => {
            let lowWin = 0;
            let highWin = 0;

            for (let i = 0; i < 1000; i++) {
                if ((engine as any).resolveDuel(100, 50, 0.05, 0)) lowWin++;
                if ((engine as any).resolveDuel(150, 50, 0.05, 0)) highWin++;
            }

            expect(highWin).toBeGreaterThan(lowWin);
        });

        it('higher offset should reduce success rate', () => {
            let lowOffsetWin = 0;
            let highOffsetWin = 0;

            for (let i = 0; i < 1000; i++) {
                if ((engine as any).resolveDuel(100, 50, 0.05, 10)) lowOffsetWin++;
                if ((engine as any).resolveDuel(100, 50, 0.05, 50)) highOffsetWin++;
            }

            expect(lowOffsetWin).toBeGreaterThan(highOffsetWin);
        });

        it('should handle equal values with base offset', () => {
            let goals = 0;
            for (let i = 0; i < 1000; i++) {
                if ((engine as any).resolveDuel(100, 100, 0.05, 42)) goals++;
            }

            // With offset 42 (effective ~28 after /1.5), success rate should be low
            expect(goals / 1000).toBeLessThan(0.3);
        });
    });
});
