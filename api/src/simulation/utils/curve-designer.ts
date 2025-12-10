
/**
 * Curve Designer for Experience and Status
 * Run with: npx ts-node api/src/simulation/utils/curve-designer.ts
 */

function calculateExperienceBonus(exp: number): number {
    // Target: Exp 1 = ~4%, Exp 10 = ~15%, Exp 20 = ~22%
    // Formula: y = 0.04 * (x ^ 0.57) works best
    // x=1 => 0.04
    // x=10 => 0.04 * 3.71 = 0.148 (14.8%)
    // x=20 => 0.04 * 5.51 = 0.220 (22.0%)
    const POWER = 0.57;
    const BASE = 0.04;
    return BASE * Math.pow(exp, POWER);
}

function calculateStatusFactor(status: number): number {
    // Target: Status 1 = 0.5, Status 5 = 1.0
    // Range: [0.5, 1.0] -> Delta 0.5
    // Normalized Status (0 to 1): (status - 1) / 4
    // Formula: 0.5 + 0.5 * (normalized ^ K)
    // If K=1 (Linear), Status 3 = 0.75
    // If K=0.8 (Root-ish), Status 3 = 0.5 + 0.5 * (0.5^0.8) = 0.5 + 0.5 * 0.57 = 0.78 (Slightly higher)
    // If K=1.2 (Convex), Status 3 = 0.5 + 0.5 * (0.5^1.2) = 0.5 + 0.5 * 0.43 = 0.71 (Punishing avg)

    // User asked for a curve. Let's try K=0.8 for a slightly generous curve (good players perform consistent)
    // OR K=1.2 for a "you need to be high status" feel.
    // Let's demo K=0.75 (Generous) and K=1.5 (Strict)

    // Selecting K=0.85 for "Realism" - Avg status (3) gives ~77% performance.
    const K = 0.85;
    const normalized = (status - 1) / 4;
    return 0.5 + (0.5 * Math.pow(normalized, K));
}

console.log("\n=== EXPERIENCE CURVE (Target: 1->4%, 10->15%, 20->22%) ===");
const expPoints = [1, 2, 5, 10, 15, 20, 30, 50, 100];
console.log("Exp\tBonus %");
expPoints.forEach(e => {
    const bonus = calculateExperienceBonus(e);
    console.log(`${e}\t${(bonus * 100).toFixed(2)}%`);
});

console.log("\n=== STATUS CURVE (Target: 1->50%, 5->100%) ===");
const statusPoints = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
console.log("Status\tFactor\t(Linear Ref)");
statusPoints.forEach(s => {
    const factor = calculateStatusFactor(s);
    const linear = 0.5 + 0.5 * ((s - 1) / 4);
    console.log(`${s}\t${(factor * 100).toFixed(1)}%\t${(linear * 100).toFixed(1)}%`);
});
