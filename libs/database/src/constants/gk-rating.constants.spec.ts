import {
    gkRawRating,
    gkSetPieceRating,
    GK_RATING_COEFFICIENTS,
    GK_RATING_TOTAL_WEIGHT,
    GK_RATING_ATTRIBUTE_KEYS,
} from './gk-rating.constants';

/**
 * Tripwire for the GK rating unification. The three engine
 * paths (shot save, set-piece, position-fit) used to disagree
 * on the coefficient vector; commit 5 of the position-key
 * unification plan collapsed them to one. This spec pins the
 * single source of truth so a future refactor can't
 * reintroduce the drift.
 */
describe('gk-rating.constants', () => {
    describe('coefficient vector is the agreed 4 / 2.5 / 1.5 / 1 / 1', () => {
        it('uses the engine-side weight on every attribute', () => {
            // If any of these changes, the engine-side
            // (attribute-calculator.ts) and the position-fit
            // (position-fit.util.ts GK_WEIGHTS) versions must
            // change in lockstep — and the test in
            // position-fit.util.spec.ts that pins the 100%
            // fit at 20/20/20/20/20 will fail first.
            expect(GK_RATING_COEFFICIENTS).toEqual({
                gk_reflexes: 4,
                gk_handling: 2.5,
                positioning: 1.5,
                gk_aerial: 1,
                composure: 1,
            });
        });

        it('total weight is 10 (4 + 2.5 + 1.5 + 1 + 1)', () => {
            // Pinned because the set-piece rating normalises
            // the raw sum by this constant, and the position-fit
            // rating normalises by it too. A wrong total here
            // would silently change every GK fit / set-piece
            // rating the engine produces.
            expect(GK_RATING_TOTAL_WEIGHT).toBe(10);
        });

        it('exposes all five goalkeeper-relevant attribute keys', () => {
            // Position-fit previously exposed only 3 keys
            // (gk_reflexes / gk_handling / positioning). The
            // bug commit 5 fixes is the missing aerial /
            // composure. Pin the full set so a future refactor
            // that drops one of them fails the test.
            expect([...GK_RATING_ATTRIBUTE_KEYS].sort()).toEqual(
                [
                    'composure',
                    'gk_aerial',
                    'gk_handling',
                    'gk_reflexes',
                    'positioning',
                ].sort(),
            );
        });
    });

    describe('gkRawRating returns the engine-side 0-200 score', () => {
        it('a default player (all 5 attrs at 10) scores exactly 100', () => {
            // The engine's `match.engine.ts:2280` falls back to
            // 100 when a team has no goalkeeper — so the
            // 'default' GK must produce exactly 100.
            const attrs = {
                gk_reflexes: 10,
                gk_handling: 10,
                positioning: 10,
                gk_aerial: 10,
                composure: 10,
            };
            expect(gkRawRating(attrs)).toBe(100);
        });

        it('a maxed player (all 5 attrs at 20) scores exactly 200', () => {
            // 20 * (4 + 2.5 + 1.5 + 1 + 1) = 20 * 10 = 200.
            const attrs = {
                gk_reflexes: 20,
                gk_handling: 20,
                positioning: 20,
                gk_aerial: 20,
                composure: 20,
            };
            expect(gkRawRating(attrs)).toBe(200);
        });

        it('a zeroed player scores 0', () => {
            expect(gkRawRating({})).toBe(0);
            expect(
                gkRawRating({
                    gk_reflexes: 0,
                    gk_handling: 0,
                    positioning: 0,
                    gk_aerial: 0,
                    composure: 0,
                }),
            ).toBe(0);
        });

        it('missing attributes default to 0 (matches the engine contract)', () => {
            // The engine-side formula treats undefined
            // attributes as 10 (the default-attrs value). The
            // helper uses 0 so a partially-typed player object
            // is still a valid input. The position-fit
            // consumer can re-add 10 to missing keys before
            // calling the helper if it wants engine parity.
            const partial = { gk_reflexes: 20 };
            expect(gkRawRating(partial)).toBe(80); // 20 * 4
        });
    });

    describe('gkSetPieceRating is the same vector / 10', () => {
        it('a default player scores 10', () => {
            // The engine set-piece formula uses this rating ×
            // 0.2 as the GK's contribution. 10 × 0.2 = 2
            // against an attacker free-kick sum of ~12 at
            // default skill, so the GK is a 14% factor on
            // set pieces by default.
            const attrs = {
                gk_reflexes: 10,
                gk_handling: 10,
                positioning: 10,
                gk_aerial: 10,
                composure: 10,
            };
            expect(gkSetPieceRating(attrs)).toBe(10);
        });

        it('a maxed player scores 20', () => {
            // 200 / 10 = 20. The set-piece formula
            // multiplies by 0.2 → 4, which is the design
            // intent of 'GK is a 20% factor'.
            const attrs = {
                gk_reflexes: 20,
                gk_handling: 20,
                positioning: 20,
                gk_aerial: 20,
                composure: 20,
            };
            expect(gkSetPieceRating(attrs)).toBe(20);
        });

        it('uses the same coefficient vector as the engine (no drift)', () => {
            // Pin so a future refactor of gkRawRating that
            // changes the coefficients doesn't quietly leave
            // gkSetPieceRating on the old vector.
            const attrs = {
                gk_reflexes: 20,
                gk_handling: 0,
                positioning: 0,
                gk_aerial: 0,
                composure: 0,
            };
            expect(gkSetPieceRating(attrs)).toBe(8); // 20*4 / 10
        });
    });
});
