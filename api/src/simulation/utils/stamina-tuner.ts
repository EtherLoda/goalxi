
/**
 * Stamina Tuner v2: Fixed Decay, Variable Capacity
 * 
 * Model:
 * Decay Rate = 1.0 per minute (Fixed)
 * Capacity = f(Stamina)
 * Recovery = f(Stamina)
 * Threshold = 0 (Simplified, energy is effectively "minutes remaining")
 */

function calculateCapacity(s: number): number {
    // Polynomial fit for (1, 15), (3, 30), (5, 90)
    // Formula: 5.625*s^2 - 15*s + 24.375
    return 5.625 * s * s - 15 * s + 24.375;
}

function calculateRecovery(s: number): number {
    // Linear fit for (1, 5), (3, 15) -> (5, 25)
    return 5 * s;
}

function simulate(s: number): any {
    const decay = 1.0;
    const capacity = calculateCapacity(s);
    const recovery = calculateRecovery(s);

    let currentEnergy = capacity;
    let safe1 = 0;
    let safe2 = 0;
    let safeET = 0;

    // 1st Half (45m)
    for (let m = 1; m <= 45; m++) {
        currentEnergy -= decay;
        if (currentEnergy > 0) safe1++;
    }

    // Half Time
    currentEnergy += recovery;
    // Cap at initial capacity? Usually yes.
    if (currentEnergy > capacity) currentEnergy = capacity;

    // 2nd Half (45m)
    for (let m = 1; m <= 45; m++) {
        currentEnergy -= decay;
        if (currentEnergy > 0) safe2++;
    }

    // Extra Time (30m)
    for (let m = 1; m <= 30; m++) {
        currentEnergy -= decay;
        if (currentEnergy > 0) safeET++;
    }

    return {
        capacity: capacity.toFixed(1),
        recovery: recovery.toFixed(1),
        safe1,
        safe2,
        safeET,
        totalSafe: safe1 + safe2 + safeET
    };
}

console.log(JSON.stringify({
    model: "Fixed Decay (1.0/min)",
    results: [1, 3, 5].map(s => ({
        stamina: s,
        ...simulate(s)
    }))
}, null, 2));
