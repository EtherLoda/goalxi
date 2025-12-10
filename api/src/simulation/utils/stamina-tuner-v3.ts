
/**
 * Stamina Tuner v3: Fixed Capacity, Variable Decay
 * 
 * Logic:
 * Everyone starts with 100 Energy.
 * Performance is 100% until Energy drops below THRESHOLD (e.g. 50).
 * Below Threshold, Performance drops linearly or exponentially.
 * 
 * Constraints:
 * T = Threshold (Let's try 50)
 * S1: Hits T at 15m.
 * S3: Hits T at 30m.
 * S5: Hits T at 90m.
 * 
 * Derived Decay (D):
 * D = (100 - T) / SafeMinutes
 */

const THRESHOLD = 50;
const CAPACITY = 100;

function calculateDecay(safeMinutes: number): number {
    return (CAPACITY - THRESHOLD) / safeMinutes;
}

// Decay Rates
// S1: 15m -> D = 50/15 = 3.33
// S3: 30m -> D = 50/30 = 1.66
// S5: 90m -> D = 50/90 = 0.55
// Ratio: 3.33 / 0.55 = 6x. Highly fit player is 6x more efficient.

// Recovery?
// S1 needs to be safe for 5m in 2nd half.
// Energy at 45m = 100 - 45 * 3.33 = -50 (Floored at 0).
// Recovery needs to get it to X, such that X - 5*3.33 >= 50.
// X >= 50 + 16.6 = 66.6.
// So S1 needs to recover 66.6 energy at HT? That's huge.
// If Threshold is lower (e.g. 30), math changes.

// Let's optimize Threshold and Recovery to find "Sensible" numbers.
// Sensible: Recovery is maybe 20-30% of max? Decay is 0.5 - 2.0?

function simulateScenario(threshold: number) {
    const targets = [
        { s: 1, t1: 15, t2: 5 },
        { s: 3, t1: 30, t2: 15 },
        { s: 5, t1: 90, t2: 45 } // S5 implies safe for 90m total? Or 90m continuously? "In 90m maintain".
        // Assuming S5 never drops below threshold in 90m.
    ];

    console.log(`\n--- Simulating Threshold ${threshold} ---`);

    // 1. Calculate required Decay for each Stamina
    const decays: Record<number, number> = {};
    targets.forEach(t => {
        decays[t.s] = (100 - threshold) / t.t1;
    });

    // 2. Calculate required Recovery
    // Rec = (Threshold + T2*Decay) - RemainingEnergyAt45
    const recoveries: Record<number, number> = {};
    targets.forEach(t => {
        const remaining = Math.max(0, 100 - 45 * decays[t.s]);
        const neededPostHT = threshold + t.t2 * decays[t.s];
        let rec = neededPostHT - remaining;
        // Cap recovery at maybe 50?
        recoveries[t.s] = rec;
    });

    // Print
    targets.forEach(t => {
        const d = decays[t.s];
        const r = recoveries[t.s];
        console.log(`S${t.s}: Decay ${d.toFixed(2)}/min. 45m Energy: ${Math.max(0, 100 - 45 * d).toFixed(1)}. ModRec need: ${r.toFixed(1)}. Total Rec Needed: ${r.toFixed(1)}`);
    });

    return { decays, recoveries };
}

// Try Threshold 30 (Lower threshold implies larger buffer)
// 100 -> 30 (70 buffer)
// S1: 70/15 = 4.66 decay. 45m -> 0. Rec Need: 30 + 5*4.66 = 53.
// S1 Recovery ~53 (50% of tank). High but maybe okay?

// Try Threshold 20
// 100 -> 20 (80 buffer)
// S1: 80/15 = 5.33. Rec Need: 20 + 5*5.33 = 46.
// S3: 80/30 = 2.66. Rem: 100 - 45*2.66 = -20(0). Rec Need: 20 + 15*2.66 = 60.

simulateScenario(30);

// Performance Curve Logic proposed:
// If E >= Threshold: 1.0
// If E < Threshold: 1.0 - ( (Threshold - E) * PenaltyFactor )
// OR: (E / Threshold) ^ K.
// User said "Consider drop curve".
// Let's implement a visualizer for the drop curve.

function dropCurve(energy: number, threshold: number) {
    if (energy >= threshold) return 1.0;
    // Linear drop to 0.5 at 0 energy?
    // or Curve.
    const ratio = energy / threshold;
    // Example: ratio 0.9 (27/30) -> should be small penalty?
    // 0.5 + 0.5 * ratio ? -> At 0 energy = 0.5 factor.
    return 0.5 + 0.5 * ratio;
}

console.log("\n--- Performance Drop Curve (Threshold 30) ---");
[35, 30, 25, 20, 15, 10, 5, 0].forEach(e => {
    console.log(`Energy ${e}: Factor ${dropCurve(e, 30).toFixed(2)}`);
});
