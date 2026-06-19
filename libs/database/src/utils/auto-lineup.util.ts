/**
 * Auto Lineup Generator
 * Generates optimal lineup from players using position-fit scoring
 */

import { PlayerEntity } from '../entities/player.entity';
import { calculatePositionFit, POSITION_KEYS } from './position-fit.util';
import { SimulationPlayerAttributes } from '../types/simulation-player';

export interface LineupResult {
    lineup: Record<string, string>; // positionKey -> playerId
    bench: string[]; // playerIds for bench
    formation: string;
}

/**
 * Standard formation templates.
 *
 * Each entry's `positions` is the **canonical slot-key list** that ends up in
 * the persisted `lineup` map (e.g. `CB1`, `CM1`, `CFL`). These are the only
 * keys the backend `LineupValidator` and the frontend `PITCH_SLOTS` accept.
 *
 * For position-fit scoring we translate each slot key through
 * `SLOT_TO_FIT_POSITION` because `calculatePositionFit` understands the
 * short player-position codes (`CB`, `CM`, `ST`, …) and not the numbered
 * slot keys.
 */
export const FORMATIONS = {
    '4-4-2': {
        positions: ['LB', 'CB1', 'CB2', 'RB', 'LM', 'CM1', 'CM2', 'RM', 'CFL', 'CFR'],
        label: '4-4-2',
    },
    '4-3-3': {
        positions: ['LB', 'CB1', 'CB2', 'RB', 'LM', 'CM1', 'CM2', 'RM', 'LW', 'CF', 'RW'],
        label: '4-3-3',
    },
    '4-2-3-1': {
        positions: ['LB', 'CB1', 'CB2', 'RB', 'DMF1', 'DMF2', 'LW', 'CAM1', 'CAM2', 'CAM3', 'CF'],
        label: '4-2-3-1',
    },
    '3-5-2': {
        positions: ['CB1', 'CB2', 'CB3', 'LM', 'CM1', 'CM2', 'CM3', 'RM', 'CFL', 'CFR'],
        label: '3-5-2',
    },
    '5-3-2': {
        positions: ['LWB', 'CB1', 'CB2', 'CB3', 'RWB', 'LM', 'CM1', 'CM2', 'RM', 'CFL', 'CFR'],
        label: '5-3-2',
    },
} as const;

export type FormationKey = keyof typeof FORMATIONS;

/**
 * Translate a canonical pitch slot key into the short position code that
 * `calculatePositionFit` understands. Used to score candidates during the
 * greedy lineup assignment.
 */
const SLOT_TO_FIT_POSITION: Readonly<Record<string, string>> = {
    CB1: 'CB',
    CB2: 'CB',
    CB3: 'CB',
    LWB: 'LWB',
    RWB: 'RWB',
    DMF1: 'DM',
    DMF2: 'DM',
    DMF3: 'DM',
    CM1: 'CM',
    CM2: 'CM',
    CM3: 'CM',
    CAM1: 'AM',
    CAM2: 'AM',
    CAM3: 'AM',
    LM: 'LM',
    RM: 'RM',
    LW: 'LW',
    RW: 'RW',
    CFL: 'CFL',
    CF: 'CF',
    CFR: 'CFR',
    // LB / RB / GK are 1:1 with their fit codes and left out for clarity.
};

/**
 * Convert PlayerEntity to SimulationPlayerAttributes for position fit calculation
 */
