import { Team } from './classes/Team';
import { Lane, TacticalPlayer, TacticalInstruction, ScoreStatus } from './types/simulation.types';
import { AttributeCalculator } from './utils/attribute-calculator';
import { Player } from '../../../types/player.types';

export interface MatchEvent {
    minute: number;
    type: 'goal' | 'miss' | 'save' | 'turnover' | 'advance' | 'snapshot' | 'shot' | 'corner' | 'foul' | 'yellow_card' | 'red_card' | 'offside' | 'substitution' | 'injury' | 'penalty_goal' | 'penalty_miss' | 'kickoff' | 'full_time' | 'tactical_change';
    description: string;
    teamName?: string;
    teamId?: string;
    playerId?: string;
    data?: any;
}

export class MatchEngine {
    private time: number = 0;
    private events: MatchEvent[] = [];
    private homeScore: number = 0;
    private awayScore: number = 0;

    private possessionTeam: Team;
    private defendingTeam: Team;

    private currentLane: Lane = 'center';

    constructor(
        public homeTeam: Team,
        public awayTeam: Team,
        private homeInstructions: TacticalInstruction[] = [],
        private awayInstructions: TacticalInstruction[] = [],
        private substitutePlayers: Map<string, TacticalPlayer> = new Map() // All potential subs mapped by ID
    ) {
        this.possessionTeam = homeTeam;
        this.defendingTeam = awayTeam;
    }

    public simulateMatch(): MatchEvent[] {
        this.events = [];
        this.time = 0;

        // KICKOFF Event
        this.events.push({
            minute: 0,
            type: 'kickoff',
            description: 'The match has started!',
            data: {
                homeTeam: this.homeTeam.name,
                awayTeam: this.awayTeam.name
            }
        });

        const MOMENTS_COUNT = 20;
        const MINS_PER_MOMENT = 90 / MOMENTS_COUNT;

        // Initial Snapshot
        this.homeTeam.updateSnapshot();
        this.awayTeam.updateSnapshot();
        this.generateSnapshotEvent(0);

        let lastTime = 0;
        this.homeScore = 0;
        this.awayScore = 0;

        for (let i = 0; i < MOMENTS_COUNT; i++) {
            let nextTime = Math.floor((i * MINS_PER_MOMENT) + (Math.random() * MINS_PER_MOMENT));
            if (nextTime <= lastTime) nextTime = lastTime + 1;
            if (nextTime > 90) nextTime = 90;

            this.time = nextTime;
            const delta = this.time - lastTime;

            const isHalfTime = lastTime <= 45 && this.time > 45;

            // 1. Process Tactical Instructions for every minute in the delta
            for (let t = lastTime + 1; t <= this.time; t++) {
                this.processTacticalInstructions(t);
            }

            // 2. Update Condition (Decay)
            this.homeTeam.updateCondition(delta, isHalfTime);
            this.awayTeam.updateCondition(delta, isHalfTime);

            // 3. Regular Snapshot Update (every 5 mins)
            const currentBlock = Math.floor(this.time / 5);
            const lastBlock = Math.floor(lastTime / 5);

            if (currentBlock > lastBlock || i === 0 || isHalfTime) {
                this.homeTeam.updateSnapshot();
                this.awayTeam.updateSnapshot();
                this.generateSnapshotEvent(this.time);
            }

            const initialEventCount = this.events.length;
            this.simulateKeyMoment();

            // Update Score Tracker
            const newEvents = this.events.slice(initialEventCount);
            for (const event of newEvents) {
                if (event.type === 'goal') {
                    if (event.teamName === this.homeTeam.name) this.homeScore++;
                    else this.awayScore++;
                }
            }

            lastTime = this.time;
        }

        // FULL_TIME Event
        this.events.push({
            minute: lastTime > 90 ? lastTime : 90 + Math.floor(Math.random() * 4),
            type: 'full_time',
            description: 'The referee blows the final whistle!',
            data: {
                homeScore: this.homeScore,
                awayScore: this.awayScore
            }
        });

        return this.events;
    }

