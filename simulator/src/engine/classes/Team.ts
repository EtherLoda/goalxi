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
            this.playerFitness[i] = player.currentStamina || 3.0;
            p.entryMinute = 0;
            // 不在这里预缓存，让updateSnapshot时按需缓存
        }
    }

    /**
     * Get player energy by player ID
     */
    getPlayerEnergy(playerId: string): number | undefined {
        const idx = this.playerToIdx.get(playerId);
        return idx !== undefined ? this.playerFitness[idx] : undefined;
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
     * 使用缓存的贡献值，只需应用multiplier
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

            // Calculate Performance Multiplier
            const multiplier = ConditionSystem.calculateMultiplier(
                currentFit,
                player.currentStamina,
                player.form,
                player.experience
            );

            // 使用calculateAndCacheContribution，自动缓存
            for (const lane of lanes) {
                const att = AttributeCalculator.calculateAndCacheContribution(player, p.positionKey, lane, 'attack');
                const def = AttributeCalculator.calculateAndCacheContribution(player, p.positionKey, lane, 'defense');
                const poss = AttributeCalculator.calculateAndCacheContribution(player, p.positionKey, lane, 'possession');

                laneStrengths[lane].attack += att * multiplier;
                laneStrengths[lane].defense += def * multiplier;
                laneStrengths[lane].possession += poss * multiplier;
            }
        }

        // Round all lane strengths
        const roundedLaneStrengths: TeamSnapshot['laneStrengths'] = {
            left: {
                attack: parseFloat(laneStrengths.left.attack.toFixed(2)),
                defense: parseFloat(laneStrengths.left.defense.toFixed(2)),
                possession: parseFloat(laneStrengths.left.possession.toFixed(2))
            },
            center: {
                attack: parseFloat(laneStrengths.center.attack.toFixed(2)),
                defense: parseFloat(laneStrengths.center.defense.toFixed(2)),
                possession: parseFloat(laneStrengths.center.possession.toFixed(2))
            },
            right: {
                attack: parseFloat(laneStrengths.right.attack.toFixed(2)),
                defense: parseFloat(laneStrengths.right.defense.toFixed(2)),
                possession: parseFloat(laneStrengths.right.possession.toFixed(2))
            }
        };

        // GK Rating - 使用缓存
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

            const rawRating = AttributeCalculator.calculateAndCacheGKSaveRating(player);
            gkRating = parseFloat((rawRating * multiplier).toFixed(2));
        }

        this.snapshot = {
            laneStrengths: roundedLaneStrengths,
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
            inTacticalPlayer.entryMinute = 0; // Default, expected to be set by caller
            inTacticalPlayer.isSentOff = false;
            inTacticalPlayer.yellowCards = 0; // Reset yellow cards for new player
            this.players[index] = inTacticalPlayer;

            // 预缓存新球员的贡献值
            AttributeCalculator.preCachePlayerContributions(newPlayer, inTacticalPlayer.positionKey);
        }
    }

    /**
     * Moves a player to a new position.
     */
    movePlayer(playerId: string, newPosition: string) {
        const p = this.players.find(p => (p.player as Player).id === playerId);
        if (p && !p.isSentOff) {
            p.positionKey = newPosition;
            // 重新缓存新位置的所有贡献值
            AttributeCalculator.preCachePlayerContributions(p.player as Player, newPosition);
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

    /**
     * Get average freeKicks skill of the team (excluding sent off players)
     */
    getAvgFreeKicks(): number {
        const players = this.players.filter(p => !p.isSentOff && !p.positionKey.includes('GK'));
        if (players.length === 0) return 10;

        let total = 0;
        let count = 0;
        for (const p of players) {
            const player = p.player as Player;
            const freeKicks = player.attributes.freeKicks ?? 10;
            total += freeKicks;
            count++;
        }
        return count > 0 ? total / count : 10;
    }

    /**
     * Get average penalties skill of the team (excluding sent off players)
     */
    getAvgPenalties(): number {
        const players = this.players.filter(p => !p.isSentOff && !p.positionKey.includes('GK'));
        if (players.length === 0) return 10;

        let total = 0;
        let count = 0;
        for (const p of players) {
            const player = p.player as Player;
            const penalties = player.attributes.penalties ?? 10;
            total += penalties;
            count++;
        }
        return count > 0 ? total / count : 10;
    }

    /**
     * Get the best set-piece taker for a specific type
     */
    getBestSetPieceTaker(type: 'corner' | 'free_kick' | 'penalty'): TacticalPlayer | undefined {
        const candidates = this.players.filter(p => !p.isSentOff && !p.positionKey.includes('GK'));
        if (candidates.length === 0) return undefined;

        let bestPlayer = candidates[0];
        let bestScore = -Infinity;

        for (const p of candidates) {
            const player = p.player as Player;

            let score = 0;
            if (type === 'penalty') {
                score = (player.attributes.penalties ?? 10) * 2;
            } else {
                score = (player.attributes.freeKicks ?? 10) * 2;
            }

            // AM/CM position bonus
            if (p.positionKey.includes('AM') || p.positionKey.includes('CM')) {
                score *= 1.3;
            }

            if (score > bestScore) {
                bestScore = score;
                bestPlayer = p;
            }
        }

        return bestPlayer;
    }

    /**
     * Get goalkeeper's set-piece defense rating
     */
    getGoalkeeperSetPieceRating(): number {
        const gk = this.getGoalkeeper();
        if (!gk) return 10;

        const player = gk.player as Player;
        const attrs = player.attributes;
        return (
            (attrs.gk_reflexes ?? 10) +
            (attrs.gk_handling ?? 10) +
            (attrs.composure ?? 10)
        ) / 3;
    }
}
