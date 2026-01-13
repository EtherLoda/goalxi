/**
 * Set Piece System Test
 * Simulates 1000 matches to verify set piece trigger rates and goals
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { MatchEngine } = require('./dist/src/engine/match.engine');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Team } = require('./dist/src/engine/classes/Team');

// Create a player with given skills
function createPlayer(id, name, freeKicks = 10, penalties = 10, finishing = 10, composure = 10, gk_reflexes = 10, gk_handling = 10) {
    const isGoalkeeper = name.includes('Goalkeeper');
    return {
        player: {
            id,
            name,
            position: isGoalkeeper ? 'GK' : 'CF',
            attributes: {
                pace: 10,
                strength: 10,
                finishing,
                passing: 10,
                dribbling: 10,
                defending: 10,
                positioning: 10,
                composure,
                freeKicks,
                penalties,
                gk_reflexes: isGoalkeeper ? gk_reflexes : 0,
                gk_handling: isGoalkeeper ? gk_handling : 0,
                gk_distribution: isGoalkeeper ? 10 : 0
            },
            currentStamina: 3,
            form: 3,
            experience: 0,
            exactAge: [25, 0]
        },
        positionKey: isGoalkeeper ? 'GK' : 'CF',
        isSentOff: false,
        yellowCards: 0,
        entryMinute: 0
    };
}

// Create a team with average skills (level playing field)
function createTeam(teamName, avgFreeKicks = 10, avgPenalties = 10) {
    const players = [];

    // Goalkeeper
    players.push(createPlayer(`${teamName}-GK`, `${teamName} Goalkeeper`, 10, 10, 5, 10, 10, 10));

    // Outfield players with slight variation around average
    for (let i = 1; i <= 10; i++) {
        const fk = Math.max(1, Math.min(20, avgFreeKicks + (Math.random() * 4 - 2)));
        const pen = Math.max(1, Math.min(20, avgPenalties + (Math.random() * 4 - 2)));
        const fin = 10 + (Math.random() * 4 - 2);
        const comp = 10 + (Math.random() * 4 - 2);
        players.push(createPlayer(`${teamName}-P${i}`, `${teamName} Player ${i}`, fk, pen, fin, comp));
    }

    return new Team(teamName, players);
}

async function runTest(numMatches = 1000) {
    console.log(`Running ${numMatches} matches test...\n`);

    let totalGoals = 0;
    let totalSetPieceGoals = 0;
    let corners = 0;
    let cornerGoals = 0;
    let indirectFreeKicks = 0;
    let indirectFreeKickGoals = 0;
    let directFreeKicks = 0;
    let directFreeKickGoals = 0;
    let penalties = 0;
    let penaltyGoals = 0;

    for (let i = 0; i < numMatches; i++) {
        // Create two equal teams
        const homeTeam = createTeam(`Home${i}`, 10, 10);
        const awayTeam = createTeam(`Away${i}`, 10, 10);

        const engine = new MatchEngine(homeTeam, awayTeam);
        const events = engine.simulateMatch();

        // Debug: Check indirect free kick events
        if (indirectFreeKicks > 0 && i < 10) {
            events.filter(e => e.type === 'free_kick').forEach(e => {
                console.log(`  Indirect FK: result=${e.data?.result}, prob=${e.data?.probability?.toFixed(2)}`);
            });
        }

        // Count events
        for (const event of events) {
            const eventType = event.type;
            const setPieceType = event.data?.setPieceType;
            const result = event.data?.result;

            // Count all goals
            if (eventType === 'goal') {
                totalGoals++;
                if (setPieceType) {
                    totalSetPieceGoals++;
                }
            }

            // Count set piece events by setPieceType, not eventType
            if (setPieceType === 'corner') {
                corners++;
                if (eventType === 'goal') cornerGoals++;
            } else if (setPieceType === 'indirect_free_kick') {
                indirectFreeKicks++;
                if (eventType === 'goal') indirectFreeKickGoals++;
            } else if (setPieceType === 'direct_free_kick') {
                directFreeKicks++;
                if (eventType === 'goal') directFreeKickGoals++;
            } else if (setPieceType === 'penalty') {
                penalties++;
                if (eventType === 'goal') penaltyGoals++;
            }
        }

        if ((i + 1) % 200 === 0) {
            console.log(`Completed ${i + 1} matches...`);
        }
    }

    // Calculate rates
    const cornerGoalRate = corners > 0 ? cornerGoals / corners : 0;
    const indirectGoalRate = indirectFreeKicks > 0 ? indirectFreeKickGoals / indirectFreeKicks : 0;
    const directGoalRate = directFreeKicks > 0 ? directFreeKickGoals / directFreeKicks : 0;
    const penaltyGoalRate = penalties > 0 ? penaltyGoals / penalties : 0;

    // Print results
    console.log('\n' + '='.repeat(60));
    console.log('SET PIECE SYSTEM TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`Matches: ${numMatches}`);
    console.log(`Total Goals: ${totalGoals}`);
    console.log(`Avg Goals per Match: ${(totalGoals / numMatches).toFixed(2)}`);
    console.log('');

    console.log('CORNER KICKS:');
    console.log(`  Triggers: ${corners} (avg ${(corners / numMatches).toFixed(2)} per match)`);
    console.log(`  Goals: ${cornerGoals}`);
    console.log(`  Goal Rate: ${(cornerGoalRate * 100).toFixed(1)}%`);
    console.log(`  Expected: ~1.75 triggers/match, ~18% goal rate`);
    console.log('');

    console.log('INDIRECT FREE KICKS:');
    console.log(`  Triggers: ${indirectFreeKicks} (avg ${(indirectFreeKicks / numMatches).toFixed(2)} per match)`);
    console.log(`  Goals: ${indirectFreeKickGoals}`);
    console.log(`  Goal Rate: ${(indirectGoalRate * 100).toFixed(1)}%`);
    console.log(`  Expected: ~0.4 triggers/match, ~18% goal rate`);
    console.log('');

    console.log('DIRECT FREE KICKS:');
    console.log(`  Triggers: ${directFreeKicks} (avg ${(directFreeKicks / numMatches).toFixed(2)} per match)`);
    console.log(`  Goals: ${directFreeKickGoals}`);
    console.log(`  Goal Rate: ${(directGoalRate * 100).toFixed(1)}%`);
    console.log(`  Expected: ~0.75 triggers/match, ~15% goal rate`);
    console.log('');

    console.log('PENALTIES:');
    console.log(`  Triggers: ${penalties} (avg ${(penalties / numMatches).toFixed(3)} per match)`);
    console.log(`  Goals: ${penaltyGoals}`);
    console.log(`  Goal Rate: ${(penaltyGoalRate * 100).toFixed(1)}%`);
    console.log(`  Expected: ~0.2 triggers/match, ~72% goal rate`);
    console.log('');

    console.log('TOTAL SET PIECE GOALS:');
    console.log(`  Goals: ${totalSetPieceGoals}`);
    console.log(`  Percentage of Total: ${totalGoals > 0 ? ((totalSetPieceGoals / totalGoals) * 100).toFixed(1) : 0}%`);
    console.log(`  Expected: ~0.67 goals/match (~15% of total)`);
    console.log('');

    console.log('='.repeat(60));
    console.log('ANALYSIS:');
    console.log('='.repeat(60));

    // Check if results are within expected range
    const cornerRate = (corners / numMatches) / 2; // Normalize to per-team
    const directFKRate = (directFreeKicks / numMatches) / 2;
    const penaltyRate = (penalties / numMatches) / 2;

    console.log(`Corner triggers per team: ${cornerRate.toFixed(2)} (expected ~0.9)`);
    console.log(`Direct FK triggers per team: ${directFKRate.toFixed(2)} (expected ~0.4)`);
    console.log(`Penalty triggers per team: ${penaltyRate.toFixed(3)} (expected ~0.1)`);
    console.log('');

    if (Math.abs(cornerRate - 0.9) < 0.25) {
        console.log('✓ Corner triggers: WITHIN EXPECTED RANGE');
    } else {
        console.log(`✗ Corner triggers: OUT OF RANGE (got ${cornerRate.toFixed(2)}, expected ~0.9)`);
    }

    if (Math.abs(directFKRate - 0.4) < 0.12) {
        console.log('✓ Direct FK triggers: WITHIN EXPECTED RANGE');
    } else {
        console.log(`✗ Direct FK triggers: OUT OF RANGE (got ${directFKRate.toFixed(2)}, expected ~0.4)`);
    }

    if (Math.abs(penaltyRate - 0.1) < 0.04) {
        console.log('✓ Penalty triggers: WITHIN EXPECTED RANGE');
    } else {
        console.log(`✗ Penalty triggers: OUT OF RANGE (got ${penaltyRate.toFixed(3)}, expected ~0.1)`);
    }
}

// Run the test
runTest(1000).catch(console.error);
