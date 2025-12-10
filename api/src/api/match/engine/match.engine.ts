import { Team } from './classes/Team';
import { Lane, TacticalPlayer } from './types/simulation.types';
import { AttributeCalculator } from './utils/attribute-calculator';
import { Player } from '../../../types/player.types';

export interface MatchEvent {
    minute: number;
    type: 'goal' | 'miss' | 'save' | 'turnover' | 'advance' | 'snapshot';
    description: string;
    teamName?: string;
    teamId?: string; // Added for compatibility with Service
    playerId?: string; // Added for compatibility with Service
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
        public awayTeam: Team
    ) {
        this.possessionTeam = homeTeam;
        this.defendingTeam = awayTeam;
    }

    public simulateMatch(): MatchEvent[] {
        this.events = [];
        this.time = 0;


        // 20 Discrete Key Moments
        const MOMENTS_COUNT = 20;
        const MINS_PER_MOMENT = 90 / MOMENTS_COUNT;

        // Initial Snapshot (Form/Stamina applied)
        this.homeTeam.updateSnapshot(0, 0);
        this.awayTeam.updateSnapshot(0, 0);
        this.generateSnapshotEvent(0);

        let lastTime = 0;
        this.homeScore = 0;
        this.awayScore = 0;

        for (let i = 0; i < MOMENTS_COUNT; i++) {
            // Generate time for this moment
            // Ensures strictly increasing time to avoid negative deltas and logic errors
            let nextTime = Math.floor((i * MINS_PER_MOMENT) + (Math.random() * MINS_PER_MOMENT));
            if (nextTime <= lastTime) nextTime = lastTime + 1; // Ensure forward progress
            if (nextTime > 90) nextTime = 90;

            this.time = nextTime;
            const delta = this.time - lastTime;

            // Half-Time Check (If we crossed 45m mark)
            const isHalfTime = lastTime <= 45 && this.time > 45;

            // 1. Update Condition (Decay) for time passed
            this.homeTeam.updateCondition(delta, isHalfTime);
            this.awayTeam.updateCondition(delta, isHalfTime);

            // 2. Update Snapshot (every 5 mins roughly, or just every moment if expensive? No, user wanted 5 min cache)
            // Check if we crossed a 5-min boundary
            const currentBlock = Math.floor(this.time / 5);
            const lastBlock = Math.floor(lastTime / 5);

            if (currentBlock > lastBlock || i === 0 || isHalfTime) {
                const scoreDiff = this.homeScore - this.awayScore;
                this.homeTeam.updateSnapshot(this.time, scoreDiff);
                this.awayTeam.updateSnapshot(this.time, -scoreDiff);
                this.generateSnapshotEvent(this.time);
            }

            const initialEventCount = this.events.length;
            this.simulateKeyMoment(this.homeScore, this.awayScore);

            // Update Score Tracker by checking all new events
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




    public simulateExtraTime(): MatchEvent[] {
        // Extra Time Setup (30 mins = ~7 moments)
        const MOMENTS_COUNT = 7;
        const MINS_PER_MOMENT = 30 / MOMENTS_COUNT;

        // Extra Time Break Recovery (Recover 50% of HT)
        this.homeTeam.updateCondition(0, false, true);
        this.awayTeam.updateCondition(0, false, true);

        // Update Snapshot for start of ET
        const scoreDiff = this.homeScore - this.awayScore;
        this.homeTeam.updateSnapshot(this.time, scoreDiff);
        this.awayTeam.updateSnapshot(this.time, -scoreDiff);
        this.generateSnapshotEvent(this.time);

        let lastTime = this.time; // Start from 90 (or wherever ended)

        for (let i = 0; i < MOMENTS_COUNT; i++) {
            // Time logic: 90 + ...
            let nextTime = 90 + Math.floor((i * MINS_PER_MOMENT) + (Math.random() * MINS_PER_MOMENT));
            if (nextTime <= lastTime) nextTime = lastTime + 1;
            if (nextTime > 120) nextTime = 120; // Cap at 120

            this.time = nextTime;
            const delta = this.time - lastTime;

            // Update Condition (Decay) for time passed
            this.homeTeam.updateCondition(delta);
            this.awayTeam.updateCondition(delta);

            // Snapshot Update (every 5 mins)
            const currentBlock = Math.floor(this.time / 5);
            const lastBlock = Math.floor(lastTime / 5);

            if (currentBlock > lastBlock) {
                const diff = this.homeScore - this.awayScore;
                this.homeTeam.updateSnapshot(this.time, diff);
                this.awayTeam.updateSnapshot(this.time, -diff);
                this.generateSnapshotEvent(this.time);
            }

            // Simulate Moment
            const initialEventCount = this.events.length;
            this.simulateKeyMoment(this.homeScore, this.awayScore);

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

    private simulateKeyMoment(homeScore: number, awayScore: number) {
        this.changeLane();

        // Step 2: Possession Battle
        const homeControl = this.homeTeam.calculateLaneStrength(this.currentLane, 'possession');
        const awayControl = this.awayTeam.calculateLaneStrength(this.currentLane, 'possession');

        // K=0.01 for ~70% Elite Win
        const homeWinsPossession = this.resolveDuel(homeControl, awayControl, 0.01, 0);

        this.possessionTeam = homeWinsPossession ? this.homeTeam : this.awayTeam;
        this.defendingTeam = homeWinsPossession ? this.awayTeam : this.homeTeam;

        // Step 3: Threat Calculation
        const ATTACK_SCALAR = 1.15;
        const attPower = this.possessionTeam.calculateLaneStrength(this.currentLane, 'attack') * ATTACK_SCALAR;
        const defPower = this.defendingTeam.calculateLaneStrength(this.currentLane, 'defense');

        // K=0.008 -> Flat curve
        const threatSuccess = this.resolveDuel(attPower, defPower, 0.008, 0);

        if (threatSuccess) {
            this.resolveFinish();
        }
    }

    private resolveFinish() {
        // Step 4: Finishing - PLAYER vs GK

        // 1. Select Shooter
        const shooter = this.selectShooter(this.possessionTeam);

        // 2. Calculate Shooter Rating (Scale ~100-180 like GK)
        // Weight: Finishing 4, Composure 3, Positioning 2, Strength 1
        const attrs = shooter.player.attributes;
        const shootRatingRaw = (attrs.finishing * 4) + (attrs.composure * 3) + (attrs.positioning * 2) + (attrs.strength * 1);

        // 3. Distance/Angle Factor (0.6 to 1.1)
        const distanceFactor = 0.6 + (Math.random() * 0.5);
        const finalShootRating = shootRatingRaw * distanceFactor;

        // 4. GK Rating
        const gk = this.defendingTeam.getGoalkeeper();
        let gkRating = 100; // Base weak GK
        if (gk) {
            gkRating = AttributeCalculator.calculateGKSaveRating(gk.player);
        }

        // 5. Comparison
        // K=0.012, Offset 0 for 30-70% range
        const isGoal = this.resolveDuel(finalShootRating, gkRating, 0.012, 0);

        if (isGoal) {
            this.events.push({
                minute: this.time,
                type: 'goal',
                teamName: this.possessionTeam.name,
                teamId: typeof this.possessionTeam.name === 'string' ? undefined : (this.possessionTeam as any).id, // Adapt if Team has ID
                playerId: shooter.player.id,
                description: `GOAL! ${shooter.player.name} scores for ${this.possessionTeam.name}!`
            });
        } else {
            this.events.push({
                minute: this.time,
                type: 'save',
                teamName: this.defendingTeam.name, // Credit save to team for now
                description: `Shot by ${shooter.player.name} saved by ${this.defendingTeam.name} goalkeeper!`
            });
        }
    }

    private selectShooter(team: Team): TacticalPlayer {
        // Weighted random selection
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

    private resolveDuel(
        valA: number, valB: number,
        k: number, offset: number
    ): boolean {

        let diff = valA - valB - offset;

        // Underdog Discount (0.5)
        if (diff < 0) {
            diff = diff * 0.5;
        }

        const probability = 1 / (1 + Math.exp(-diff * k));
        const roll = Math.random();

        return roll < probability;
    }

    private changeLane() {
        const lanes: Lane[] = ['left', 'center', 'right'];
        this.currentLane = lanes[Math.floor(Math.random() * lanes.length)];
    }

    private generateSnapshotEvent(time: number) {
        const homeSnapshot = this.homeTeam.getSnapshot();
        const awaySnapshot = this.awayTeam.getSnapshot();
        const homeEnergies = Object.fromEntries(this.homeTeam.playerEnergies);
        const awayEnergies = Object.fromEntries(this.awayTeam.playerEnergies);

        this.events.push({
            minute: time,
            type: 'snapshot',
            description: 'Match Snapshot Update',
            data: {
                home: {
                    laneStrengths: homeSnapshot?.laneStrengths,
                    playerEnergies: homeEnergies
                },
                away: {
                    laneStrengths: awaySnapshot?.laneStrengths,
                    playerEnergies: awayEnergies
                }
            }
        });
    }
}
