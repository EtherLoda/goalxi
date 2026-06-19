/**
 * auto-lineup.util.spec.ts — smoke test that the auto-lineup generator emits
 * canonical pitch slot keys (`CB1`, `CM1`, `CFL`, …) rather than the
 * short player position codes (`CB`, `CM`, `ST`, …) the legacy generator
 * used to write. The short codes are not accepted by the backend
 * `LineupValidator` or the frontend `PITCH_SLOTS`, so this guards against
 * the original "Invalid position slot: CB/CM/ST" regression.
 */

import { FORMATIONS, generateAutoLineup, generateLineupWithSubs } from './auto-lineup.util';
import { PlayerEntity } from '../entities/player.entity';

const VALID_SLOTS = new Set([
    'GK',
    'CB1', 'CB2', 'CB3',
    'LB', 'RB', 'LWB', 'RWB',
    'DMF1', 'DMF2', 'DMF3',
    'CM1', 'CM2', 'CM3',
    'CAM1', 'CAM2', 'CAM3',
    'LM', 'RM',
    'LW', 'RW',
    'CFL', 'CF', 'CFR',
]);

function makePlayer(id: string, isGoalkeeper: boolean, position: string): PlayerEntity {
    return new PlayerEntity({
        id,
        isGoalkeeper,
        // The field name on PlayerEntity is `position` (string) and is what
        // the auto-lineup util reads via `position-fit.util`.
        position,
        currentSkills: {
            physical: { pace: 50, strength: 50 },
            technical: { finishing: 50, passing: 50, dribbling: 50, defending: 50 },
            mental: { positioning: 50, composure: 50 },
            setPieces: { freeKicks: 50, penalties: 50 },
        } as any,
    } as any);
}

function buildSquad(): PlayerEntity[] {
    const players: PlayerEntity[] = [];
    // 1 GK
    players.push(makePlayer('p-gk-1', true, 'GK'));
    // Outfielders — at least 11 of them with varied positions.
    const positions = ['CB', 'CB', 'CB', 'CB', 'LB', 'RB', 'CM', 'CM', 'CM', 'CM', 'CM', 'ST', 'ST', 'LW', 'RW', 'LM', 'RM'];
    positions.forEach((pos, i) => players.push(makePlayer(`p-out-${i}`, false, pos)));
    return players;
}

describe('auto-lineup.util — canonical slot keys', () => {
    it('FORMATIONS.positions contains only canonical slot keys', () => {
        for (const formation of Object.values(FORMATIONS)) {
            for (const slot of formation.positions) {
                expect(VALID_SLOTS.has(slot)).toBe(true);
            }
        }
    });

    it.each(Object.keys(FORMATIONS) as Array<keyof typeof FORMATIONS>)(
        'generateAutoLineup("%s") emits canonical slot keys',
        (formation) => {
            const result = generateAutoLineup(buildSquad(), formation);
            for (const slot of Object.keys(result.lineup)) {
                expect(VALID_SLOTS.has(slot)).toBe(true);
            }
        },
    );

    it('generateLineupWithSubs emits canonical slot keys', () => {
        const result = generateLineupWithSubs(buildSquad(), '4-4-2');
        for (const slot of Object.keys(result.lineup)) {
            expect(VALID_SLOTS.has(slot)).toBe(true);
        }
    });
});
