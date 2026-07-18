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
                dribbling: 20, defending: 20, gk_reflexes: 20, gk_handling: 20,
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

        // Numbered slot keys the editor uses (CB1/CB2/CB3 etc.) must
        // resolve to the same weight table as their family key
        // (CB / CM / CAM / DM). Pre-fix these all returned 0 because
        // POSITION_WEIGHTS only had the un-numbered keys.
        it('should map numbered slot keys to the family weight table', () => {
            const attrs: SimulationPlayerAttributes = {
                pace: 10, strength: 10, positioning: 10, composure: 10,
                freeKicks: 10, penalties: 10, finishing: 10, passing: 10,
                dribbling: 10, defending: 10, gk_reflexes: 0, gk_handling: 0,
            };
            const cbFit = calculatePositionFit(attrs, 'CB');
            for (const slot of ['CB1', 'CB2', 'CB3', 'CD1', 'CD2', 'CD3']) {
                expect(calculatePositionFit(attrs, slot)).toBe(cbFit);
            }
            const cmFit = calculatePositionFit(attrs, 'CM');
            for (const slot of ['CM1', 'CM2', 'CM3']) {
                expect(calculatePositionFit(attrs, slot)).toBe(cmFit);
            }
            const camFit = calculatePositionFit(attrs, 'CAM');
            for (const slot of ['CAM1', 'CAM2', 'CAM3']) {
                expect(calculatePositionFit(attrs, slot)).toBe(camFit);
            }
            const dmFit = calculatePositionFit(attrs, 'DM');
            for (const slot of ['DM1', 'DM2', 'DM3', 'DMF1', 'DMF2', 'DMF3']) {
                expect(calculatePositionFit(attrs, slot)).toBe(dmFit);
            }
            // The match engine keys too — LW/RW/CF/CDM/CAM (already
            // covered above) + the rarer side variants.
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
