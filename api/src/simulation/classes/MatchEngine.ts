import { Team } from './Team';
import { Lane, TacticalPlayer } from '../types/simulation.types';
import { AttributeCalculator } from '../utils/attribute-calculator';
import { Player } from '../../types/player.types';

export interface MatchEvent {
    minute: number;
    type: 'goal' | 'miss' | 'save' | 'turnover' | 'advance';
    description: string;
    teamName?: string;
}

export class MatchEngine {
    private time: number = 0;
    private events: MatchEvent[] = [];

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

        for (let i = 0; i < MOMENTS_COUNT; i++) {
            this.time = Math.floor((i * MINS_PER_MOMENT) + (Math.random() * MINS_PER_MOMENT));
            if (this.time > 90) this.time = 90;
            this.simulateKeyMoment();
        }

        return this.events;
    }

    private simulateKeyMoment() {
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
                description: `GOAL! ${shooter.player.name} scores for ${this.possessionTeam.name}!`
            });
        } else {
            this.events.push({
                minute: this.time,
                type: 'save',
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
}
