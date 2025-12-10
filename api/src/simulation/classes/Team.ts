import { TacticalPlayer, Lane, Phase } from '../types/simulation.types';
import { AttributeCalculator } from '../utils/attribute-calculator';

export class Team {
    constructor(
        public name: string,
        public players: TacticalPlayer[]
    ) { }

    /**
     * Calculates the total team strength for a specific lane and phase.
     * Iterates through all players and sums up their weighted contributions.
     */
    calculateLaneStrength(lane: Lane, phase: Phase): number {
        let total = 0;
        for (const tp of this.players) {
            total += AttributeCalculator.calculateContribution(
                tp.player,
                tp.positionKey,
                lane,
                phase
            );
        }
        return parseFloat(total.toFixed(2));
    }

    /**
     * Get the goalkeeper from the team.
     */
    getGoalkeeper(): TacticalPlayer | undefined {
        return this.players.find(p => p.positionKey === 'GK');
    }
}
