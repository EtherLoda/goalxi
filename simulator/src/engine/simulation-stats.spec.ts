import { MatchEngine } from './match.engine';
import { Team } from './classes/Team';
import { TacticalPlayer, AttackType, ShotType } from './types/simulation.types';
import { Player } from '../types/player.types';

/**
 * 仿真测试：运行大量比赛并统计各项数据
 */
describe('Simulation Statistics', () => {
    // Helper to create mock players
    const createMockPlayer = (id: string, name: string, attrValue: number): Player => ({
        id,
        name,
        position: 'CM',
        exactAge: [25, 0],
        attributes: {
            finishing: attrValue,
            composure: attrValue,
            positioning: attrValue,
            strength: attrValue,
            pace: attrValue,
            dribbling: attrValue,
            passing: attrValue,
            defending: attrValue,
            freeKicks: attrValue,
            penalties: attrValue,
            gk_reflexes: attrValue,
            gk_handling: attrValue,
            gk_distribution: attrValue,
        },
        currentStamina: 3,
        form: 5,
        experience: 10
    });

    // Helper to create mock team
    const createUniformTeam = (name: string, attrValue: number): Team => {
        const positions = ['GK', 'LB', 'CD', 'CD', 'RB', 'CM', 'CM', 'AM', 'LW', 'CF', 'RW'];
        const players: TacticalPlayer[] = positions.map((pos, i) => ({
            player: createMockPlayer(`${name}-${i}`, `${name} Player ${i}`, attrValue),
            positionKey: pos
        }));
        return new Team(name, players);
    };

    // 统计结构
    interface MatchStats {
        homeGoals: number;
        awayGoals: number;
        homeAssists: number;
        awayAssists: number;
        goalsByType: Record<string, number>;
        assistsByType: Record<string, number>;
        attackTypeCounts: Record<string, number>;
        shotTypeCounts: Record<string, number>;
    }

    const runSimulation = (homeOvr: number, awayOvr: number, iterations: number): MatchStats => {
        const stats: MatchStats = {
            homeGoals: 0,
            awayGoals: 0,
            homeAssists: 0,
            awayAssists: 0,
            goalsByType: {},
            assistsByType: {},
            attackTypeCounts: {},
            shotTypeCounts: {}
        };

        for (let i = 0; i < iterations; i++) {
            const homeTeam = createUniformTeam('Home', homeOvr);
            const awayTeam = createUniformTeam('Away', awayOvr);
            const engine = new MatchEngine(homeTeam, awayTeam);
            const events = engine.simulateMatch();

            // 统计进球
            const goalEvents = events.filter(e => e.type === 'goal');
            for (const goal of goalEvents) {
                const data = goal.data as any;
                const isHome = goal.teamName === 'Home';

                if (isHome) stats.homeGoals++;
                else stats.awayGoals++;

                // 统计进球类型
                const shotType = data?.sequence?.shot?.shotType || 'unknown';
                stats.goalsByType[shotType] = (stats.goalsByType[shotType] || 0) + 1;

                // 统计助攻
                if (data?.assist) {
                    if (isHome) stats.homeAssists++;
                    else stats.awayAssists++;
                }

                // 统计进攻类型
                const attackType = data?.sequence?.attackType || 'unknown';
                stats.attackTypeCounts[attackType] = (stats.attackTypeCounts[attackType] || 0) + 1;

                // 统计射门类型
                stats.shotTypeCounts[shotType] = (stats.shotTypeCounts[shotType] || 0) + 1;
            }
        }

        return stats;
    };

    describe('Equal Teams (OVR 12)', () => {
        it('should have balanced results with equal teams', () => {
            console.log('\n========== Equal Teams Test (OVR 12) ==========');
            const stats = runSimulation(12, 12, 1000);

            const totalGoals = stats.homeGoals + stats.awayGoals;
            const avgGoalsPerMatch = totalGoals / 1000;
            const goalDiff = Math.abs(stats.homeGoals - stats.awayGoals);

            console.log(`Total Matches: 1000`);
            console.log(`Home Goals: ${stats.homeGoals} (${(stats.homeGoals / totalGoals * 100).toFixed(1)}%)`);
            console.log(`Away Goals: ${stats.awayGoals} (${(stats.awayGoals / totalGoals * 100).toFixed(1)}%)`);
            console.log(`Total Goals: ${totalGoals}`);
            console.log(`Avg Goals/Match: ${avgGoalsPerMatch.toFixed(2)}`);
            console.log(`Goal Difference (home-away): ${goalDiff}`);
            console.log(`\nGoals by Type:`);
            for (const [type, count] of Object.entries(stats.goalsByType)) {
                console.log(`  ${type}: ${count} (${(count / totalGoals * 100).toFixed(1)}%)`);
            }
            console.log(`\nAttack Type Distribution:`);
            for (const [type, count] of Object.entries(stats.attackTypeCounts)) {
                const totalAttacks = Object.values(stats.attackTypeCounts).reduce((a, b) => a + b, 0);
                console.log(`  ${type}: ${count} (${(count / totalAttacks * 100).toFixed(1)}%)`);
            }
            console.log(`\nShot Type Distribution:`);
            for (const [type, count] of Object.entries(stats.shotTypeCounts)) {
                console.log(`  ${type}: ${count}`);
            }

            // 验证
            expect(avgGoalsPerMatch).toBeGreaterThan(3.5);
            expect(avgGoalsPerMatch).toBeLessThan(5.5);
            expect(goalDiff / totalGoals).toBeLessThan(0.15); // 差距小于15%
        });
    });

    describe('Unequal Teams (OVR 8 vs OVR 16)', () => {
        it('should show advantage for stronger team', () => {
            console.log('\n========== Unequal Teams Test (OVR 8 vs OVR 16) ==========');
            const stats = runSimulation(8, 16, 1000);

            const totalGoals = stats.homeGoals + stats.awayGoals;
            const avgGoalsPerMatch = totalGoals / 1000;
            const strongTeamGoals = stats.awayGoals; // OVR 16 is away
            const weakTeamGoals = stats.homeGoals; // OVR 8 is home

            console.log(`Total Matches: 1000`);
            console.log(`Weak Team (OVR 8) Goals: ${weakTeamGoals}`);
            console.log(`Strong Team (OVR 16) Goals: ${strongTeamGoals}`);
            console.log(`Total Goals: ${totalGoals}`);
            console.log(`Avg Goals/Match: ${avgGoalsPerMatch.toFixed(2)}`);
            console.log(`Strong/Weak Ratio: ${(strongTeamGoals / Math.max(1, weakTeamGoals)).toFixed(2)}`);

            console.log(`\nGoals by Type (Weak Team):`);
            for (const [type, count] of Object.entries(stats.goalsByType)) {
                console.log(`  ${type}: ${count}`);
            }

            // 验证强队优势
            expect(strongTeamGoals).toBeGreaterThan(weakTeamGoals);
            expect(strongTeamGoals / Math.max(1, weakTeamGoals)).toBeGreaterThan(2); // 至少2倍
        });
    });

    describe('Detailed Stats Comparison', () => {
        it('should provide detailed comparison', () => {
            console.log('\n========== Detailed Comparison ==========');

            const equalStats = runSimulation(12, 12, 1000);
            const unequalStats = runSimulation(8, 16, 1000);

            console.log('\n--- Equal Teams (12 vs 12) ---');
            console.log(`Goals: ${equalStats.homeGoals + equalStats.awayGoals}`);
            console.log(`Goal Diff: ${Math.abs(equalStats.homeGoals - equalStats.awayGoals)}`);

            console.log('\n--- Unequal Teams (8 vs 16) ---');
            console.log(`Weak (8): ${unequalStats.homeGoals} goals`);
            console.log(`Strong (16): ${unequalStats.awayGoals} goals`);
            console.log(`Ratio: ${(unequalStats.awayGoals / Math.max(1, unequalStats.homeGoals)).toFixed(2)}x`);

            console.log('\n--- Shot Type Breakdown ---');
            console.log('Equal Teams:');
            for (const [type, count] of Object.entries(equalStats.shotTypeCounts)) {
                console.log(`  ${type}: ${count}`);
            }
            console.log('Unequal Teams:');
            for (const [type, count] of Object.entries(unequalStats.shotTypeCounts)) {
                console.log(`  ${type}: ${count}`);
            }

            // 汇总
            console.log('\n========== Summary ==========');
            console.log(`OVR 12 vs OVR 12: ${(equalStats.homeGoals + equalStats.awayGoals).toFixed(0)} total goals, ${((equalStats.homeGoals + equalStats.awayGoals) / 1000).toFixed(2)} per match`);
            console.log(`OVR 8 vs OVR 16: ${(unequalStats.homeGoals + unequalStats.awayGoals).toFixed(0)} total goals, ${((unequalStats.homeGoals + unequalStats.awayGoals) / 1000).toFixed(2)} per match`);

            expect(true).toBe(true); // Just for test structure
        });
    });
});
