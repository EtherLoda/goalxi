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
 * the persisted `lineup` map (e.g. `CBL`, `CML`, `CFL`). These are the only
 * keys the backend `LineupValidator` and the frontend `PITCH_SLOTS` accept.
 *
 * For position-fit scoring we translate each slot key through
 * `SLOT_TO_FIT_POSITION` because `calculatePositionFit` understands the
 * short player-position codes (`CB`, `CM`, `ST`, …) and not the numbered
 * slot keys.
 *
 * ## Invariant: every formation must have exactly 10 outfield slots
 *
 * GoalXI plays 11-a-side: 1 GK + 10 outfield. Each formation below
 * lists exactly 10 outfield positions; the GK slot is added
 * unconditionally by `generateAutoLineup`. A previous version of
 * this file had 4-3-3 / 4-2-3-1 / 5-3-2 with 11 outfield positions
 * (an extra `LM` / `LW` / `CM` slipped in), which produced
 * 12-player lineups in matches where the BOT used one of those
 * formations — visibly wrong (you can't field 12 on an 11-a-side
 * pitch) and a regression the unit spec failed to catch because
 * it only validated slot-key shape, not count. The tripwire in
 * `auto-lineup.util.spec.ts` now asserts `positions.length === 10`
 * for every formation so the bug can't return.
 */
export const FORMATIONS = {
    '4-4-2': {
        // 4 def + 4 mid (wide) + 2 ST
        positions: ['LB', 'CBL', 'CB', 'RB', 'LM', 'CML', 'CM', 'RM', 'CFL', 'CFR'],
        label: '4-4-2',
    },
    '4-3-3': {
        // 4 def + 3 central mid + 3 fwd (LW/CF/RW).
        // The previous version had `LM` in the midfield, making it
        // 11 outfield and a 12-player lineup. Standard 4-3-3 is
        // 4-3-3 (def-mf-fwd), not 4-4-2 with a winger dropped in
        // front of CM.
        positions: ['LB', 'CBL', 'CB', 'RB', 'CML', 'CM', 'CMR', 'LW', 'CF', 'RW'],
        label: '4-3-3',
    },
    '4-2-3-1': {
        // 4 def + 2 DM (DMFL/DMF) + 3 AM (CAML/CAM/CAMR) + 1 ST.
        // The previous version had `LW` in the front three, making
        // 4-2-4 (5 attackers counting the ST) and 11 outfield.
        // Standard 4-2-3-1 is 4 def + 2 holding mid + 3 attacking
        // mid + 1 striker.
        positions: ['LB', 'CBL', 'CB', 'RB', 'DMFL', 'DMF', 'CAML', 'CAM', 'CAMR', 'CF'],
        label: '4-2-3-1',
    },
    '3-5-2': {
        // 3 def (CBL/CB/CBR) + 5 mid (wide LM/RM + central CML/CM/CMR) + 2 ST.
        // Width on the wings comes from the LM/RM, not from
        // wingbacks, so this one already had 10 outfield.
        positions: ['CBL', 'CB', 'CBR', 'LM', 'CML', 'CM', 'CMR', 'RM', 'CFL', 'CFR'],
        label: '3-5-2',
    },
    '5-3-2': {
        // 5 def (wingbacks LWB/RWB + central CBL/CB/CBR) + 3 central
        // mid (CML/CM/CMR) + 2 ST. The wingbacks carry the width,
        // so the 3 mids sit central — the previous version had
        // LM/CML/CM/RM (4 mids including wide ones), which
        // duplicated the 3-5-2's role and put 12 on the pitch.
        positions: ['LWB', 'CBL', 'CB', 'CBR', 'RWB', 'CML', 'CM', 'CMR', 'CFL', 'CFR'],
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
    CBL: 'CB',
    CB: 'CB',
    CBR: 'CB',
    LWB: 'LWB',
    RWB: 'RWB',
    DMFL: 'DM',
    DMF: 'DM',
    DMFR: 'DM',
    CML: 'CM',
    CM: 'CM',
    CMR: 'CM',
    CAML: 'AM',
    CAM: 'AM',
    CAMR: 'AM',
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
        lineup['GK'] = String(gk.id);
        assignedPlayers.add(String(gk.id));
    }

    // For each formation position, find best unassigned player
    for (const slotKey of formationConfig.positions) {
        const candidates = outfieldPlayers.filter((p) => !assignedPlayers.has(String(p.id)));
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

        lineup[slotKey] = String(bestPlayer.id);
        assignedPlayers.add(String(bestPlayer.id));
    }

    // Remaining players go to bench
    const bench = players
        .filter((p) => !assignedPlayers.has(String(p.id)))
        .map((p) => String(p.id));

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
