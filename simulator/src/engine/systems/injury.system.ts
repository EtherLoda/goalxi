export type InjuryType = 'muscle' | 'ligament' | 'joint' | 'head' | 'other';
export type InjurySeverity = 'mild' | 'moderate' | 'severe';

export interface InjuryResult {
    willInjure: boolean;
    injuryType: InjuryType | null;
    severity: InjurySeverity | null;
    injuryValue: number | null;
    estimatedMinDays: number | null;
    estimatedMaxDays: number | null;
}

export interface InjuryEventData {
    playerId: string;
    injuryType: InjuryType;
    severity: InjurySeverity;
    injuryValue: number;
    estimatedRecoveryDays: { min: number; max: number };
    treatmentTime: number; // seconds on pitch
}

export class InjurySystem {
    // Base injury probability per match (0.5%)
    private static readonly BASE_INJURY_CHANCE = 0.005;

    // Injury value ranges by type and severity
    private static readonly INJURY_VALUES: Record<InjuryType, Record<InjurySeverity, [number, number]>> = {
        muscle: { mild: [20, 40], moderate: [50, 80], severe: [100, 150] },
        ligament: { mild: [30, 50], moderate: [60, 100], severe: [120, 180] },
        joint: { mild: [25, 45], moderate: [55, 90], severe: [110, 160] },
        head: { mild: [35, 55], moderate: [70, 110], severe: [130, 190] },
        other: { mild: [20, 40], moderate: [50, 80], severe: [100, 150] },
    };

    // Treatment time on pitch (seconds)
    private static readonly TREATMENT_TIME: Record<InjurySeverity, number> = {
        mild: 30,    // 30 seconds
        moderate: 90, // 90 seconds (1.5 min)
        severe: 180, // 180 seconds (3 min)
    };

    /**
     * Calculate if a player will get injured based on various factors.
     *
     * @param baseChance - Base probability (already calculated from action type)
     * @param playerAge - Player's age
     * @param playerStamina - Player's stamina level [1-6]
     * @param isHomeMatch - Whether the match is at home
     * @param doctorLevel - Team doctor level (0 = no doctor)
     */
    static calculateInjuryChance(
        baseChance: number,
        playerAge: number,
        playerStamina: number,
        isHomeMatch: boolean = true,
        doctorLevel: number = 0
    ): number {
        let chance = baseChance;

        // Age multiplier
        const ageMultiplier = playerAge >= 34 ? 1.5
            : playerAge >= 31 ? 1.2
            : playerAge >= 25 ? 1.0
            : 0.8; // 18-24
        chance *= ageMultiplier;

        // Stamina multiplier (low stamina = higher injury risk)
        const staminaMultiplier = playerStamina <= 2 ? 1.5
            : playerStamina <= 3 ? 1.2
            : playerStamina <= 4 ? 1.0
            : 0.8;
        chance *= staminaMultiplier;

        // Home advantage slightly reduces injury risk
        if (isHomeMatch) {
            chance *= 0.9;
        }

        // Team doctor reduces injury chance by 10% per level
        if (doctorLevel > 0) {
            chance *= (1 - 0.1 * doctorLevel);
        }

        return chance;
    }

    /**
     * Determine injury type based on the action that caused it.
     */
    static determineInjuryType(actionType: 'tackle' | 'sprint' | 'jump' | 'collision' | 'other'): InjuryType {
        const typeMap: Record<string, InjuryType> = {
            tackle: 'muscle',
            sprint: 'muscle',
            jump: 'joint',
            collision: 'head',
            other: 'other',
        };
        return typeMap[actionType];
    }

    /**
     * Determine injury severity based on random chance.
     */
    static determineSeverity(): InjurySeverity {
        const roll = Math.random();
        if (roll < 0.6) return 'mild'; // 60% mild
        if (roll < 0.9) return 'moderate'; // 30% moderate
        return 'severe'; // 10% severe
    }

    /**
     * Generate injury result for an action that could cause injury.
     */
    static generateInjury(
        actionType: 'tackle' | 'sprint' | 'jump' | 'collision' | 'other',
        playerAge: number,
        playerStamina: number,
        isHomeMatch: boolean = true,
        doctorLevel: number = 0
    ): InjuryResult {
        // Base chance varies by action type
        const actionChance: Record<string, number> = {
            tackle: 0.02,   // 2% chance on tackle
            sprint: 0.015,  // 1.5% chance on sprint
            jump: 0.01,     // 1% chance on jump
            collision: 0.03, // 3% chance on collision
            other: 0.005,   // 0.5% chance on other actions
        };

        const chance = this.calculateInjuryChance(
            actionChance[actionType],
            playerAge,
            playerStamina,
            isHomeMatch,
            doctorLevel
        );

        if (Math.random() > chance) {
            return {
                willInjure: false,
                injuryType: null,
                severity: null,
                injuryValue: null,
                estimatedMinDays: null,
                estimatedMaxDays: null,
            };
        }

        const injuryType = this.determineInjuryType(actionType);
        const severity = this.determineSeverity();
        const [minValue, maxValue] = this.INJURY_VALUES[injuryType][severity];
        const injuryValue = Math.floor(Math.random() * (maxValue - minValue + 1)) + minValue;

        // Calculate estimated recovery days
        // Range comes from daily random fluctuation, not age
        const recoveryRange = this.calculateRecoveryRange(injuryValue);

        return {
            willInjure: true,
            injuryType,
            severity,
            injuryValue,
            estimatedMinDays: recoveryRange.min,
            estimatedMaxDays: recoveryRange.max,
        };
    }

    /**
     * Get treatment time for an injury.
     */
    static getTreatmentTime(severity: InjurySeverity): number {
        return this.TREATMENT_TIME[severity];
    }

    /**
     * Calculate daily recovery value based on player age using sigmoid function.
     * Age affects the sigmoid parameters (recovery speed).
     * Recovery range comes from daily random fluctuation.
     *
     * @param playerAge - Player's age (18-40)
     * @returns Daily recovery value (typically 3-12)
     */
    static calculateDailyRecovery(playerAge: number): number {
        // Sigmoid parameters tuned for age-based recovery
        // Younger players recover faster, older players recover slower
        // Sigmoid: base + amplitude / (1 + exp(-k * (age - midpoint)))
        const midpoint = 28;      // Age where recovery is average
        const k = 0.25;           // Steepness of the curve
        const base = 3;           // Minimum recovery (older players)
        const amplitude = 9;      // Range of recovery variation

        // Calculate sigmoid value
        // Negative exponent to make younger players recover faster
        const sigmoid = base + amplitude / (1 + Math.exp(k * (playerAge - midpoint)));

        // Add random fluctuation (±15%) for daily variation
        // This creates the recovery range, not age
        const fluctuation = 0.85 + Math.random() * 0.3;

        const recovery = sigmoid * fluctuation;
        return Math.round(recovery * 10) / 10;
    }

    /**
     * Get the expected recovery range for a given injury value.
     * Range comes from daily random fluctuation, not age.
     *
     * @param injuryValue - Current injury value
     * @returns { minDays, maxDays } - Estimated recovery range
     */
    static calculateRecoveryRange(injuryValue: number): { min: number; max: number } {
        // Base recovery range (without age factor for estimation)
        const minDailyRecovery = 3 * 0.85;  // Min fluctuation
        const maxDailyRecovery = 12 * 1.15; // Max fluctuation

        const minDays = Math.ceil(injuryValue / maxDailyRecovery);
        const maxDays = Math.ceil(injuryValue / minDailyRecovery);

        return { min: Math.max(1, minDays), max: Math.max(1, maxDays) };
    }
}
