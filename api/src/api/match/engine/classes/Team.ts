import { TacticalPlayer, Lane, Phase, TeamSnapshot } from '../types/simulation.types';
import { AttributeCalculator } from '../utils/attribute-calculator';
import { ConditionSystem } from '../systems/condition.system';
import { Player } from '../../../../types/player.types';

export class Team {
    private snapshot: TeamSnapshot | null = null;
    public playerEnergies: Map<string, number> = new Map();

    constructor(
        public name: string,
        public players: TacticalPlayer[]
    ) {
        // Initialize Energy to 100
        for (const p of players) {
            const pid = (p.player as Player).id;
            this.playerEnergies.set(pid, 100);
        }
    }

    /**
     * Updates player energy levels based on minutes played.
     * Also handles Half-Time and Extra-Time recovery.
     */
    updateCondition(minutesDelta: number, isHalfTime: boolean = false, isExtraTimeBreak: boolean = false) {
        for (const p of this.players) {
            const player = p.player as Player;
            const pid = player.id;
            let current = this.playerEnergies.get(pid) || 100;

            // Decay
            if (minutesDelta > 0) {
                const decay = ConditionSystem.calculateDecayRate(player.currentStamina);
                current -= decay * minutesDelta;
            }

            // Recovery
            if (isHalfTime) {
                current += ConditionSystem.calculateRecovery(player.currentStamina);
            } else if (isExtraTimeBreak) {
                // Recover 50% of HT amount for ET break
                current += ConditionSystem.calculateRecovery(player.currentStamina) * 0.5;
            }

            // Cap at 100
            if (current > 100) current = 100;
            // Floor at 0 (optional)
            if (current < 0) current = 0;

            this.playerEnergies.set(pid, current);
        }
    }

    /**
     * Generates a new snapshot of effective team strengths.
     * Applies Form, Experience, and Fatigue.
     */
    updateSnapshot(minute: number, scoreDiff: number) {
        const lanes: Lane[] = ['left', 'center', 'right'];
        const laneStrengths: TeamSnapshot['laneStrengths'] = {
            left: { attack: 0, defense: 0, possession: 0 },
            center: { attack: 0, defense: 0, possession: 0 },
            right: { attack: 0, defense: 0, possession: 0 }
        };

        for (const p of this.players) {
            const player = p.player as Player;
            const pid = player.id;
            const energy = this.playerEnergies.get(pid) || 100;

            // 1. Static Modifiers (Form)
            let attrs = ConditionSystem.applyForm(player.attributes, player.form);

            // 2. Context Modifiers (Experience)
            attrs = ConditionSystem.applyExperience(attrs, player.experience, minute, scoreDiff);

            // 3. Dynamic Modifiers (Fatigue)
            const fatigueFactor = ConditionSystem.getFatigueFactor(energy);

            // Calculate Base Contribution
            for (const lane of lanes) {
                // We calculate contribution using the MODIFIED attributes (except fatigue applied last)
                // AttributeCalculator.calculateContribution(player, key, lane, phase) uses player.attributes.
                // We need to inject our modified attributes? 
                // AttributeCalculator accepts a Player object with attributes.
                // We can creates a temp player proxy.
                const tempPlayer = { ...player, attributes: attrs };

                const att = AttributeCalculator.calculateContribution(tempPlayer, p.positionKey, lane, 'attack');
                const def = AttributeCalculator.calculateContribution(tempPlayer, p.positionKey, lane, 'defense');
                const poss = AttributeCalculator.calculateContribution(tempPlayer, p.positionKey, lane, 'possession');

                // Apply Fatigue to the final contribution
                laneStrengths[lane].attack += att * fatigueFactor;
                laneStrengths[lane].defense += def * fatigueFactor;
                laneStrengths[lane].possession += poss * fatigueFactor;
            }
        }

        // GK Rating (Update logic if GK affected)
        // GK usually less affected by fatigue in saving, but we can apply it.
        const gk = this.getGoalkeeper();
        let gkRating = 100;
        if (gk) {
            const player = gk.player as Player;
            const energy = this.playerEnergies.get(player.id) || 100;
            let attrs = ConditionSystem.applyForm(player.attributes, player.form);
            attrs = ConditionSystem.applyExperience(attrs, player.experience, minute, scoreDiff);
            const tempPlayer = { ...player, attributes: attrs };

            const rawRating = AttributeCalculator.calculateGKSaveRating(tempPlayer);
            const fatigue = ConditionSystem.getFatigueFactor(energy);
            gkRating = rawRating * fatigue;
        }

        this.snapshot = {
            laneStrengths,
            gkRating
        };
    }

    /**
     * Calculates the total team strength for a specific lane and phase.
     * Uses the cached snapshot for performance.
     */
    calculateLaneStrength(lane: Lane, phase: Phase): number {
        if (this.snapshot) {
            return parseFloat(this.snapshot.laneStrengths[lane][phase].toFixed(2));
        }

        // Fallback (or Error?) - For now fallback to non-fatigued static calculation
        // Or trigger snapshot update? Better to trigger update.
        // But we don't know Minute/ScoreDiff here. 
        // We assume updateSnapshot is called before consistent usage.
        return 0;
    }

    /**
     * Get the goalkeeper from the team.
     */
    getGoalkeeper(): TacticalPlayer | undefined {
        return this.players.find(p => p.positionKey === 'GK');
    }

    getSnapshot(): TeamSnapshot | null {
        return this.snapshot;
    }
}
