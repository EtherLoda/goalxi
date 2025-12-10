import { MatchEngine } from './classes/MatchEngine';
import { Team } from './classes/Team';
import { Player } from '../types/player.types';
import { TacticalPlayer } from './types/simulation.types';

// Mock Player Generator
function createMockPlayer(id: string, name: string, pos: string, attrVal: number): Player {
    return {
        id,
        name,
        position: pos,
        attributes: {
            // Physical
            pace: attrVal,
            strength: attrVal,
            // Technical
            finishing: attrVal,
            passing: attrVal,
            dribbling: attrVal,
            defending: attrVal,
            // Mental
            positioning: attrVal,
            composure: attrVal,
            // GK Specific (Optional)
            gk_reflexes: attrVal,
            gk_handling: attrVal,
            gk_distribution: attrVal
        }
    };
}


function createMockTeam(name: string, avgAttr: number): Team {
    const players: TacticalPlayer[] = [
        { player: createMockPlayer('1', 'GK', 'GK', avgAttr), positionKey: 'GK' },
        { player: createMockPlayer('2', 'LB', 'LB', avgAttr), positionKey: 'LB' },
        { player: createMockPlayer('3', 'CB', 'CB', avgAttr), positionKey: 'CBL' },
        { player: createMockPlayer('4', 'CB', 'CB', avgAttr), positionKey: 'CBR' },
        { player: createMockPlayer('5', 'RB', 'RB', avgAttr), positionKey: 'RB' },
        { player: createMockPlayer('6', 'DM', 'DM', avgAttr), positionKey: 'DM' },
        { player: createMockPlayer('7', 'CM', 'CM', avgAttr), positionKey: 'CML' },
        { player: createMockPlayer('8', 'CM', 'CM', avgAttr), positionKey: 'CMR' },
        { player: createMockPlayer('9', 'LW', 'LW', avgAttr), positionKey: 'LW' },
        { player: createMockPlayer('10', 'CF', 'CF', avgAttr), positionKey: 'CF' },
        { player: createMockPlayer('11', 'RW', 'RW', avgAttr), positionKey: 'RW' },
    ];
    return new Team(name, players);
}

// Elite Team (Avg 18) vs Weak Team (Avg 11)
const home = createMockTeam('Elite FC', 18);
const away = createMockTeam('Weak United', 11);

// Debug Calculation
console.log('--- TEAM POWER DEBUG ---');
console.log('Elite (18) Center POSS:', home.calculateLaneStrength('center', 'possession'));
console.log('Weak  (11) Center POSS:', away.calculateLaneStrength('center', 'possession'));
console.log('Elite (18) Center ATT:', home.calculateLaneStrength('center', 'attack'));
console.log('Weak  (11) Center DEF:', away.calculateLaneStrength('center', 'defense'));
console.log('------------------------');

const engine = new MatchEngine(home, away);

let totalHomeGoals = 0;
let totalAwayGoals = 0;
const results: { home: number, away: number }[] = [];
// Reverted to 1 run for standard usage
const RUNS = 1;

console.log(`Starting ${RUNS} Simulation Runs...`);

for (let i = 0; i < RUNS; i++) {
    const events = engine.simulateMatch();
    const h = events.filter(e => e.type === 'goal' && e.teamName === home.name).length;
    const a = events.filter(e => e.type === 'goal' && e.teamName === away.name).length;

    totalHomeGoals += h;
    totalAwayGoals += a;
    results.push({ home: h, away: a });
}

const avgHome = totalHomeGoals / RUNS;
const avgAway = totalAwayGoals / RUNS;

console.log('------------------------------------------------');
console.log(`SIMULATION RESULTS (${RUNS} Runs)`);
console.log(`Average Score: ${home.name} ${avgHome.toFixed(2)} - ${avgAway.toFixed(2)} ${away.name}`);
console.log('------------------------------------------------');
console.log('Sample Results (Last 5):');
for (let i = Math.max(0, RUNS - 5); i < RUNS; i++) {
    console.log(`Run ${i + 1}: ${results[i].home} - ${results[i].away}`);
}