    public simulateExtraTime(): MatchEvent[] {
        // Extra Time Setup (30 mins = ~7 moments)
        const MOMENTS_COUNT = 7;
        const MINS_PER_MOMENT = 30 / MOMENTS_COUNT;

        // Extra Time Break Recovery (Recover 50% of HT)
        this.homeTeam.updateCondition(0, true); // Simplified recovery for now
        this.awayTeam.updateCondition(0, true);

        // Update Snapshot for start of ET
        this.homeTeam.updateSnapshot();
        this.awayTeam.updateSnapshot();
        this.generateSnapshotEvent(this.time);

        let lastTime = this.time; // Start from 90 (or wherever ended)

        for (let i = 0; i < MOMENTS_COUNT; i++) {
            // Time logic: 90 + ...
            let nextTime = 90 + Math.floor((i * MINS_PER_MOMENT) + (Math.random() * MINS_PER_MOMENT));
            if (nextTime <= lastTime) nextTime = lastTime + 1;
            if (nextTime > 120) nextTime = 120; // Cap at 120

            this.time = nextTime;
            const delta = this.time - lastTime;

            // Update Condition
            this.homeTeam.updateCondition(delta);
            this.awayTeam.updateCondition(delta);

            // Snapshot Update (every 5 mins)
            const currentBlock = Math.floor(this.time / 5);
            const lastBlock = Math.floor(lastTime / 5);

            if (currentBlock > lastBlock) {
                this.homeTeam.updateSnapshot();
                this.awayTeam.updateSnapshot();
                this.generateSnapshotEvent(this.time);
            }

            // Simulate Moment
            const initialEventCount = this.events.length;
            this.simulateKeyMoment();

            // Update Score
            const newEvents = this.events.slice(initialEventCount);
            for (const event of newEvents) {
                if (event.type === 'goal') {
                    if (event.teamName === this.homeTeam.name) this.homeScore++;
                    else this.awayScore++;
                }
            }

            lastTime = this.time;
        }

        return this.events;
    }

    private processTacticalInstructions(minute: number) {
        const homeScoreStatus: ScoreStatus = this.homeScore > this.awayScore ? 'leading' : (this.homeScore === this.awayScore ? 'draw' : 'trailing');
        const awayScoreStatus: ScoreStatus = this.awayScore > this.homeScore ? 'leading' : (this.awayScore === this.homeScore ? 'draw' : 'trailing');

        this.applyInstructionsForTeam(this.homeTeam, this.homeInstructions, minute, homeScoreStatus);
        this.applyInstructionsForTeam(this.awayTeam, this.awayInstructions, minute, awayScoreStatus);
    }

    private applyInstructionsForTeam(team: Team, instructions: TacticalInstruction[], minute: number, scoreStatus: ScoreStatus) {
        const pending = instructions.filter(ins => ins.minute === minute && (!ins.condition || ins.condition === scoreStatus));

        for (const ins of pending) {
            let success = false;
            let description = '';

            if (ins.type === 'move') {
                if (!team.isPositionOccupied(ins.newPosition)) {
                    team.movePlayer(ins.playerId, ins.newPosition);
                    description = `Tactical change: ${team.name} moves a player to ${ins.newPosition}.`;
                    success = true;
                }
            } else if (ins.type === 'swap') {
                if (!team.isPositionOccupied(ins.newPosition) || (ins.playerId && team.isPositionOccupied(ins.newPosition) && this.getPlayerById(team, ins.playerId)?.id === this.getPlayerAtPos(team, ins.newPosition)?.id)) {
                    const subPlayer = this.substitutePlayers.get(ins.newPlayerId);
                    if (subPlayer) {
                        team.substitutePlayer(ins.playerId, subPlayer);
                        description = `Substitution for ${team.name}: ${subPlayer.player.name} comes in for ${ins.playerId}.`;
                        success = true;
                    }
                }
            }

            if (success) {
                this.events.push({
                    minute,
                    type: ins.type === 'swap' ? 'substitution' : 'tactical_change',
                    teamName: team.name,
                    playerId: ins.type === 'swap' ? ins.newPlayerId : ins.playerId,
                    description,
                    data: ins
                });
                team.updateSnapshot(); // Immediate re-calculation
            }
        }
    }

    private getPlayerById(team: Team, id: string): Player | undefined {
        return team.players.find(p => (p.player as Player).id === id)?.player;
    }

    private getPlayerAtPos(team: Team, pos: string): Player | undefined {
        return team.players.find(p => p.positionKey === pos)?.player;
    }

    private simulateKeyMoment() {
        this.changeLane();

        // Step 1: Foul Check (Small random chance)
        if (Math.random() < 0.08) {
            this.resolveFoul();
        }

        // Step 2: Possession Battle
        const homeControl = this.homeTeam.calculateLaneStrength(this.currentLane, 'possession');
        const awayControl = this.awayTeam.calculateLaneStrength(this.currentLane, 'possession');

        const homeWinsPossession = this.resolveDuel(homeControl, awayControl, 0.01, 0);

        this.possessionTeam = homeWinsPossession ? this.homeTeam : this.awayTeam;
        this.defendingTeam = homeWinsPossession ? this.awayTeam : this.homeTeam;

        // Step 3: Threat Calculation
        const ATTACK_SCALAR = 1.15;
        const attPower = this.possessionTeam.calculateLaneStrength(this.currentLane, 'attack') * ATTACK_SCALAR;
        const defPower = this.defendingTeam.calculateLaneStrength(this.currentLane, 'defense');

        const threatSuccess = this.resolveDuel(attPower, defPower, 0.008, 0);

        if (threatSuccess) {
            this.resolveFinish();
        }
    }

