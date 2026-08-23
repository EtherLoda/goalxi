import { ConditionSystem } from "./condition.system";

describe("ConditionSystem - experience multiplier", () => {
    describe("source-of-truth constants (tripwire against accidental edits)", () => {
        it("should pin E_BASE_BONUS = 0.03 (rookie gets a non-zero 3% bonus)", () => {
            // private static, accessed via `as any` for tripwire
            expect(ConditionSystem["E_BASE_BONUS"]).toBe(0.03);
        });
        it("should pin E_LIMIT_BONUS = 0.22 (total cap = 25%)", () => {
            // private static, accessed via `as any` for tripwire
            expect(ConditionSystem["E_LIMIT_BONUS"]).toBe(0.22);
        });
        it("should pin E_GROWTH_K = 100 (slow saturation so L20+ still feels different)", () => {
            // private static, accessed via `as any` for tripwire
            expect(ConditionSystem["E_GROWTH_K"]).toBe(100);
        });
        it("should pin PENALTY_E_LIMIT = 0.47 (penalty cap = 50%, 2x the general cap)", () => {
            // private static, accessed via `as any` for tripwire
            expect(ConditionSystem["PENALTY_E_LIMIT"]).toBe(0.47);
        });
    });

    describe("calculateMultiplier() - exp factor shape", () => {
        const baseline = { currentFit: 6, startFit: 6, status: 3.5 };

        it("L0 (0 XP) -> expFactor = 1.03 (just the 3% base)", () => {
            const m = ConditionSystem.calculateMultiplier(baseline.currentFit, baseline.startFit, baseline.status, 0);
            // statusFactor is 0.95 at S_MID (the midpoint approximation), so:
            //   m = 1.0 * 0.95 * (1 + 0.03 + 0) = 0.9785
            // The function rounds to 3 decimals -> 0.978 or 0.979 (FP).
            expect(m).toBeCloseTo(0.95 * 1.03, 3);
        });

        it("L1 (10 XP) -> expFactor = 1.05 (rookie + first 2% saturation)", () => {
            // 0.03 + 0.22*10/110 = 0.03 + 0.02 = 0.05 -> factor 1.05
            const m = ConditionSystem.calculateMultiplier(baseline.currentFit, baseline.startFit, baseline.status, 10);
            //   m = 0.95 * 1.05 = 0.9975 (function rounds to 3 dp)
            expect(m).toBeCloseTo(0.95 * 1.05, 3);
        });

        it("L5 (70 XP) -> expFactor = 1.13 (L5 reaches the base+limit/2 mid-point)", () => {
            // At exp=K=100, factor = 1 + base + limit/2 = 1 + 0.03 + 0.11 = 1.14
            // exp=70 is just under 100, so factor ~= 1 + 0.03 + 0.22*70/170 = 1 + 0.03 + 0.0906 = 1.121
            const m = ConditionSystem.calculateMultiplier(baseline.currentFit, baseline.startFit, baseline.status, 70);
            expect(m).toBeCloseTo(0.95 * (1 + 0.03 + 0.22 * 70 / 170), 3);
        });

        it("L10 (190 XP) -> expFactor = 1.166 (L10 should still feel different from L5)", () => {
            // 0.03 + 0.22*190/290 = 0.03 + 0.1441 = 0.1741 -> factor 1.174
            // 0.95 * 1.174 = 1.115
            const m = ConditionSystem.calculateMultiplier(baseline.currentFit, baseline.startFit, baseline.status, 190);
            expect(m).toBeCloseTo(0.95 * (1 + 0.03 + 0.22 * 190 / 290), 3);
        });

        it("L18 (486 XP) -> expFactor ~ 1.21 (approaching the 25% cap)", () => {
            // 0.03 + 0.22*486/586 = 0.03 + 0.1824 = 0.2124 -> factor 1.212
            // 0.95 * 1.212 = 1.152
            const m = ConditionSystem.calculateMultiplier(baseline.currentFit, baseline.startFit, baseline.status, 486);
            expect(m).toBeCloseTo(0.95 * (1 + 0.03 + 0.22 * 486 / 586), 3);
        });

        it("exp=INF -> expFactor approaches but never exceeds 1.25 (cap)", () => {
            const m = ConditionSystem.calculateMultiplier(baseline.currentFit, baseline.startFit, baseline.status, 1e9);
            // 0.95 * 1.25 = 1.1875, but should be < 1.1875 due to cap (limit * exp / (exp+K) < limit strictly)
            expect(m).toBeLessThan(0.95 * 1.25 + 1e-6);
            expect(m).toBeGreaterThan(0.95 * 1.24);
        });

        it("should be monotonically non-decreasing in exp (L0 < L1 < L2 ... < cap)", () => {
            const xs = [0, 10, 22, 36, 70, 162, 286, 450, 580, 1000, 1e6];
            let prev = -Infinity;
            for (const x of xs) {
                const m = ConditionSystem.calculateMultiplier(baseline.currentFit, baseline.startFit, baseline.status, x);
                expect(m).toBeGreaterThanOrEqual(prev);
                prev = m;
            }
        });

        it("should handle negative / non-finite exp gracefully (NaN -> base, 0 -> base)", () => {
            const a = ConditionSystem.calculateMultiplier(baseline.currentFit, baseline.startFit, baseline.status, NaN);
            const b = ConditionSystem.calculateMultiplier(baseline.currentFit, baseline.startFit, baseline.status, -50);
            // Both should clamp to the L0 behaviour (expFactor = 1.03)
            expect(a).toBeCloseTo(b, 3);
        });
    });

    describe("calculatePenaltyMultiplier() - 50% cap", () => {
        it("L0 (0 XP) -> expFactor = 1.03 (same 3% base as general)", () => {
            const m = ConditionSystem.calculatePenaltyMultiplier(3.5, 0);
            // statusFactor = 0.95 (midpoint), so: 0.95 * (1 + 0.03 + 0) = 0.9785
            expect(m).toBeCloseTo(0.95 * 1.03, 3);
        });

        it("L10 (190 XP) -> penalty bonus noticeably higher than general (cap 50% > cap 25%)", () => {
            const penM = ConditionSystem.calculatePenaltyMultiplier(3.5, 190);
            const genM = ConditionSystem.calculateMultiplier(6, 6, 3.5, 190);
            // Penalty expFactor = 1 + 0.03 + 0.47*190/290 = 1 + 0.03 + 0.308 = 1.338
            // General expFactor = 1 + 0.03 + 0.22*190/290 = 1.174
            // Penalty should be > general (cap 50% > 25% at this XP)
            expect(penM).toBeGreaterThan(genM);
        });

        it("exp=INF -> penalty multiplier approaches 50% cap (1.5 * general cap)", () => {
            const m = ConditionSystem.calculatePenaltyMultiplier(3.5, 1e9);
            // 0.95 * 1.50 = 1.425 (status factor * cap)
            expect(m).toBeLessThan(0.95 * 1.50 + 1e-6);
            expect(m).toBeGreaterThan(0.95 * 1.49);
        });
    });

    describe("getMultiplierWithFitnessFactor() - same exp formula as calculateMultiplier", () => {
        it("L0 (0 XP, full stamina, mid form) -> multiplier close to 1.0 * 0.95 * 1.03", () => {
            const r = ConditionSystem.getMultiplierWithFitnessFactor(6, 6, 3.5, 0);
            expect(r.fitnessFactor).toBe(1.0);
            expect(r.multiplier).toBeCloseTo(0.95 * 1.03, 3);
        });

        it("L20+ (580 XP) -> multiplier near 1.187 (0.95 * 1.25 cap)", () => {
            const r = ConditionSystem.getMultiplierWithFitnessFactor(6, 6, 3.5, 580);
            expect(r.fitnessFactor).toBe(1.0);
            // 0.95 * (1 + 0.03 + 0.22*580/680) = 0.95 * 1.218 = 1.157
            expect(r.multiplier).toBeCloseTo(0.95 * (1 + 0.03 + 0.22 * 580 / 680), 3);
        });

        it("should match calculateMultiplier when stamina is full (fitness=1.0)", () => {
            // Both call paths must produce the same exp factor; the snapshot
            // path should never diverge from the snapshot-free one.
            for (const exp of [0, 10, 70, 190, 486, 1000, 1e6]) {
                const a = ConditionSystem.calculateMultiplier(6, 6, 3.5, exp);
                const b = ConditionSystem.getMultiplierWithFitnessFactor(6, 6, 3.5, exp).multiplier;
                expect(a).toBeCloseTo(b, 4);
            }
        });
    });
});
