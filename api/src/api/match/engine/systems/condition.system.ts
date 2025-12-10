
import { Player, PlayerAttributes } from '../../../../types/player.types';

export class ConditionSystem {
    // ==========================================
    // FORM & EXPERIENCE (Static / Contextual)
    // ==========================================

    /**
     * Applies Pre-Match Form Factor to attributes.
     * Formula: Factor = 1 + ((Form - 5) * 0.02)
     */
    static applyForm(attributes: PlayerAttributes, form: number): PlayerAttributes {
        const factor = 1 + ((form - 5) * 0.02);

        // Deep copy and apply factor
        const newAttrs = { ...attributes };
        for (const key in newAttrs) {
            if (typeof newAttrs[key as keyof PlayerAttributes] === 'number') {
                (newAttrs as any)[key] *= factor;
            }
        }
        return newAttrs;
    }

    /**
     * Applies Late-Game Veteran Bonus.
     * If Minute > 75 and Score is close.
     */
    static applyExperience(attributes: PlayerAttributes, experience: number, minute: number, scoreDiff: number): PlayerAttributes {
        if (minute > 75 && Math.abs(scoreDiff) <= 1) {
            const bonus = experience / 10;
            const newAttrs = { ...attributes };
            newAttrs.composure += bonus;
            newAttrs.positioning += bonus;
            return newAttrs;
        }
        return attributes;
    }

    // ==========================================
    // STAMINA & ENERGY (Dynamic)
    // ==========================================

    private static readonly CAPACITY = 100;
    private static readonly THRESHOLD = 30;

    /**
     * Calculates Decay Rate (Energy lost per minute).
     * Formula: D = 70 / SafeMinutes(Stamina)
     * S5 -> Safe 90 -> D=0.77 (actually we tuned to 1.55 for Safe 45 per half? No, S5 Safe 90 means 90 continuous?)
     * Let's use the explicit tuned values from the plan.
     * S1 (4.66), S3 (2.33), S5 (1.55).
     * Linear interpolation for others.
     */
    static calculateDecayRate(stamina: number): number {
        // Linear Interpolation segments
        if (stamina <= 1) return 4.66;
        if (stamina >= 5) return 1.55;

        // Between 1 and 3
        if (stamina <= 3) {
            // Range [1, 3] -> Decay [4.66, 2.33]
            const ratio = (stamina - 1) / 2;
            return 4.66 - (ratio * (4.66 - 2.33));
        }

        // Between 3 and 5
        // Range [3, 5] -> Decay [2.33, 1.55]
        const ratio = (stamina - 3) / 2;
        return 2.33 - (ratio * (2.33 - 1.55));
    }

    /**
     * Calculates Half-Time Recovery.
     * S1 (53), S3 (65), S5 (70).
     */
    static calculateRecovery(stamina: number): number {
        if (stamina <= 1) return 53;
        if (stamina >= 5) return 70;

        if (stamina <= 3) {
            // Range [1, 3] -> Rec [53, 65]
            const ratio = (stamina - 1) / 2;
            return 53 + (ratio * (65 - 53));
        }

        // Range [3, 5] -> Rec [65, 70]
        const ratio = (stamina - 3) / 2;
        return 65 + (ratio * (70 - 65));
    }

    /**
     * Calculates performance factor based on current energy.
     * Energy > 30: 1.0
     * Energy < 30: Drop curve.
     */
    static getFatigueFactor(currentEnergy: number): number {
        if (currentEnergy >= this.THRESHOLD) return 1.0;

        // Curve: 0.5 + 0.5 * (Energy / 30)
        // At 30: 1.0
        // At 0: 0.5
        const ratio = currentEnergy / this.THRESHOLD;
        return 0.5 + (0.5 * ratio);
    }
}
