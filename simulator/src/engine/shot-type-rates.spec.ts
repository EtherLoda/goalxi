import { MatchEngine } from './match.engine';
import { Team } from './classes/Team';
import { TacticalPlayer } from './types/simulation.types';
import { Player } from '../types/player.types';
import { ShotType } from './types/simulation.types';

/**
 * 测试各射门类型的进球率（多阵型）
 */
describe('Shot Type Goal Rates', () => {
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
            gk_aerial: attrValue,
        },
        currentStamina: 3,
        form: 5,
        experience: 10
    });

    // 阵型定义
    const FORMATIONS: Record<string, string[]> = {
        '4-3-1-2': ['GK', 'LB', 'CDL', 'CDR', 'RB', 'CML', 'CMR', 'AM', 'LW', 'CFR', 'RW'],
        '4-4-2': ['GK', 'LB', 'CDL', 'CDR', 'RB', 'LM', 'CML', 'CMR', 'RM', 'CFL', 'CFR'],
        '4-2-3-1': ['GK', 'LB', 'CDL', 'CDR', 'RB', 'DML', 'DMR', 'CM', 'LW', 'CF', 'RW'],
        '3-5-2': ['GK', 'CDL', 'CD', 'CDR', 'LM', 'CML', 'CM', 'CMR', 'RM', 'CFL', 'CFR'],
        '4-1-4-1': ['GK', 'LB', 'CDL', 'CDR', 'RB', 'DM', 'CML', 'CM', 'CMR', 'CM', 'CF'],
        '5-3-2': ['GK', 'CDL', 'CD', 'CDR', 'LB', 'RB', 'CML', 'CM', 'CMR', 'CFL', 'CFR'],
        // 自定义阵型
        '4-2-3-1-v2': ['GK', 'LB', 'CDL', 'CDR', 'RB', 'CML', 'CMR', 'AM', 'LW', 'RW', 'CF'], // 2CM + 2边锋 + 1AM
        '4-4-2-diamond': ['GK', 'LB', 'CDL', 'CDR', 'RB', 'WML', 'CML', 'CMR', 'WMR', 'CFL', 'CFR'], // 2WM + CML + CMR
    };

    const createUniformTeam = (name: string, attrValue: number, formation: string): Team => {
        const positions = FORMATIONS[formation] || FORMATIONS['4-3-1-2'];
        const players: TacticalPlayer[] = positions.map((pos, i) => ({
            player: createMockPlayer(`${name}-${i}`, `${name} Player ${i}`, attrValue),
            positionKey: pos
        }));
        return new Team(name, players);
    };

    const runMatches = (homeAttr: number, awayAttr: number, count: number, formation: string) => {
        interface ShotStats {
            [key: string]: { total: number; goals: number };
        }

        const shotStats: ShotStats = {
            ONE_ON_ONE: { total: 0, goals: 0 },
            HEADER: { total: 0, goals: 0 },
            REBOUND: { total: 0, goals: 0 },
            NORMAL: { total: 0, goals: 0 },
            LONG_SHOT: { total: 0, goals: 0 },
        };
        let totalShotsAll = 0;
        let totalMoments = 0;
        let laneDistribution = { left: 0, center: 0, right: 0 };
        let laneShots = { left: 0, center: 0, right: 0 };
        let laneGoals = { left: 0, center: 0, right: 0 };

        for (let i = 0; i < count; i++) {
            const home = createUniformTeam('Home', homeAttr, formation);
            const away = createUniformTeam('Away', awayAttr, formation);
            const engine = new MatchEngine(home, away);

            const events = engine.simulateMatch();

            // Debug: 打印第一场的所有 shotType
            if (i === 0) {
                const allShotTypes: Record<string, number> = {};
                for (const event of events) {
                    if (event.type === 'shot' || event.type === 'goal' || event.type === 'save' || event.type === 'miss') {
                        const data = event.data as any;
                        const sequence = data?.sequence;
                        const shot = sequence?.shot;
                        if (shot && shot.shotType) {
                            const shotTypeName = shot.shotType as string;
                            allShotTypes[shotTypeName] = (allShotTypes[shotTypeName] || 0) + 1;
                        }
                    }
                }
                console.log(`[${formation}] First match shot types:`, allShotTypes);
            }

            const shotEvents = events.filter(e =>
                e.type === 'shot' || e.type === 'goal' || e.type === 'save' || e.type === 'miss'
            );
            totalMoments += 20;
            totalShotsAll += shotEvents.length;

            for (const event of events) {
                if (event.type === 'shot' || event.type === 'goal' || event.type === 'save' || event.type === 'miss') {
                    const data = event.data as any;
                    const sequence = data?.sequence;
                    const shot = sequence?.shot;
                    const lane = data?.lane as string;

                    if (lane) {
                        laneDistribution[lane as keyof typeof laneDistribution]++;
                    }

                    if (shot && shot.shotType) {
                        const shotTypeName = shot.shotType as string;

                        if (shotStats[shotTypeName] !== undefined) {
                            shotStats[shotTypeName].total++;
                            if (event.type === 'goal') {
                                shotStats[shotTypeName].goals++;
                                if (lane) {
                                    laneGoals[lane as keyof typeof laneGoals]++;
                                }
                            }
                        }
                        if (lane) {
                            laneShots[lane as keyof typeof laneShots]++;
                        }
                    }
                }
            }
        }

        return { shotStats, totalShots: totalShotsAll, totalMoments, laneDistribution, laneShots, laneGoals };
    };

    // 测试所有阵型
    for (const [formationName, positions] of Object.entries(FORMATIONS)) {
        it(`should show different goal rates for each shot type (${formationName}, OVR 12 vs 12)`, () => {
            console.log(`\n========== Shot Type Goal Rates (${formationName}, 500 matches, OVR 12 vs 12) ==========`);
            console.log(`Positions: ${positions.join(', ')}`);
            const { shotStats, totalShots, totalMoments, laneDistribution, laneShots, laneGoals } = runMatches(12, 12, 500, formationName);

            let totalGoals = 0;

            for (const [shotType, data] of Object.entries(shotStats)) {
                const rate = data.total > 0 ? ((data.goals / data.total) * 100).toFixed(1) : 'N/A';
                console.log(`${shotType}: ${data.goals}/${data.total} goals (${rate}%)`);
                totalGoals += data.goals;
            }

            const pushSuccessRate = totalMoments > 0 ? ((totalShots / totalMoments) * 100).toFixed(1) : 'N/A';
            const shotConversionRate = totalShots > 0 ? ((totalGoals / totalShots) * 100).toFixed(1) : 'N/A';
            const overallRate = totalShots > 0 ? ((totalGoals / totalShots) * 100).toFixed(1) : 'N/A';
            console.log(`\nOverall: ${totalGoals}/${totalShots} goals (${overallRate}%)`);
            console.log(`Avg shots per match: ${(totalShots / 500).toFixed(2)}`);
            console.log(`Avg goals per match: ${(totalGoals / 500).toFixed(2)}`);
            console.log(`Push success rate: ${pushSuccessRate}% (${totalShots}/${totalMoments})`);
            console.log(`Shot conversion rate: ${shotConversionRate}%`);

            // Lane distribution
            const totalLaneEvents = laneDistribution.left + laneDistribution.center + laneDistribution.right;
            console.log(`\nLane distribution (shot events):`);
            if (totalLaneEvents > 0) {
                console.log(`  Left:   ${(laneDistribution.left / totalLaneEvents * 100).toFixed(1)}% | Shots: ${laneShots.left} | Goals: ${laneGoals.left} | Conv: ${laneShots.left > 0 ? (laneGoals.left/laneShots.left*100).toFixed(1) : 'N/A'}%`);
                console.log(`  Center: ${(laneDistribution.center / totalLaneEvents * 100).toFixed(1)}% | Shots: ${laneShots.center} | Goals: ${laneGoals.center} | Conv: ${laneShots.center > 0 ? (laneGoals.center/laneShots.center*100).toFixed(1) : 'N/A'}%`);
                console.log(`  Right:  ${(laneDistribution.right / totalLaneEvents * 100).toFixed(1)}% | Shots: ${laneShots.right} | Goals: ${laneGoals.right} | Conv: ${laneShots.right > 0 ? (laneGoals.right/laneShots.right*100).toFixed(1) : 'N/A'}%`);
            } else {
                console.log(`  No lane data available`);
            }

            expect(totalShots).toBeGreaterThan(0);
            expect(totalGoals).toBeGreaterThan(0);
        });
    }

    const runMatchesDetailed = (homeAttr: number, awayAttr: number, count: number, formation: string) => {
        interface ShotStats {
            [key: string]: { total: number; goals: number };
        }
        interface LaneData {
            attacks: number;
            shots: number;
            goals: number;
            shotTypes: ShotStats;
        }

        const laneData: Record<string, LaneData> = {
            left: { attacks: 0, shots: 0, goals: 0, shotTypes: { ONE_ON_ONE: {total:0,goals:0}, HEADER: {total:0,goals:0}, REBOUND: {total:0,goals:0}, NORMAL: {total:0,goals:0}, LONG_SHOT: {total:0,goals:0} } },
            center: { attacks: 0, shots: 0, goals: 0, shotTypes: { ONE_ON_ONE: {total:0,goals:0}, HEADER: {total:0,goals:0}, REBOUND: {total:0,goals:0}, NORMAL: {total:0,goals:0}, LONG_SHOT: {total:0,goals:0} } },
            right: { attacks: 0, shots: 0, goals: 0, shotTypes: { ONE_ON_ONE: {total:0,goals:0}, HEADER: {total:0,goals:0}, REBOUND: {total:0,goals:0}, NORMAL: {total:0,goals:0}, LONG_SHOT: {total:0,goals:0} } },
        };
        let totalMoments = 0;

        for (let i = 0; i < count; i++) {
            const home = createUniformTeam('Home', homeAttr, formation);
            const away = createUniformTeam('Away', awayAttr, formation);
            const engine = new MatchEngine(home, away);

            const events = engine.simulateMatch();
            totalMoments += 20;

            for (const event of events) {
                if (event.type === 'shot' || event.type === 'goal' || event.type === 'save' || event.type === 'miss') {
                    const data = event.data as any;
                    const sequence = data?.sequence;
                    const lane = data?.lane as string;
                    const shot = sequence?.shot;

                    if (lane && laneData[lane]) {
                        laneData[lane].attacks++;
                        if (shot && shot.shotType) {
                            const shotTypeName = shot.shotType as string;
                            if (laneData[lane].shotTypes[shotTypeName]) {
                                laneData[lane].shotTypes[shotTypeName].total++;
                                if (event.type === 'goal') {
                                    laneData[lane].shotTypes[shotTypeName].goals++;
                                    laneData[lane].goals++;
                                }
                            }
                            laneData[lane].shots++;
                        }
                    }
                }
            }
        }

        return { laneData, totalMoments };
    };

    it('detailed analysis for 4-2-3-1', () => {
        const { laneData, totalMoments } = runMatchesDetailed(12, 12, 500, '4-2-3-1');

        console.log('\n========== 4-2-3-1 Detailed Analysis (500 matches) ==========');
        console.log(`Positions: ${FORMATIONS['4-2-3-1'].join(', ')}`);
        console.log(`Total key moments: ${totalMoments}`);
        console.log('');

        console.log('Lane      | Attacks | Shots | Push%   | Goals | Conv%  | ONE_ON_ONE | HEADER | REBOUND | NORMAL | LONG_SHOT');
        console.log('----------|---------|-------|---------|-------|--------|------------|--------|---------|--------|----------');

        for (const lane of ['left', 'center', 'right']) {
            const d = laneData[lane];
            const pushRate = d.attacks > 0 ? ((d.shots / d.attacks) * 100).toFixed(1) : '0.0';
            const convRate = d.shots > 0 ? ((d.goals / d.shots) * 100).toFixed(1) : '0.0';
            const st = (name: string) => {
                const s = d.shotTypes[name];
                return s.total > 0 ? `${(s.goals/s.total*100).toFixed(0)}%` : '-';
            };
            console.log(`${lane.padEnd(10)}| ${String(d.attacks).padStart(7)} | ${String(d.shots).padStart(5)} | ${pushRate.padStart(7)}% | ${String(d.goals).padStart(5)} | ${convRate.padStart(6)}% | ${st('ONE_ON_ONE').padStart(10)} | ${st('HEADER').padStart(6)} | ${st('REBOUND').padStart(7)} | ${st('NORMAL').padStart(6)} | ${st('LONG_SHOT').padStart(9)}`);
        }

        const totalAttacks = laneData.left.attacks + laneData.center.attacks + laneData.right.attacks;
        const totalShots = laneData.left.shots + laneData.center.shots + laneData.right.shots;
        const totalGoals = laneData.left.goals + laneData.center.goals + laneData.right.goals;
        const overallPush = totalAttacks > 0 ? ((totalShots / totalMoments) * 100).toFixed(1) : '0.0';
        const overallConv = totalShots > 0 ? ((totalGoals / totalShots) * 100).toFixed(1) : '0.0';

        console.log('----------|---------|-------|---------|-------|--------|------------|--------|---------|--------|----------');
        console.log(`${'TOTAL'.padEnd(10)}| ${String(totalAttacks).padStart(7)} | ${String(totalShots).padStart(5)} | ${overallPush.padStart(7)}% | ${String(totalGoals).padStart(5)} | ${overallConv.padStart(6)}%`);

        expect(totalShots).toBeGreaterThan(0);
    });

    it('4312 vs 532 per-lane analysis (500 matches)', () => {
        interface LaneStats {
            attacks: number;
            shots: number;
            pushSuccess: number;
            goals: number;
            attPower: number;
            defPower: number;
            possession: number;  // 控球次数
            shotTypes: Record<string, { total: number; goals: number }>;
        }

        const homeStats: Record<string, LaneStats> = {
            left: { attacks: 0, shots: 0, pushSuccess: 0, goals: 0, attPower: 0, defPower: 0, possession: 0, shotTypes: {} },
            center: { attacks: 0, shots: 0, pushSuccess: 0, goals: 0, attPower: 0, defPower: 0, possession: 0, shotTypes: {} },
            right: { attacks: 0, shots: 0, pushSuccess: 0, goals: 0, attPower: 0, defPower: 0, possession: 0, shotTypes: {} },
        };
        const awayStats: Record<string, LaneStats> = {
            left: { attacks: 0, shots: 0, pushSuccess: 0, goals: 0, attPower: 0, defPower: 0, possession: 0, shotTypes: {} },
            center: { attacks: 0, shots: 0, pushSuccess: 0, goals: 0, attPower: 0, defPower: 0, possession: 0, shotTypes: {} },
            right: { attacks: 0, shots: 0, pushSuccess: 0, goals: 0, attPower: 0, defPower: 0, possession: 0, shotTypes: {} },
        };

        for (let i = 0; i < 500; i++) {
            const home = createUniformTeam('Home', 12, '4-3-1-2');
            const away = createUniformTeam('Away', 12, '5-3-2');
            const engine = new MatchEngine(home, away) as any;
            const events = engine.simulateMatch();

            for (const event of events) {
                // 追踪每路控球
                if (event.type === 'goal' || event.type === 'shot' || event.type === 'miss' || event.type === 'save' || event.type === 'turnover') {
                    const data = event.data as any;
                    const sequence = data?.sequence;
                    const push = sequence?.attackPush;
                    const shot = sequence?.shot;
                    const lane = data?.lane as string;
                    const isHome = event.teamName === 'Home';
                    const stats = isHome ? homeStats : awayStats;

                    if (lane && stats[lane]) {
                        stats[lane].attacks++;
                        if (push?.attackPower) {
                            stats[lane].attPower += push.attackPower;
                        }
                        if (push?.defensePower) {
                            stats[lane].defPower += push.defensePower;
                        }
                        if (push?.success) {
                            stats[lane].pushSuccess++;
                        }
                        if (shot) {
                            stats[lane].shots++;
                            const shotType = shot.shotType as string;
                            if (!stats[lane].shotTypes[shotType]) {
                                stats[lane].shotTypes[shotType] = { total: 0, goals: 0 };
                            }
                            stats[lane].shotTypes[shotType].total++;
                            if (event.type === 'goal') {
                                stats[lane].goals++;
                                stats[lane].shotTypes[shotType].goals++;
                            }
                        }
                    }
                }

                // 追踪控球（每场比赛每个lane的每次进攻都算一次控球）
                const data = event.data as any;
                const sequence = data?.sequence;
                const lane = data?.lane as string;
                if (lane && sequence?.midfieldBattle?.winner) {
                    const winner = sequence.midfieldBattle.winner;
                    if (winner === 'Home') {
                        homeStats[lane].possession++;
                    } else {
                        awayStats[lane].possession++;
                    }
                }
            }
        }

        const printTeamStats = (teamName: string, stats: Record<string, LaneStats>) => {
            console.log(`\n${teamName} (4-3-1-2):`);
            console.log('Lane    | Possession | Ratio | Push%   | Goals');
            console.log('--------|------------|-------|---------|------');

            for (const lane of ['left', 'center', 'right']) {
                const s = stats[lane];
                const ratio = s.defPower > 0 ? (s.attPower / s.defPower).toFixed(2) : '-';
                const pushRate = s.attacks > 0 ? ((s.pushSuccess / s.attacks) * 100).toFixed(1) : '0.0';

                console.log(`${lane.padEnd(8)}| ${String(s.possession).padStart(10)} | ${ratio.padStart(5)} | ${pushRate.padStart(7)}% | ${s.goals}`);
            }
        };

        const printLaneComparison = () => {
            console.log('\n========== Lane Possession Comparison ==========');
            console.log('Lane    | Home Poss | Away Poss | Total | Home%  | Away%  | Ratio');
            console.log('--------|-----------|-----------|-------|--------|--------|------');

            for (const lane of ['left', 'center', 'right']) {
                const homePoss = homeStats[lane].possession;
                const awayPoss = awayStats[lane].possession;
                const total = homePoss + awayPoss;
                const homePct = total > 0 ? ((homePoss / total) * 100).toFixed(1) : '0.0';
                const awayPct = total > 0 ? ((awayPoss / total) * 100).toFixed(1) : '0.0';
                const homeRatio = awayPoss > 0 ? (homePoss / awayPoss).toFixed(2) : '-';
                console.log(`${lane.padEnd(8)}| ${String(homePoss).padStart(11)} | ${String(awayPoss).padStart(9)} | ${String(total).padStart(5)} | ${homePct.padStart(6)}% | ${awayPct.padStart(6)}% | ${homeRatio}`);
            }
        };

        console.log('\n========== 4312 vs 532 Per-Lane Analysis (500 matches) ==========');
        printTeamStats('Home (4-3-1-2)', homeStats);
        printTeamStats('Away (5-3-2)', awayStats);
        printLaneComparison();
    });

    it('4231-v2 vs 442-diamond per-lane analysis (500 matches)', () => {
        interface LaneStats {
            attacks: number;
            shots: number;
            pushSuccess: number;
            goals: number;
            attPower: number;
            defPower: number;
            possession: number;
            shotTypes: Record<string, { total: number; goals: number }>;
        }

        interface AttackTypeStats {
            total: number;
            success: number;
            shots: number;
            goals: number;
        }

        interface ShotTypeStats {
            total: number;
            goals: number;
        }

        const homeLaneStats: Record<string, LaneStats> = {
            left: { attacks: 0, shots: 0, pushSuccess: 0, goals: 0, attPower: 0, defPower: 0, possession: 0, shotTypes: {} },
            center: { attacks: 0, shots: 0, pushSuccess: 0, goals: 0, attPower: 0, defPower: 0, possession: 0, shotTypes: {} },
            right: { attacks: 0, shots: 0, pushSuccess: 0, goals: 0, attPower: 0, defPower: 0, possession: 0, shotTypes: {} },
        };
        const awayLaneStats: Record<string, LaneStats> = {
            left: { attacks: 0, shots: 0, pushSuccess: 0, goals: 0, attPower: 0, defPower: 0, possession: 0, shotTypes: {} },
            center: { attacks: 0, shots: 0, pushSuccess: 0, goals: 0, attPower: 0, defPower: 0, possession: 0, shotTypes: {} },
            right: { attacks: 0, shots: 0, pushSuccess: 0, goals: 0, attPower: 0, defPower: 0, possession: 0, shotTypes: {} },
        };

        // 推进方式和射门方式统计
        const homeAttackTypeStats: Record<string, AttackTypeStats> = {};
        const awayAttackTypeStats: Record<string, AttackTypeStats> = {};
        const homeShotTypeStats: Record<string, ShotTypeStats> = {};
        const awayShotTypeStats: Record<string, ShotTypeStats> = {};

        let homeGoals = 0, awayGoals = 0;
        let homeWins = 0, awayWins = 0, draws = 0;
        const homeMatchGoals: number[] = [];
        const awayMatchGoals: number[] = [];

        for (let i = 0; i < 500; i++) {
            const home = createUniformTeam('Home', 12, '4-2-3-1-v2');
            const away = createUniformTeam('Away', 12, '4-4-2-diamond');
            const engine = new MatchEngine(home, away) as any;
            const events = engine.simulateMatch();

            let matchHomeGoals = 0, matchAwayGoals = 0;

            for (const event of events) {
                if (event.type === 'goal') {
                    if (event.teamName === 'Home') {
                        homeGoals++;
                        matchHomeGoals++;
                    } else {
                        awayGoals++;
                        matchAwayGoals++;
                    }
                }

                if (event.type === 'goal' || event.type === 'shot' || event.type === 'miss' || event.type === 'save' || event.type === 'turnover') {
                    const data = event.data as any;
                    const sequence = data?.sequence;
                    const push = sequence?.attackPush;
                    const shot = sequence?.shot;
                    const lane = data?.lane as string;
                    const attackType = sequence?.attackType as string;
                    const isHome = event.teamName === 'Home';
                    const laneStats = isHome ? homeLaneStats : awayLaneStats;
                    const attackStats = isHome ? homeAttackTypeStats : awayAttackTypeStats;
                    const shotStats = isHome ? homeShotTypeStats : awayShotTypeStats;

                    if (lane && laneStats[lane]) {
                        laneStats[lane].attacks++;
                        if (push?.attackPower) laneStats[lane].attPower += push.attackPower;
                        if (push?.defensePower) laneStats[lane].defPower += push.defensePower;
                        if (push?.success) laneStats[lane].pushSuccess++;

                        // 推进方式统计
                        if (attackType) {
                            if (!attackStats[attackType]) attackStats[attackType] = { total: 0, success: 0, shots: 0, goals: 0 };
                            attackStats[attackType].total++;
                            if (push?.success) attackStats[attackType].success++;
                        }

                        if (shot) {
                            laneStats[lane].shots++;
                            const shotType = shot.shotType as string;
                            if (!shotStats[shotType]) shotStats[shotType] = { total: 0, goals: 0 };
                            shotStats[shotType].total++;
                            if (attackStats[attackType]) attackStats[attackType].shots++;
                            if (event.type === 'goal') {
                                laneStats[lane].goals++;
                                shotStats[shotType].goals++;
                                if (attackStats[attackType]) attackStats[attackType].goals++;
                            }
                        }
                    }
                }

                const data = event.data as any;
                const sequence = data?.sequence;
                const lane = data?.lane as string;
                if (lane && sequence?.midfieldBattle?.winner) {
                    const winner = sequence.midfieldBattle.winner;
                    if (winner === 'Home') homeLaneStats[lane].possession++;
                    else awayLaneStats[lane].possession++;
                }
            }

            // 记录本场结果
            homeMatchGoals.push(matchHomeGoals);
            awayMatchGoals.push(matchAwayGoals);
            if (matchHomeGoals > matchAwayGoals) homeWins++;
            else if (matchHomeGoals < matchAwayGoals) awayWins++;
            else draws++;
        }

        // 打印结果
        const totalMatches = homeMatchGoals.length;
        const avgHomeGoals = (homeGoals / totalMatches).toFixed(2);
        const avgAwayGoals = (awayGoals / totalMatches).toFixed(2);
        const homeWinRate = ((homeWins / totalMatches) * 100).toFixed(1);
        const awayWinRate = ((awayWins / totalMatches) * 100).toFixed(1);
        const drawRate = ((draws / totalMatches) * 100).toFixed(1);

        console.log('\n========== 4231-v2 (2CM+2边锋+1AM) vs 442-diamond (WML+CML+CMR+WMR) ==========');
        console.log(`\n比分: 4231 ${homeGoals} vs ${awayGoals} 442-diamond`);
        console.log(`场均: ${avgHomeGoals} vs ${avgAwayGoals} | 胜率: ${homeWinRate}% vs ${awayWinRate}% | 平率: ${drawRate}%`);

        console.log('\n--- 控球率 ---');
        console.log('Lane    | Home Poss | Away Poss | Total | Home%  | Away%  | Ratio');
        console.log('--------|-----------|-----------|-------|--------|--------|------');
        for (const lane of ['left', 'center', 'right']) {
            const homePoss = homeLaneStats[lane].possession;
            const awayPoss = awayLaneStats[lane].possession;
            const total = homePoss + awayPoss;
            const homePct = total > 0 ? ((homePoss / total) * 100).toFixed(1) : '0.0';
            const awayPct = total > 0 ? ((awayPoss / total) * 100).toFixed(1) : '0.0';
            const homeRatio = awayPoss > 0 ? (homePoss / awayPoss).toFixed(2) : '-';
            console.log(`${lane.padEnd(8)}| ${String(homePoss).padStart(11)} | ${String(awayPoss).padStart(9)} | ${String(total).padStart(5)} | ${homePct.padStart(6)}% | ${awayPct.padStart(6)}% | ${homeRatio}`);
        }

        console.log('\n--- 推进成功率 ---');
        console.log('Lane    | Home Ratio | Home Push% | Away Ratio | Away Push%');
        console.log('--------|------------|------------|------------|------------');
        for (const lane of ['left', 'center', 'right']) {
            const home = homeLaneStats[lane];
            const away = awayLaneStats[lane];
            const homeRatio = home.defPower > 0 ? (home.attPower / home.defPower).toFixed(2) : '-';
            const awayRatio = away.defPower > 0 ? (away.attPower / away.defPower).toFixed(2) : '-';
            const homePush = home.attacks > 0 ? ((home.pushSuccess / home.attacks) * 100).toFixed(1) : '0.0';
            const awayPush = away.attacks > 0 ? ((away.pushSuccess / away.attacks) * 100).toFixed(1) : '0.0';
            console.log(`${lane.padEnd(8)}| ${homeRatio.padStart(10)} | ${homePush.padStart(10)}% | ${awayRatio.padStart(10)} | ${awayPush.padStart(10)}%`);
        }

        console.log('\n--- 4231 推进方式统计 ---');
        console.log('推进方式 | 次数 | 占比 | 成功 | 成功率 | 射门');
        console.log('--------|------|------|------|--------|------');
        const atTotal = Object.values(homeAttackTypeStats).reduce((sum, s) => sum + s.total, 0);
        for (const [type, stats] of Object.entries(homeAttackTypeStats).sort((a, b) => b[1].total - a[1].total)) {
            const pct = atTotal > 0 ? ((stats.total / atTotal) * 100).toFixed(1) : '0.0';
            const successRate = stats.total > 0 ? ((stats.success / stats.total) * 100).toFixed(1) : '0.0';
            console.log(`${type.padEnd(8)}| ${String(stats.total).padStart(4)} | ${pct.padStart(6)}% | ${String(stats.success).padStart(4)} | ${successRate.padStart(7)}% | ${stats.shots}`);
        }

        console.log('\n--- 442 推进方式统计 ---');
        console.log('推进方式 | 次数 | 占比 | 成功 | 成功率 | 射门');
        console.log('--------|------|------|------|--------|------');
        const atTotal2 = Object.values(awayAttackTypeStats).reduce((sum, s) => sum + s.total, 0);
        for (const [type, stats] of Object.entries(awayAttackTypeStats).sort((a, b) => b[1].total - a[1].total)) {
            const pct = atTotal2 > 0 ? ((stats.total / atTotal2) * 100).toFixed(1) : '0.0';
            const successRate = stats.total > 0 ? ((stats.success / stats.total) * 100).toFixed(1) : '0.0';
            console.log(`${type.padEnd(8)}| ${String(stats.total).padStart(4)} | ${pct.padStart(6)}% | ${String(stats.success).padStart(4)} | ${successRate.padStart(7)}% | ${stats.shots}`);
        }

        console.log('\n--- 4231 射门方式统计 ---');
        console.log('射门方式 | 次数 | 占比 | 进球 | 成功率');
        console.log('--------|------|------|------|--------');
        const stTotal = Object.values(homeShotTypeStats).reduce((sum, s) => sum + s.total, 0);
        for (const [type, stats] of Object.entries(homeShotTypeStats).sort((a, b) => b[1].total - a[1].total)) {
            const pct = stTotal > 0 ? ((stats.total / stTotal) * 100).toFixed(1) : '0.0';
            const goalRate = stats.total > 0 ? ((stats.goals / stats.total) * 100).toFixed(1) : '0.0';
            console.log(`${type.padEnd(8)}| ${String(stats.total).padStart(4)} | ${pct.padStart(6)}% | ${String(stats.goals).padStart(4)} | ${goalRate.padStart(7)}%`);
        }

        console.log('\n--- 442 射门方式统计 ---');
        console.log('射门方式 | 次数 | 占比 | 进球 | 成功率');
        console.log('--------|------|------|------|--------');
        const stTotal2 = Object.values(awayShotTypeStats).reduce((sum, s) => sum + s.total, 0);
        for (const [type, stats] of Object.entries(awayShotTypeStats).sort((a, b) => b[1].total - a[1].total)) {
            const pct = stTotal2 > 0 ? ((stats.total / stTotal2) * 100).toFixed(1) : '0.0';
            const goalRate = stats.total > 0 ? ((stats.goals / stats.total) * 100).toFixed(1) : '0.0';
            console.log(`${type.padEnd(8)}| ${String(stats.total).padStart(4)} | ${pct.padStart(6)}% | ${String(stats.goals).padStart(4)} | ${goalRate.padStart(7)}%`);
        }
    });

    it('4312 vs 532 matchup (500 matches)', () => {
        const runCrossMatch = (count: number) => {
            interface ShotStats { [key: string]: { total: number; goals: number }; }
            const shotStats: ShotStats = {
                ONE_ON_ONE: { total: 0, goals: 0 },
                HEADER: { total: 0, goals: 0 },
                REBOUND: { total: 0, goals: 0 },
                NORMAL: { total: 0, goals: 0 },
                LONG_SHOT: { total: 0, goals: 0 },
            };
            let homeGoals = 0, awayGoals = 0;
            let homeShots = 0, awayShots = 0;

            for (let i = 0; i < count; i++) {
                const home = createUniformTeam('Home', 12, '4-3-1-2');
                const away = createUniformTeam('Away', 12, '5-3-2');
                const engine = new MatchEngine(home, away);
                const events = engine.simulateMatch();

                for (const event of events) {
                    if (event.type === 'goal') {
                        if (event.teamName === 'Home') homeGoals++;
                        else awayGoals++;
                    }
                    if (event.type === 'shot' || event.type === 'goal' || event.type === 'save' || event.type === 'miss') {
                        const data = event.data as any;
                        const sequence = data?.sequence;
                        const shot = sequence?.shot;
                        if (shot && shot.shotType) {
                            const shotTypeName = shot.shotType as string;
                            if (shotStats[shotTypeName]) {
                                shotStats[shotTypeName].total++;
                                if (event.type === 'goal') shotStats[shotTypeName].goals++;
                            }
                        }
                        if (event.teamName === 'Home') homeShots++;
                        else awayShots++;
                    }
                }
            }
            return { shotStats, homeGoals, awayGoals, homeShots, awayShots };
        };

        const result = runCrossMatch(500);
        const totalGoals = result.homeGoals + result.awayGoals;

        console.log('\n========== 4312 vs 532 (500 matches) ==========');
        console.log(`Home (4-3-1-2): ${result.homeGoals} goals, ${result.homeShots} shots`);
        console.log(`Away (5-3-2): ${result.awayGoals} goals, ${result.awayShots} shots`);
        console.log(`Total: ${totalGoals} goals, avg ${(totalGoals/500).toFixed(2)} per match`);
        console.log('\nShot types:');
        for (const [type, data] of Object.entries(result.shotStats)) {
            const rate = data.total > 0 ? ((data.goals / data.total) * 100).toFixed(1) : 'N/A';
            console.log(`  ${type}: ${data.goals}/${data.total} (${rate}%)`);
        }

        expect(totalGoals).toBeGreaterThan(0);
    });
});