    private resolveFoul() {
        const team = Math.random() < 0.5 ? this.homeTeam : this.awayTeam;
        const player = team.players[Math.floor(Math.random() * team.players.length)];
        if (!player || player.isSentOff) return;

        const p = player.player as Player;
        const roll = Math.random();

        if (roll < 0.1) {
            // Red Card
            team.sendOffPlayer(p.id);
            this.events.push({
                minute: this.time,
                type: 'red_card',
                teamName: team.name,
                playerId: p.id,
                description: `RED CARD! ${p.name} is sent off for a professional foul!`
            });
            team.updateSnapshot();
        } else if (roll < 0.4) {
            // Yellow Card
            this.events.push({
                minute: this.time,
                type: 'yellow_card',
                teamName: team.name,
                playerId: p.id,
                description: `Yellow card for ${p.name}.`
            });
        } else {
            // Just a foul
            this.events.push({
                minute: this.time,
                type: 'foul',
                teamName: team.name,
                description: `Foul by ${p.name}.`
            });
        }
    }

    private resolveFinish() {
        const shooter = this.selectShooter(this.possessionTeam);
        if (!shooter) {
            this.events.push({
                minute: this.time,
                type: 'miss',
                teamName: this.possessionTeam.name,
                description: `Pressure by ${this.defendingTeam.name} forces a turnover!`
            });
            return;
        }

        const player = shooter.player as Player;
        const attrs = player.attributes;
        const shootRatingRaw = (attrs.finishing * 4) + (attrs.composure * 3) + (attrs.positioning * 2) + (attrs.strength * 1);

        const distanceFactor = 0.6 + (Math.random() * 0.5);
        const finalShootRating = shootRatingRaw * distanceFactor;

        const gk = this.defendingTeam.getGoalkeeper();
        let gkRating = 100;
        if (gk) {
            gkRating = this.defendingTeam.getSnapshot()?.gkRating || 100;
        }

        const isGoal = this.resolveDuel(finalShootRating, gkRating, 0.012, 0);

        if (isGoal) {
            this.events.push({
                minute: this.time,
                type: 'goal',
                teamName: this.possessionTeam.name,
                playerId: player.id,
                description: `GOAL! ${player.name} scores for ${this.possessionTeam.name}!`
            });
        } else {
            this.events.push({
                minute: this.time,
                type: 'save',
                teamName: this.defendingTeam.name,
                description: `Shot by ${player.name} saved by ${this.defendingTeam.name} goalkeeper!`
            });
        }
    }

    private selectShooter(team: Team): TacticalPlayer {
        const candidates = team.players.filter(p => p.positionKey !== 'GK');
        const weighted: TacticalPlayer[] = [];

        for (const p of candidates) {
            let w = 1;
            if (p.positionKey.includes('CF')) w = 6;
            else if (p.positionKey.includes('W')) w = 3;
            else if (p.positionKey.includes('AM')) w = 3;
            else if (p.positionKey.includes('CM')) w = 2;

            for (let i = 0; i < w; i++) weighted.push(p);
        }

        return weighted[Math.floor(Math.random() * weighted.length)];
    }

    private resolveDuel(valA: number, valB: number, k: number, offset: number): boolean {
        let diff = valA - valB - offset;
        if (diff < 0) diff = diff * 0.5;
        const probability = 1 / (1 + Math.exp(-diff * k));
        return Math.random() < probability;
    }

    private changeLane() {
        const lanes: Lane[] = ['left', 'center', 'right'];
        this.currentLane = lanes[Math.floor(Math.random() * lanes.length)];
    }

    private generateSnapshotEvent(time: number) {
        const homeSnapshot = this.homeTeam.getSnapshot();
        const awaySnapshot = this.awayTeam.getSnapshot();
        const homeFitness = Object.fromEntries(this.homeTeam.playerFitness);
        const awayFitness = Object.fromEntries(this.awayTeam.playerFitness);

        this.events.push({
            minute: time,
            type: 'snapshot',
            description: 'Match Snapshot Update',
            data: {
                home: {
                    laneStrengths: homeSnapshot?.laneStrengths,
                    playerFitness: homeFitness
                },
                away: {
                    laneStrengths: awaySnapshot?.laneStrengths,
                    playerFitness: awayFitness
                }
            }
        });
    }
}

