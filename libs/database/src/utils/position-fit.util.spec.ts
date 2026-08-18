import {
    calculatePositionFit,
    getPositionFitReport,
    getBestPosition,
    POSITION_KEYS,
    POSITION_LABELS,
} from './position-fit.util';
import { SimulationPlayerAttributes } from '../types/simulation-player';

describe('PositionFitUtil', () => {
    describe('calculatePositionFit', () => {
        it('should return 100 for a perfect player at any position', () => {
            const perfectAttrs: SimulationPlayerAttributes = {
                pace: 20, strength: 20, positioning: 20, composure: 20,
                freeKicks: 20, penalties: 20, finishing: 20, passing: 20,
                dribbling: 20, defending: 20,
                gk_reflexes: 20, gk_handling: 20,
                // gk_aerial and gk_composure (the latter maps to
                // the `composure` key in the engine) are part of
                // the GK_WEIGHTS coefficient vector now (commit 5
                // of the position-key unification plan). A
                // "perfect" GK has them maxed too.
                gk_aerial: 20,
            };
            // A perfect player should get ~100 at their natural position
            expect(calculatePositionFit(perfectAttrs, 'LW')).toBe(100);
            expect(calculatePositionFit(perfectAttrs, 'CM')).toBe(100);
            expect(calculatePositionFit(perfectAttrs, 'CB')).toBe(100);
            expect(calculatePositionFit(perfectAttrs, 'GK')).toBe(100);
        });

        it('should return 0 for an empty player at any position', () => {
            const emptyAttrs: SimulationPlayerAttributes = {
                pace: 0, strength: 0, positioning: 0, composure: 0,
                freeKicks: 0, penalties: 0, finishing: 0, passing: 0,
                dribbling: 0, defending: 0, gk_reflexes: 0, gk_handling: 0,
            };
            expect(calculatePositionFit(emptyAttrs, 'LW')).toBe(0);
            expect(calculatePositionFit(emptyAttrs, 'GK')).toBe(0);
        });

        it('should rate pace+dribble winger high at LW/RW, lower at CB', () => {
            const wingerAttrs: SimulationPlayerAttributes = {
                pace: 20, strength: 5, positioning: 5, composure: 5,
                freeKicks: 5, penalties: 5, finishing: 5, passing: 10,
                dribbling: 20, defending: 2, gk_reflexes: 0, gk_handling: 0,
            };
            const lwFit = calculatePositionFit(wingerAttrs, 'LW');
            const cbFit = calculatePositionFit(wingerAttrs, 'CB');
            expect(lwFit).toBeGreaterThan(cbFit);
            expect(lwFit).toBeGreaterThan(50);
        });

        it('should rate defending specialist high at CB, lower at LW', () => {
            const defenderAttrs: SimulationPlayerAttributes = {
                pace: 5, strength: 20, positioning: 15, composure: 10,
                freeKicks: 2, penalties: 2, finishing: 2, passing: 10,
                dribbling: 5, defending: 20, gk_reflexes: 0, gk_handling: 0,
            };
            const cbFit = calculatePositionFit(defenderAttrs, 'CB');
            const lwFit = calculatePositionFit(defenderAttrs, 'LW');
            expect(cbFit).toBeGreaterThan(lwFit);
            expect(cbFit).toBeGreaterThan(50);
        });

        it('should return 0 for unknown position key', () => {
            const attrs: SimulationPlayerAttributes = {
                pace: 10, strength: 10, positioning: 10, composure: 10,
                freeKicks: 10, penalties: 10, finishing: 10, passing: 10,
                dribbling: 10, defending: 10, gk_reflexes: 0, gk_handling: 0,
            };
            expect(calculatePositionFit(attrs, 'UNKNOWN_POS')).toBe(0);
        });

        // Numbered slot keys the editor uses (CBL/CB/CBR etc.) must
        // resolve to their own weight table directly. Pre-fix the
        // AM/AML/AMR and DM/DML/DMR keys were hidden behind alias
        // entries (CAM/CAML/CAMR and CDM/DMF/DMFL/DMFR) that the
        // engine normalizer had to fold on every lookup; commit 2
        // of the position-key unification plan renamed the family
        // to the shorter keys and dropped the aliases. The normalizer
        // still maps the old names to the new ones at the engine
        // boundary (see `simulator/.../SLOT_KEY_NORMALIZER`), so
        // legacy data keeps working.
        it('should map 3-slot slot keys to their family weight table', () => {
            const attrs: SimulationPlayerAttributes = {
                pace: 10, strength: 10, positioning: 10, composure: 10,
                freeKicks: 10, penalties: 10, finishing: 10, passing: 10,
                dribbling: 10, defending: 10, gk_reflexes: 0, gk_handling: 0,
            };
            const cbFit = calculatePositionFit(attrs, 'CB');
            for (const slot of ['CBL', 'CB', 'CBR']) {
                expect(calculatePositionFit(attrs, slot)).toBe(cbFit);
            }
            const cmFit = calculatePositionFit(attrs, 'CM');
            for (const slot of ['CML', 'CM', 'CMR']) {
                expect(calculatePositionFit(attrs, slot)).toBe(cmFit);
            }
            // AM family — centre / left / right each have their own
            // weight table. 100 fit on perfectly-balanced attributes.
            const amFit = calculatePositionFit(attrs, 'AM');
            const amlFit = calculatePositionFit(attrs, 'AML');
            const amrFit = calculatePositionFit(attrs, 'AMR');
            expect(amFit).toBeGreaterThan(0);
            expect(amlFit).toBeGreaterThan(0);
            expect(amrFit).toBeGreaterThan(0);
            // The three family keys must all return a positive fit
            // (sanity: they're listed in POSITION_LABELS and have
            // weight tables wired up in POSITION_WEIGHTS).
            expect(POSITION_KEYS).toEqual(expect.arrayContaining(['AM', 'AML', 'AMR']));
            // DM family — same structure as AM.
            const dmFit = calculatePositionFit(attrs, 'DM');
            const dmlFit = calculatePositionFit(attrs, 'DML');
            const dmrFit = calculatePositionFit(attrs, 'DMR');
            expect(dmFit).toBeGreaterThan(0);
            expect(dmlFit).toBeGreaterThan(0);
            expect(dmrFit).toBeGreaterThan(0);
            expect(POSITION_KEYS).toEqual(expect.arrayContaining(['DM', 'DML', 'DMR']));
            // The match engine keys too — LW/RW/CF + numbered variants.
            const lwFit = calculatePositionFit(attrs, 'LW');
            for (const slot of ['LW1', 'LW2']) {
                expect(calculatePositionFit(attrs, slot)).toBe(lwFit);
            }
        });

        it('should handle GK with gk_reflexes and gk_handling', () => {
            const gkAttrs: SimulationPlayerAttributes = {
                pace: 5, strength: 5, positioning: 10, composure: 10,
                freeKicks: 0, penalties: 0, finishing: 0, passing: 5,
                dribbling: 0, defending: 0, gk_reflexes: 20, gk_handling: 20,
            };
            const gkFit = calculatePositionFit(gkAttrs, 'GK');
            const lwFit = calculatePositionFit(gkAttrs, 'LW');
            expect(gkFit).toBeGreaterThan(lwFit);
        });
    });

    describe('getPositionFitReport', () => {
        it('should return all positions sorted by fit descending', () => {
            const attrs: SimulationPlayerAttributes = {
                pace: 20, strength: 5, positioning: 5, composure: 5,
                freeKicks: 5, penalties: 5, finishing: 5, passing: 10,
                dribbling: 20, defending: 2, gk_reflexes: 0, gk_handling: 0,
            };
            const report = getPositionFitReport(attrs);
            expect(report.length).toBe(POSITION_KEYS.length);
            // Verify descending order
            for (let i = 1; i < report.length; i++) {
                expect(report[i - 1].fit).toBeGreaterThanOrEqual(report[i].fit);
            }
            // Best position should be LW or RW (winger)
            expect(['LW', 'RW']).toContain(report[0].position);
        });

        it('should include position labels', () => {
            const attrs: SimulationPlayerAttributes = {
                pace: 10, strength: 10, positioning: 10, composure: 10,
                freeKicks: 10, penalties: 10, finishing: 10, passing: 10,
                dribbling: 10, defending: 10, gk_reflexes: 0, gk_handling: 0,
            };
            const report = getPositionFitReport(attrs);
            for (const item of report) {
                expect(POSITION_LABELS[item.position]).toBe(item.label);
            }
        });
    });

    describe('getBestPosition', () => {
        it('should return the highest-fit position', () => {
            const wingerAttrs: SimulationPlayerAttributes = {
                pace: 20, strength: 5, positioning: 5, composure: 5,
                freeKicks: 5, penalties: 5, finishing: 5, passing: 10,
                dribbling: 20, defending: 2, gk_reflexes: 0, gk_handling: 0,
            };
            const best = getBestPosition(wingerAttrs);
            expect(['LW', 'RW']).toContain(best.position);
        });
    });

    describe('POSITION_KEYS', () => {
        it('should contain all key positions', () => {
            const keyPositions = ['GK', 'CF', 'LW', 'RW', 'AM', 'CM', 'DM', 'LB', 'RB', 'CB'];
            for (const pos of keyPositions) {
                expect(POSITION_KEYS).toContain(pos);
            }
        });
    });
});
