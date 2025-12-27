import { POSITION_WEIGHTS, PositionWeightMatrix, GKWeightMatrix } from '../constants/position-weights';
import { Player, PlayerAttributes } from '../../types/player.types';
import { Lane, Phase } from '../types/simulation.types';

export class AttributeCalculator {
    /**
     * Calculates the contribution score for an outfield player in a specific lane and phase.
     */
    static calculateContribution(
        player: Player,
        positionKey: string, // e.g. "CF_L", must match keys in POSITION_WEIGHTS
        lane: Lane,
        phase: Phase
    ): number {
        const weights = POSITION_WEIGHTS[positionKey];

        // Validation
        if (!weights) {
            console.warn(`No weights found for position: ${positionKey}`);
            return 0;
        }

        if (positionKey === 'GK') {
            // GK does not contribute to lane battles
            return 0;
        }

        // Cast to Outfield Matrix
        const outfieldWeights = weights as PositionWeightMatrix;

        // Get weights for specific lane
        const laneWeights = outfieldWeights[lane];
        if (!laneWeights) {
            // Should not happen if matrix is complete, but safe fallback
            return 0;
        }

        // Get weights for specific phase (attack/possession/defense)
        const phaseWeights = laneWeights[phase];
        if (!phaseWeights) {
            return 0;
        }

        // Calculate weighted sum
        let totalScore = 0;
        // phaseWeights is Partial<PlayerAttributes>, keys are attribute names, values are weights
        for (const [attrName, weight] of Object.entries(phaseWeights)) {
            // Ensure weight is a number
            if (typeof weight !== 'number') continue;

            // Get player attribute value
            const attributeName = attrName as keyof PlayerAttributes;
            const attrValue = player.attributes[attributeName] || 0;

            totalScore += attrValue * weight;
        }

        return parseFloat(totalScore.toFixed(2));
    }

    /**
     * Calculates the Save Rating for a Goalkeeper.
     */
    static calculateGKSaveRating(player: Player): number {
        const weights = POSITION_WEIGHTS['GK'] as GKWeightMatrix;
        if (!weights) return 0;

        let totalScore = 0;
        const saveWeights = weights.saveRating;

        for (const [attrName, weight] of Object.entries(saveWeights)) {
            if (typeof weight !== 'number') continue;

            const attributeName = attrName as keyof PlayerAttributes;
            const attrValue = player.attributes[attributeName] || 0;

            totalScore += attrValue * weight;
        }

        return parseFloat(totalScore.toFixed(2));
    }
}
