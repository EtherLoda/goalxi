/**
 * SpecialtyAttributionRecorder — RFC 0003 unit tests.
 *
 * Pure unit — no DB, no engine. Covers the recorder's contract:
 *   1. No-op when multiplier === 1.0
 *   2. No-op when player has no specialty
 *   3. Records all required fields
 *   4. Returns undefined when nothing fired
 *   5. Primary comes first in the snapshot
 *   6. attachTo mutates the event in place
 *
 * The contract is enforced by the engine caller (resolveShot /
 * resolveSave / resolveFoul / resolveInjury) — these tests pin
 * the recorder's behaviour so a future refactor can't silently
 * start dropping entries or reordering the array.
 */
import { SpecialtyAttributionRecorder } from './specialty.attribution';
import type { SpecialtyContribution } from '@goalxi/database';
import type { Player } from '../../types/player.types';

// Minimal Player shape — only fields the recorder actually reads.
function makePlayer(overrides: Partial<{
    id: number;
    coreSpecialty: string | null;
    coreSpecialtyTier: 'GOLD' | 'SILVER' | 'BRONZE';
}> = {}): Player {
    return {
        id: overrides.id ?? 1,
        attributes: {
            coreSpecialty: overrides.coreSpecialty ?? null,
            coreSpecialtyTier: overrides.coreSpecialtyTier ?? 'BRONZE',
        },
    } as unknown as Player;
}

describe('SpecialtyAttributionRecorder (RFC 0003)', () => {
    describe('record()', () => {
        it('is a no-op when multiplier === 1.0 (no effect)', () => {
            // This is the hot path: most leaf calls return 1.0
            // because most players either have no specialty or
            // their specialty doesn't apply to the hook. The
            // recorder must not allocate or push anything.
            const r = new SpecialtyAttributionRecorder();
            const p = makePlayer({ coreSpecialty: 'AERIAL_THREAT' });
            r.record(p, 'shot_header', 'shooter', true, 1.0);
            expect(r.snapshot()).toBeUndefined();
        });

        it('is a no-op when player has no specialty (50% case)', () => {
            // 50% of players have null coreSpecialty. The leaf
            // already short-circuits to 1.0 for them, but the
            // recorder is defensive in case a caller passes a
            // non-1.0 multiplier for some other reason.
            const r = new SpecialtyAttributionRecorder();
            const p = makePlayer({ coreSpecialty: null });
            r.record(p, 'shot_header', 'shooter', true, 1.143);
            expect(r.snapshot()).toBeUndefined();
        });

        it('records a Gold AERIAL_THREAT firing on shot_header', () => {
            const r = new SpecialtyAttributionRecorder();
            const p = makePlayer({
                id: 42,
                coreSpecialty: 'AERIAL_THREAT',
                coreSpecialtyTier: 'GOLD',
            });
            // 1.10 base, Gold tier 1.4 → 1.10^1.4 ≈ 1.143
            r.record(p, 'shot_header', 'shooter', true, 1.143);
            const snap = r.snapshot();
            expect(snap).toHaveLength(1);
            expect(snap![0]).toEqual({
                playerId: 42,
                specialtyCode: 'AERIAL_THREAT',
                tier: 'GOLD',
                effectKey: 'shot_header',
                multiplier: 1.143,
                role: 'shooter',
                isPrimary: true,
            });
        });

        it('records a Bronze player with the actual tier, not defaulting to Silver', () => {
            // The recorder must NOT default tier to SILVER — the
            // leaf's `tier ?? 'BRONZE'` is for the math, but the
            // attribution payload uses whatever the engine
            // actually saw. We pass it through verbatim.
            const r = new SpecialtyAttributionRecorder();
            const p = makePlayer({
                id: 7,
                coreSpecialty: 'SAVING_MASTER',
                coreSpecialtyTier: 'BRONZE',
            });
            r.record(p, 'gk_save', 'gk', true, 1.069);
            expect(r.snapshot()![0].tier).toBe('BRONZE');
        });

        it('keeps separate entries when the same player fires on multiple hooks', () => {
            // An AERIAL_THREAT shooter who also triggers the
            // one-on-one hook — both fire, both get a row. The
            // FE renders them cumulatively or picks one.
            const r = new SpecialtyAttributionRecorder();
            const p = makePlayer({ coreSpecialty: 'AERIAL_THREAT' });
            r.record(p, 'shot_header', 'shooter', true, 1.143);
            r.record(p, 'shot_one_on_one', 'shooter', false, 1.069);
            const snap = r.snapshot();
            expect(snap).toHaveLength(2);
            expect(snap!.map((c) => c.effectKey)).toEqual([
                'shot_header',
                'shot_one_on_one',
            ]);
        });

        it('keeps separate entries when multiple players fire on one event', () => {
            // AERIAL_THREAT shooter + SAVING_MASTER GK — common
            // case for a goal. Both records survive.
            const r = new SpecialtyAttributionRecorder();
            const shooter = makePlayer({ id: 1, coreSpecialty: 'AERIAL_THREAT' });
            const gk = makePlayer({ id: 2, coreSpecialty: 'SAVING_MASTER' });
            r.record(shooter, 'shot_header', 'shooter', true, 1.143);
            r.record(gk, 'gk_save', 'gk', false, 1.069);
            const snap = r.snapshot();
            expect(snap).toHaveLength(2);
            expect(snap!.map((c) => c.playerId).sort()).toEqual([1, 2]);
        });
    });

    describe('snapshot()', () => {
        it('returns undefined when nothing fired (the empty case)', () => {
            // Critical: `undefined` serializes to JSON-absent,
            // which is what the partial indexes' `WHERE NOT NULL`
            // filter expects. Returning `[]` instead would index
            // empty rows and waste space.
            const r = new SpecialtyAttributionRecorder();
            expect(r.snapshot()).toBeUndefined();
        });

        it('puts the primary entry first (D8 — FE reads index 0)', () => {
            // The FE shortcuts to events[0] for the headline
            // attribution. If the engine records non-primary
            // first, the FE would highlight the wrong player.
            const r = new SpecialtyAttributionRecorder();
            const shooter = makePlayer({ id: 1, coreSpecialty: 'AERIAL_THREAT' });
            const gk = makePlayer({ id: 2, coreSpecialty: 'SAVING_MASTER' });
            // Record non-primary first on purpose.
            r.record(gk, 'gk_save', 'gk', false, 1.069);
            r.record(shooter, 'shot_header', 'shooter', true, 1.143);
            const snap = r.snapshot();
            expect(snap![0].isPrimary).toBe(true);
            expect(snap![0].playerId).toBe(1);
            expect(snap![1].isPrimary).toBe(false);
            expect(snap![1].playerId).toBe(2);
        });
    });

    describe('attachTo()', () => {
        it('mutates the event in place when contributions exist', () => {
            const r = new SpecialtyAttributionRecorder();
            const p = makePlayer({ coreSpecialty: 'AERIAL_THREAT' });
            r.record(p, 'shot_header', 'shooter', true, 1.143);
            const event: { specialtyContributions?: SpecialtyContribution[] } = {};
            r.attachTo(event);
            expect(event.specialtyContributions).toHaveLength(1);
        });

        it('does not set the field when nothing fired (avoids `[]` allocation)', () => {
            const r = new SpecialtyAttributionRecorder();
            const event: { specialtyContributions?: SpecialtyContribution[] } = {};
            r.attachTo(event);
            expect(event).not.toHaveProperty('specialtyContributions');
        });
    });
});