function playerToAttributes(player: PlayerEntity): SimulationPlayerAttributes {
    const skills = player.currentSkills ?? {};

    const get = (path: string[]): number => {
        let cur: any = skills;
        for (const key of path) {
            if (cur == null) return 0;
            cur = cur[key];
        }
        return typeof cur === 'number' ? cur : 0;
    };

    return {
        pace: get(['physical', 'pace']),
        strength: get(['physical', 'strength']),
        positioning: get(['mental', 'positioning']),
        composure: get(['mental', 'composure']),
        freeKicks: get(['setPieces', 'freeKicks']),
        penalties: get(['setPieces', 'penalties']),
        finishing: get(['technical', 'finishing']),
        passing: get(['technical', 'passing']),
        dribbling: get(['technical', 'dribbling']),
        defending: get(['technical', 'defending']),
        gk_reflexes: player.isGoalkeeper ? get(['technical', 'reflexes']) : undefined,
        gk_handling: player.isGoalkeeper ? get(['technical', 'handling']) : undefined,
        gk_aerial: player.isGoalkeeper ? get(['technical', 'aerial']) : undefined,
    };
}

/**
 * Generate auto lineup from team players
 * Uses greedy algorithm: assign best-fit player to each position
 */
export function generateAutoLineup(
    players: PlayerEntity[],
    formation: FormationKey = '4-4-2',
): LineupResult {
    const formationConfig = FORMATIONS[formation];
    const lineup: Record<string, string> = {};
    const assignedPlayers = new Set<string>();

    // Separate GKs and outfield players
    const goalkeepers = players.filter((p) => p.isGoalkeeper);
    const outfieldPlayers = players.filter((p) => !p.isGoalkeeper);

    // Assign GK first
    if (goalkeepers.length > 0) {
        const gk = goalkeepers.reduce((best, p) => {
            const attrs = playerToAttributes(p);
            const fit = calculatePositionFit(attrs, 'GK');
            const bestFit = best ? calculatePositionFit(playerToAttributes(best), 'GK') : -1;
            return fit > bestFit ? p : best;
        }, goalkeepers[0]);
        lineup['GK'] = gk.id;
        assignedPlayers.add(gk.id);
    }

    // For each formation position, find best unassigned player
    for (const slotKey of formationConfig.positions) {
        const candidates = outfieldPlayers.filter((p) => !assignedPlayers.has(p.id));
        if (candidates.length === 0) break;

        // Score each candidate by position fit (translate slot → fit code)
        const fitKey = SLOT_TO_FIT_POSITION[slotKey] ?? slotKey;
        let bestPlayer = candidates[0];
        let bestScore = calculatePositionFit(playerToAttributes(bestPlayer), fitKey);

        for (const candidate of candidates.slice(1)) {
            const score = calculatePositionFit(playerToAttributes(candidate), fitKey);
            if (score > bestScore) {
                bestScore = score;
                bestPlayer = candidate;
            }
        }

        lineup[slotKey] = bestPlayer.id;
        assignedPlayers.add(bestPlayer.id);
    }

    // Remaining players go to bench
    const bench = players
        .filter((p) => !assignedPlayers.has(p.id))
        .map((p) => p.id);

    return {
        lineup,
        bench,
        formation: formationConfig.label,
    };
}

/**
 * Generate lineup with substitutes (bench config style)
 * Returns substitutions array for the bench players
 */
export function generateLineupWithSubs(
    players: PlayerEntity[],
    formation: FormationKey = '4-4-2',
): {
    lineup: Record<string, string>;
    formation: string;
    substitutions: Array<{ minute: number; out: string; in: string }>;
} {
    const result = generateAutoLineup(players, formation);

    // Create substitution entries for bench players (minute 60)
    const substitutions = result.bench.slice(0, 3).map((playerId, idx) => ({
        minute: 60 + idx * 5,
        out: '', // Will be filled based on position
        in: playerId,
    }));

    // Map bench players to positions they'll substitute for
    // Use same positions as lineup for consistency
    const lineupPositions = Object.keys(result.lineup).filter(k => k !== 'GK');
    substitutions.forEach((sub, idx) => {
        if (substitutions[idx] && lineupPositions[idx]) {
            const originalPlayerId = result.lineup[lineupPositions[idx]];
            if (originalPlayerId) {
                sub.out = originalPlayerId;
            }
        }
    });

    return {
        lineup: result.lineup,
        formation: result.formation,
        substitutions: substitutions.filter(s => s.out && s.in),
    };
}
