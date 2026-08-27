/**
 * auto-lineup.util.spec.ts — smoke test that the auto-lineup generator emits
 * canonical pitch slot keys (`CBL`, `CML`, `CFL`, …) rather than the
 * short player position codes (`CB`, `CM`, `ST`, …) the legacy generator
 * used to write. The short codes are not accepted by the backend
 * `LineupValidator` or the frontend `PITCH_SLOTS`, so this guards against
 * the original "Invalid position slot: CB/CM/ST" regression.
 */

import { FORMATIONS, generateAutoLineup, generateLineupWithSubs } from './auto-lineup.util';
import { PlayerEntity } from '../entities/player.entity';

const VALID_SLOTS = new Set([
    'GK',
    'CBL', 'CB', 'CBR',
    'LB', 'RB', 'LWB', 'RWB',
    'DMFL', 'DMF', 'DMFR',
    'CML', 'CM', 'CMR',
    'CAML', 'CAM', 'CAMR',
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

/**
 * 11-a-side invariant — every formation must have exactly 10
 * outfield positions so that generateAutoLineup fills 1 GK + 10
 * outfield = 11 players. A 2026-08-27 production incident
 * (match b5838466-...-28ef1634d002) surfaced that 3 of the 5
 * formations had 11 outfield positions (an extra `LM` / `LW` /
 * `CM` slipped into the 4-3-3 / 4-2-3-1 / 5-3-2 templates), so a
 * BOT using one of those formations was putting 12 players on
 * the pitch. The tripwire below pins the count + the exact
 * slot list so the bug can't return.
 */
describe('auto-lineup.util — 11-a-side invariant', () => {
    it('every FORMATIONS entry has exactly 10 outfield positions (1 GK is added by generateAutoLineup)', () => {
        for (const [name, formation] of Object.entries(FORMATIONS)) {
            expect(formation.positions).toHaveLength(10);
        }
    });

    it('4-3-3 is 4 def + 3 central mid + 3 fwd (NOT 4-4-2 with a winger in front of CM)', () => {
        // Pin the exact slot list so a future "let me add an LM
        // back" PR trips this test before it ships. The 3 mids
        // are the central CML/CM/CMR triplet — 4-3-3 is not
        // 4-4-2 with a winger promoted.
        expect(FORMATIONS['4-3-3'].positions).toEqual([
            'LB', 'CBL', 'CB', 'RB',
            'CML', 'CM', 'CMR',
            'LW', 'CF', 'RW',
        ]);
    });

    it('4-2-3-1 is 4 def + 2 DM + 3 AM + 1 ST (NOT 4-2-4 with an extra LW)', () => {
        expect(FORMATIONS['4-2-3-1'].positions).toEqual([
            'LB', 'CBL', 'CB', 'RB',
            'DMFL', 'DMF',
            'CAML', 'CAM', 'CAMR',
            'CF',
        ]);
    });

    it('5-3-2 is 5 def + 3 central mid + 2 ST (wingbacks carry width, mids are central)', () => {
        expect(FORMATIONS['5-3-2'].positions).toEqual([
            'LWB', 'CBL', 'CB', 'CBR', 'RWB',
            'CML', 'CM', 'CMR',
            'CFL', 'CFR',
        ]);
    });

    it('3-5-2 already had 10 outfield (5 mids because LM/RM carry the wings)', () => {
        // Sanity check — this one was always correct, but
        // pinning the slot list defends against a future
        // "let me tighten the mids" refactor that would
        // accidentally produce a 10-mid-and-9-def shape.
        expect(FORMATIONS['3-5-2'].positions).toEqual([
            'CBL', 'CB', 'CBR',
            'LM', 'CML', 'CM', 'CMR', 'RM',
            'CFL', 'CFR',
        ]);
    });

    it.each(Object.keys(FORMATIONS) as Array<keyof typeof FORMATIONS>)(
        'generateAutoLineup("%s") with a full squad returns 11 players (1 GK + 10 outfield)',
        (formation) => {
            // The squad has 1 GK + 17 outfielders, well above the
            // 11 needed. The lineup must be exactly 11; the rest
            // go to bench.
            const result = generateAutoLineup(buildSquad(), formation);
            expect(Object.keys(result.lineup)).toHaveLength(11);
            expect(result.lineup).toHaveProperty('GK');
            const outfieldSlots = Object.keys(result.lineup).filter((s) => s !== 'GK');
            expect(outfieldSlots).toHaveLength(10);
            // All 10 outfield slots must be distinct (no
            // double-assignment of the same slot to two players).
            expect(new Set(outfieldSlots).size).toBe(10);
        },
    );
});
