import { TacticalPlayer, Lane, Phase, TeamSnapshot } from '../types/simulation.types';
import { AttributeCalculator } from '../utils/attribute-calculator';
import { ConditionSystem } from '../systems/condition.system';
import { Player } from '../../types/player.types';

export class Team {
    private snapshot: TeamSnapshot | null = null;
    public playerFitness: Float32Array;
    private playerToIdx: Map<string, number> = new Map();

    constructor(
        public name: string,
        public players: TacticalPlayer[]
    ) {
        this.playerFitness = new Float32Array(players.length);
        // Initialize Fitness to starting Stamina
        for (let i = 0; i < players.length; i++) {
            const p = players[i];
            const player = p.player as Player;
            this.playerToIdx.set(player.id, i);
            this.playerFitness[i] = player.currentStamina;
            p.isOriginal = true;
        }
    }

    /**
     * Updates player fitness levels based on minutes played.
     */
    updateCondition(minutesDelta: number, isHalfTime: boolean = false) {
        for (let i = 0; i < this.players.length; i++) {
            const p = this.players[i];
            if (p.isSentOff) continue;

            const player = p.player as Player;
            let current = this.playerFitness[i];

            // Decay
            if (minutesDelta > 0) {
                current -= ConditionSystem.calculateFitnessDecay(minutesDelta);
            }

            // Recovery
            if (isHalfTime) {
                current += ConditionSystem.calculateRecovery(player.currentStamina);
            }

            // Cap at start stamina (or 6.0)
            if (current > 6.0) current = 6.0;
            // Floor at 1.0
            if (current < 1.0) current = 1.0;

            this.playerFitness[i] = current;
        }
    }

    /**
     * Generates a new snapshot of effective team strengths.
     */
    updateSnapshot() {
        const lanes: Lane[] = ['left', 'center', 'right'];
        const laneStrengths: TeamSnapshot['laneStrengths'] = {
            left: { attack: 0, defense: 0, possession: 0 },
            center: { attack: 0, defense: 0, possession: 0 },
            right: { attack: 0, defense: 0, possession: 0 }
        };

        for (let i = 0; i < this.players.length; i++) {
            const p = this.players[i];
            if (p.isSentOff) continue;

            const player = p.player as Player;
            const currentFit = this.playerFitness[i];

            // Calculate Performance Multiplier (The "PerformanceEngine" logic)
            const multiplier = ConditionSystem.calculateMultiplier(
                currentFit,
                player.currentStamina,
                player.form,
                player.experience
            );

            // Apply to all lane contributions
            for (const lane of lanes) {
                const att = AttributeCalculator.calculateContribution(player, p.positionKey, lane, 'attack');
                const def = AttributeCalculator.calculateContribution(player, p.positionKey, lane, 'defense');
                const poss = AttributeCalculator.calculateContribution(player, p.positionKey, lane, 'possession');

                laneStrengths[lane].attack += att * multiplier;
                laneStrengths[lane].defense += def * multiplier;
                laneStrengths[lane].possession += poss * multiplier;
            }
        }

        // GK Rating
        const gk = this.getGoalkeeper();
        let gkRating = 100;
        if (gk && !gk.isSentOff) {
            const player = gk.player as Player;
            const idx = this.playerToIdx.get(player.id)!;
            const currentFit = this.playerFitness[idx];
            const multiplier = ConditionSystem.calculateMultiplier(
                currentFit,
                player.currentStamina,
                player.form,
                player.experience
            );

            const rawRating = AttributeCalculator.calculateGKSaveRating(player);
            gkRating = rawRating * multiplier;
        }

        this.snapshot = {
            laneStrengths,
            gkRating
        };
    }

    /**
     * Marks a player as sent off.
     */
    sendOffPlayer(playerId: string) {
        const idx = this.playerToIdx.get(playerId);
        if (idx !== undefined) {
            const p = this.players[idx];
            p.isSentOff = true;
            this.playerFitness[idx] = 1.0; // Minimal fitness
        }
    }

    /**
     * Performs a substitution.
     */
    substitutePlayer(outId: string, inTacticalPlayer: TacticalPlayer) {
        const index = this.players.findIndex(p => (p.player as Player).id === outId);
        if (index !== -1) {
            const outPlayer = this.players[index];
            if (outPlayer.isSentOff) return; // Cannot sub out a sent off player

            // Add new player
            const newPlayer = inTacticalPlayer.player as Player;

            // Map index to new player
            this.playerToIdx.delete(outId);
            this.playerToIdx.set(newPlayer.id, index);

            this.playerFitness[index] = newPlayer.currentStamina || 3.0;
            inTacticalPlayer.isOriginal = false;
            inTacticalPlayer.isSentOff = false;

            this.players[index] = inTacticalPlayer;
        }
    }

    /**
     * Moves a player to a new position.
     */
    movePlayer(playerId: string, newPosition: string) {
        const p = this.players.find(p => (p.player as Player).id === playerId);
        if (p && !p.isSentOff) {
            p.positionKey = newPosition;
        }
    }

    /**
     * Checks if a position is currently occupied.
     */
    isPositionOccupied(positionKey: string): boolean {
        return this.players.some(p => p.positionKey === positionKey && !p.isSentOff);
    }

    calculateLaneStrength(lane: Lane, phase: Phase): number {
        if (this.snapshot) {
            return parseFloat(this.snapshot.laneStrengths[lane][phase].toFixed(2));
        }
        return 0;
    }

    getGoalkeeper(): TacticalPlayer | undefined {
        return this.players.find(p => p.positionKey === 'GK');
    }

    getSnapshot(): TeamSnapshot | null {
        return this.snapshot;
    }
}

