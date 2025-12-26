
export class ConditionSystem {
    // --- Status (Sigmoid) constants ---
    private static readonly S_MIN = 0.78;
    private static readonly S_RANGE = 0.34; // (1.12 - 0.78)
    private static readonly S_K = 1.5;
    private static readonly S_MID = 3.5;

    // --- Fitness (Exponential Decay) constants ---
    private static readonly F_R_FREE = 0.25;
    private static readonly F_LAMBDA = 1.00;

    // --- Experience (Exp) Hyperbolic Saturation constants ---
    private static readonly E_LIMIT_BONUS = 0.21;
    private static readonly E_GROWTH_K = 6.0;

    /**
     * Calculates the overall performance multiplier for a player.
     * @param currentFit Current fitness [1, 6)
     * @param startFit Starting fitness (Stamina attribute) [1, 6)
     * @param status Form/Status [1, 6)
     * @param exp Experience [0, Infinity)
     */
    static calculateMultiplier(currentFit: number, startFit: number, status: number, exp: number): number {
        // 1. Experience Factor (Hyperbolic)
        const expFactor = 1 + (this.E_LIMIT_BONUS * exp) / (exp + this.E_GROWTH_K);

        // 2. Status/Form Factor (Sigmoid)
        let statusFactor: number;
        const sDiff = status - this.S_MID;
        if (sDiff === 0) {
            statusFactor = 0.95; // Midpoint approximation
        } else {
            statusFactor = this.S_MIN + this.S_RANGE / (1 + Math.exp(-this.S_K * sDiff));
        }

        // 3. Fitness Factor (Exponential Decay)
        let fitnessFactor = 1.0;
        const consumed = startFit - currentFit;
        const buffer = startFit * this.F_R_FREE;

        if (consumed > buffer) {
            const overdraftRatio = (consumed - buffer) / startFit;
            fitnessFactor = Math.exp(-this.F_LAMBDA * overdraftRatio);
        }

        // 4. Combined Result
        const result = fitnessFactor * statusFactor * expFactor;

        return Math.round(result * 1000) / 1000;
    }

    /**
     * Calculates fitness loss per minute.
     * We aim for a natural decay where a typical match consumes a significant portion of the "tank".
     */
    static calculateFitnessDecay(minutes: number): number {
        // Base rate: approx 1.2 to 2.0 units per match depending on intensity.
        // Let's use a standard 0.018 per minute (~1.6 units per 90m).
        return minutes * 0.018;
    }

    /**
     * Recovery at half-time.
     */
    static calculateRecovery(stamina: number): number {
        // Recover 0.1 to 0.4 units based on stamina
        return 0.1 + (stamina / 6) * 0.3;
    }
}

