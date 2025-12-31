import { Team } from './classes/Team';
import { Lane, TacticalPlayer, TacticalInstruction, ScoreStatus } from './types/simulation.types';
import { AttributeCalculator } from './utils/attribute-calculator';
import { ConditionSystem } from './systems/condition.system';
import { Player } from '../types/player.types';

export interface MatchEvent {
    minute: number;
    type: 'goal' | 'miss' | 'save' | 'turnover' | 'advance' | 'snapshot' | 'shot' | 'corner' | 'foul' | 'yellow_card' | 'red_card' | 'offside' | 'substitution' | 'injury' | 'penalty_goal' | 'penalty_miss' | 'kickoff' | 'full_time' | 'tactical_change' | 'attack_sequence';
    description: string;
    teamName?: string;
    teamId?: string;
    playerId?: string;
    relatedPlayerId?: string; // For assists, second yellow cards, etc.
    data?: any;
    eventScheduledTime?: Date; // Real-world time when this event should be revealed (calculated by processor)
}

export class MatchEngine {
    private time: number = 0;
    private events: MatchEvent[] = [];
    public homeScore: number = 0;
    public awayScore: number = 0;

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
            let nextTime = ((i * MINS_PER_MOMENT) + (Math.random() * MINS_PER_MOMENT)) | 0;
            if (nextTime <= lastTime) nextTime = lastTime + 1;
            if (nextTime > 90) nextTime = 90;
            
            // Ensure first moment doesn't skip too far (max 10 minutes from start)
            if (i === 0 && nextTime > 10) {
                nextTime = Math.min(nextTime, 5 + (Math.random() * 5 | 0));
            }

            this.time = nextTime;
            const delta = this.time - lastTime;

            const isHalfTime = lastTime <= 45 && this.time > 45;

            // 1. Process Tactical Instructions for every minute in the delta
            for (let t = lastTime + 1; t <= this.time; t++) {
                this.processTacticalInstructions(t);
            }

            // 2. Update stamina and generate snapshots minute-by-minute
            // This ensures each snapshot captures the correct stamina state at that exact minute
            for (let currentMinute = lastTime + 1; currentMinute <= this.time; currentMinute++) {
                // Apply stamina decay for this minute
                const isHT = (currentMinute === 45); // Halftime recovery happens at minute 45
                this.homeTeam.updateCondition(1, isHT);
                this.awayTeam.updateCondition(1, isHT);
                
                // Generate snapshot at special moments: every 5 minutes, minute 45, minute 46 (second half start), minute 90
                const isSpecialMoment = currentMinute % 5 === 0 || currentMinute === 45 || currentMinute === 46 || currentMinute === 90;
                if (isSpecialMoment && currentMinute <= 90) {
                    this.homeTeam.updateSnapshot();
                    this.awayTeam.updateSnapshot();
                    this.generateSnapshotEvent(currentMinute);
                }
            }
            
            // Special case: Add second half kickoff event when crossing minute 45
            if (isHalfTime && this.time > 45) {
                this.events.push({
                    minute: 45,
                    type: 'kickoff',
                    description: 'Second half begins!',
                    data: {
                        period: 'second_half',
                        homeScore: this.homeScore,
                        awayScore: this.awayScore
                    }
                });
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

        // FULL_TIME Event - Mark exactly at 90 minutes
        this.events.push({
            minute: 90,
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

        // Extra Time Kickoff Event
        this.events.push({
            minute: 90,
            type: 'kickoff',
            description: 'Extra time begins!',
            data: {
                period: 'extra_time',
                homeScore: this.homeScore,
                awayScore: this.awayScore
            }
        });

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
            let nextTime = (90 + ((i * MINS_PER_MOMENT) + (Math.random() * MINS_PER_MOMENT))) | 0;
            if (nextTime <= lastTime) nextTime = lastTime + 1;
            if (nextTime > 120) nextTime = 120; // Cap at 120

            this.time = nextTime;
            const delta = this.time - lastTime;
            
            // Check for start of second half of extra time (105 minutes)
            const isExtraTimeSecondHalf = lastTime <= 105 && this.time > 105;
            if (isExtraTimeSecondHalf) {
                this.events.push({
                    minute: 105,
                    type: 'kickoff',
                    description: 'Second half of extra time begins!',
                    data: {
                        period: 'extra_time_second_half',
                        homeScore: this.homeScore,
                        awayScore: this.awayScore
                    }
                });
            }

            // Update stamina and generate snapshots minute-by-minute
            for (let currentMinute = lastTime + 1; currentMinute <= this.time; currentMinute++) {
                // Apply stamina decay for this minute
                this.homeTeam.updateCondition(1, false);
                this.awayTeam.updateCondition(1, false);
                
                // Generate snapshot if this minute is a 5-minute mark (95, 100, 105, 110, 115, 120)
                if (currentMinute % 5 === 0 && currentMinute > 90 && currentMinute <= 120) {
                    this.homeTeam.updateSnapshot();
                    this.awayTeam.updateSnapshot();
                    this.generateSnapshotEvent(currentMinute);
                }
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

        // FULL_TIME Event for Extra Time - Mark exactly at 120 minutes
        this.events.push({
            minute: 120,
            type: 'full_time',
            description: 'Extra time ends! Moving to penalty shootout...',
            data: {
                homeScore: this.homeScore,
                awayScore: this.awayScore
            }
        });

        return this.events;
    }

    public simulatePenaltyShootout(): MatchEvent[] {
        let homePKScore = 0;
        let awayPKScore = 0;
        let round = 1;

        const homeKickers = this.homeTeam.players.filter(p => !p.isSentOff);
        const awayKickers = this.awayTeam.players.filter(p => !p.isSentOff);
        const homeGK = this.homeTeam.getGoalkeeper();
        const awayGK = this.awayTeam.getGoalkeeper();

        const getPenaltyScore = (player: Player, multiplier: number, isGK: boolean) => {
            const attrs = player.attributes;
            if (isGK) {
                return (attrs.gk_reflexes * 0.7 + attrs.composure * 0.3) * multiplier;
            } else {
                return (attrs.finishing * 0.3 + attrs.composure * 0.7) * multiplier;
            }
        };

        const resolvePenalty = (kicker: TacticalPlayer, keeper: TacticalPlayer | undefined): boolean => {
            if (!keeper) return true;
            const kPlayer = kicker.player as Player;
            const gPlayer = keeper.player as Player;

            const kMultiplier = ConditionSystem.calculatePenaltyMultiplier(kPlayer.form, kPlayer.experience);
            const gMultiplier = ConditionSystem.calculatePenaltyMultiplier(gPlayer.form, gPlayer.experience);

            const kickerScore = getPenaltyScore(kPlayer, kMultiplier, false);
            const keeperScore = getPenaltyScore(gPlayer, gMultiplier, true);

            // K=0.1, Offset=11.5 for ~76% base
            return this.resolveDuel(kickerScore, keeperScore, 0.1, -11.5);
        };

        // Standard 5 rounds
        for (round = 1; round <= 5; round++) {
            // Home team kicks
            const hKicker = homeKickers[(round - 1) % homeKickers.length];
            const hGoal = resolvePenalty(hKicker, awayGK);
            if (hGoal) homePKScore++;
            this.recordPenaltyEvent(hKicker, hGoal, homePKScore, awayPKScore);

            // Check if decided
            if (this.isShootoutDecided(homePKScore, awayPKScore, 5, round, true)) break;

            // Away team kicks
            const aKicker = awayKickers[(round - 1) % awayKickers.length];
            const aGoal = resolvePenalty(aKicker, homeGK);
            if (aGoal) awayPKScore++;
            this.recordPenaltyEvent(aKicker, aGoal, homePKScore, awayPKScore);

            // Check if decided
            if (this.isShootoutDecided(homePKScore, awayPKScore, 5, round, false)) break;
        }

        // Sudden Death
        if (homePKScore === awayPKScore) {
            round = 6;
            while (true) {
                const hKicker = homeKickers[(round - 1) % homeKickers.length];
                const hGoal = resolvePenalty(hKicker, awayGK);

                const aKicker = awayKickers[(round - 1) % awayKickers.length];
                const aGoal = resolvePenalty(aKicker, homeGK);

                if (hGoal) homePKScore++;
                this.recordPenaltyEvent(hKicker, hGoal, homePKScore, awayPKScore);

                if (aGoal) awayPKScore++;
                this.recordPenaltyEvent(aKicker, aGoal, homePKScore, awayPKScore);

                if (hGoal !== aGoal) break; // Decided
                round++;
                if (round > 22) break; // Safety
            }
        }

        // Update main score for record keeping
        this.homeScore = homePKScore;
        this.awayScore = awayPKScore;

        this.events.push({
            minute: 120,
            type: 'full_time',
            description: `Penalty Shootout Ends! ${this.homeTeam.name} ${homePKScore} - ${awayPKScore} ${this.awayTeam.name}`,
            data: { homeScore: homePKScore, awayScore: awayPKScore, isPenalty: true }
        });

        return this.events;
    }

    private isShootoutDecided(hScore: number, aScore: number, total: number, currentRound: number, homeJustKicked: boolean): boolean {
        const hRemaining = total - currentRound + (homeJustKicked ? 0 : 1);
        const aRemaining = total - currentRound;

        if (hScore > aScore + aRemaining) return true;
        if (aScore > hScore + hRemaining) return true;
        return false;
    }

    private recordPenaltyEvent(kicker: TacticalPlayer, goal: boolean, hScore: number, aScore: number) {
        const p = kicker.player as Player;
        this.events.push({
            minute: 120,
            type: goal ? 'penalty_goal' : 'penalty_miss',
            teamName: this.homeTeam.players.includes(kicker) ? this.homeTeam.name : this.awayTeam.name,
            playerId: p.id,
            description: `Penalty ${goal ? 'GOAL' : 'MISS'} by ${p.name}! (Current: ${hScore}-${aScore})`,
            data: { homeScore: hScore, awayScore: aScore }
        });
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
            return; // Foul interrupts the play
        }

        // Step 2: Midfield Battle (Possession)
        const homeControl = this.homeTeam.calculateLaneStrength(this.currentLane, 'possession');
        const awayControl = this.awayTeam.calculateLaneStrength(this.currentLane, 'possession');
        const homeWinsPossession = this.resolveDuel(homeControl, awayControl, 0.02, 0);

        this.possessionTeam = homeWinsPossession ? this.homeTeam : this.awayTeam;
        this.defendingTeam = homeWinsPossession ? this.awayTeam : this.homeTeam;

        // Step 3: Attack Push (Attack vs Defense)
        const ATTACK_SCALAR = 1.15;
        const attPower = this.possessionTeam.calculateLaneStrength(this.currentLane, 'attack') * ATTACK_SCALAR;
        const defPower = this.defendingTeam.calculateLaneStrength(this.currentLane, 'defense');
        const pushSuccess = this.resolveDuel(attPower, defPower, 0.025, 0);

        // Step 4: Shot attempt (if push successful)
        let shotResult: 'goal' | 'save' | 'blocked' | 'no_shot' = 'no_shot';
        let shooter: TacticalPlayer | null = null;
        let assistPlayer: TacticalPlayer | null = null;
        let finalShootRating = 0;
        let gkRating = 0;

        if (pushSuccess) {
            shooter = this.selectShooter(this.possessionTeam);
            if (shooter) {
                const player = shooter.player as Player;
                const attrs = player.attributes;
                const shootRatingRaw = (attrs.finishing * 4) + (attrs.composure * 3) + (attrs.positioning * 2) + (attrs.strength * 1);
                const distanceFactor = 0.6 + (Math.random() * 0.5);
                finalShootRating = shootRatingRaw * distanceFactor;

                const gk = this.defendingTeam.getGoalkeeper();
                gkRating = 100;
                if (gk) {
                    gkRating = this.defendingTeam.getSnapshot()?.gkRating || 100;
                }

                const isGoal = this.resolveDuel(finalShootRating, gkRating, 0.03, 0);

                // 65% chance to have an assist
                if (Math.random() < 0.65) {
                    assistPlayer = this.selectAssist(this.possessionTeam, shooter);
                }

                shotResult = isGoal ? 'goal' : 'save';
            } else {
                shotResult = 'blocked';
            }
        }

        // Record the complete attack sequence as ONE event
        this.recordAttackSequence({
            lane: this.currentLane,
            midfieldBattle: {
                homeStrength: homeControl,
                awayStrength: awayControl,
                winner: homeWinsPossession ? 'home' : 'away'
            },
            attackPush: {
                attackPower: attPower,
                defensePower: defPower,
                success: pushSuccess
            },
            shot: shotResult === 'no_shot' ? null : {
                result: shotResult,
                shooter: shooter,
                assist: assistPlayer,
                shootRating: finalShootRating,
                gkRating: gkRating
            }
        });
    }

    private resolveFoul() {
        const team = Math.random() < 0.5 ? this.homeTeam : this.awayTeam;
        const playerIdx = (Math.random() * team.players.length) | 0;
        const player = team.players[playerIdx];
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

    private recordAttackSequence(sequence: {
        lane: Lane;
        midfieldBattle: { homeStrength: number; awayStrength: number; winner: 'home' | 'away' };
        attackPush: { attackPower: number; defensePower: number; success: boolean };
        shot: { result: 'goal' | 'save' | 'blocked'; shooter: TacticalPlayer | null; assist: TacticalPlayer | null; shootRating: number; gkRating: number } | null;
    }) {
        const { lane, midfieldBattle, attackPush, shot } = sequence;
        
        // Determine overall result
        let finalResult: 'goal' | 'save' | 'blocked' | 'defense_stopped';
        let eventType: MatchEvent['type'];
        
        if (shot) {
            finalResult = shot.result;
            eventType = shot.result === 'goal' ? 'goal' : (shot.result === 'save' ? 'save' : 'miss');
        } else if (attackPush.success) {
            finalResult = 'blocked';
            eventType = 'miss';
        } else {
            finalResult = 'defense_stopped';
            eventType = 'turnover';
        }

        // Build description
        let description = '';
        const possessor = midfieldBattle.winner === 'home' ? this.homeTeam.name : this.awayTeam.name;
        const defender = midfieldBattle.winner === 'home' ? this.awayTeam.name : this.homeTeam.name;
        
        if (finalResult === 'goal' && shot?.shooter) {
            const shooterName = (shot.shooter.player as Player).name;
            const assistName = shot.assist ? (shot.assist.player as Player).name : null;
            description = assistName 
                ? `⚽ GOAL! ${shooterName} scores for ${possessor}! Assisted by ${assistName}`
                : `⚽ GOAL! ${shooterName} scores for ${possessor}!`;
        } else if (finalResult === 'save' && shot?.shooter) {
            const shooterName = (shot.shooter.player as Player).name;
            description = `🧤 ${possessor} attacks through ${lane}, but ${shooterName}'s shot is saved by ${defender}'s goalkeeper!`;
        } else if (finalResult === 'blocked') {
            description = `🛡️ ${possessor} wins possession in ${lane} and pushes forward, but the attack is blocked under pressure from ${defender}!`;
        } else {
            description = `⚔️ ${possessor} wins possession in ${lane}, but ${defender} defends successfully and stops the attack!`;
        }

        // Build event data
        const eventData: any = {
            sequence: {
                midfieldBattle: {
                    homeTeam: this.homeTeam.name,
                    awayTeam: this.awayTeam.name,
                    homeStrength: parseFloat(midfieldBattle.homeStrength.toFixed(2)),
                    awayStrength: parseFloat(midfieldBattle.awayStrength.toFixed(2)),
                    winner: midfieldBattle.winner === 'home' ? this.homeTeam.name : this.awayTeam.name
                },
                attackPush: {
                    attackingTeam: possessor,
                    defendingTeam: defender,
                    attackPower: parseFloat(attackPush.attackPower.toFixed(2)),
                    defensePower: parseFloat(attackPush.defensePower.toFixed(2)),
                    success: attackPush.success
                },
                shot: shot ? {
                    result: shot.result,
                    shooter: shot.shooter ? (shot.shooter.player as Player).name : null,
                    shooterId: shot.shooter ? (shot.shooter.player as Player).id : null,
                    assist: shot.assist ? (shot.assist.player as Player).name : null,
                    assistId: shot.assist ? (shot.assist.player as Player).id : null,
                    shootRating: parseFloat(shot.shootRating.toFixed(2)),
                    gkRating: parseFloat(shot.gkRating.toFixed(2))
                } : null
            },
            lane: lane,
            finalResult: finalResult
        };

        // Create the event
        this.events.push({
            minute: this.time,
            type: eventType,
            teamName: possessor,
            playerId: shot?.shooter ? (shot.shooter.player as Player).id : undefined,
            relatedPlayerId: shot?.assist ? (shot.assist.player as Player).id : undefined,
            description: description,
            data: eventData
        });
    }

    private selectShooter(team: Team): TacticalPlayer {
        const candidates = team.players.filter(p => !p.isSentOff);
        const len = candidates.length;
        // CFs focus
        for (let i = 0; i < len; i++) {
            const p = candidates[i];
            if (p.positionKey.includes('CF') && Math.random() < 0.6) return p;
        }
        // Midfielders
        for (let i = 0; i < len; i++) {
            const p = candidates[i];
            if (p.positionKey.includes('AM') || p.positionKey.includes('W')) return p;
        }
        // Fallback
        return candidates[(Math.random() * len) | 0];
    }

    private selectAssist(team: Team, shooter: TacticalPlayer): TacticalPlayer | null {
        // Get all players except the shooter and GK
        const candidates = team.players.filter(p => 
            !p.isSentOff && 
            p !== shooter && 
            !p.positionKey.includes('GK')
        );
        
        if (candidates.length === 0) return null;
        
        // Prioritize midfielders and wingers for assists
        const preferredAssisters = candidates.filter(p => 
            p.positionKey.includes('AM') || 
            p.positionKey.includes('CM') || 
            p.positionKey.includes('W') ||
            p.positionKey.includes('M')
        );
        
        if (preferredAssisters.length > 0 && Math.random() < 0.7) {
            // 70% chance to pick from preferred assisters
            return preferredAssisters[(Math.random() * preferredAssisters.length) | 0];
        }
        
        // Otherwise pick any outfield player
        return candidates[(Math.random() * candidates.length) | 0];
    }

    private resolveDuel(valA: number, valB: number, k: number, offset: number): boolean {
        const diff = valA - valB - offset;
        const probability = 1 / (1 + Math.exp(-diff * k));
        return Math.random() < probability;
    }

    private changeLane() {
        const lanes: Lane[] = ['left', 'center', 'right'];
        this.currentLane = lanes[(Math.random() * lanes.length) | 0];
    }

    private generateSnapshotEvent(time: number) {
        const homeSnapshot = this.homeTeam.getSnapshot();
        const awaySnapshot = this.awayTeam.getSnapshot();

        const mapPlayerStates = (team: Team) => {
            return team.players
                .filter(p => !p.isSentOff)
                .map((tacticalPlayer, idx) => {
                    const player = tacticalPlayer.player as Player;
                    const currentFit = team.playerFitness[idx];

                    // Calculate the same multiplier used in snapshot calculation
                    const conditionMultiplier = ConditionSystem.calculateMultiplier(
                        currentFit,
                        player.currentStamina,
                        player.form,
                        player.experience
                    );

                    // Calculate player's contribution in their position (before condition multiplier)
                    // Get raw contributions across all three lanes and three phases
                    const leftAttack = AttributeCalculator.calculateContribution(player, tacticalPlayer.positionKey, 'left', 'attack');
                    const leftDefense = AttributeCalculator.calculateContribution(player, tacticalPlayer.positionKey, 'left', 'defense');
                    const leftPossession = AttributeCalculator.calculateContribution(player, tacticalPlayer.positionKey, 'left', 'possession');
                    
                    const centerAttack = AttributeCalculator.calculateContribution(player, tacticalPlayer.positionKey, 'center', 'attack');
                    const centerDefense = AttributeCalculator.calculateContribution(player, tacticalPlayer.positionKey, 'center', 'defense');
                    const centerPossession = AttributeCalculator.calculateContribution(player, tacticalPlayer.positionKey, 'center', 'possession');
                    
                    const rightAttack = AttributeCalculator.calculateContribution(player, tacticalPlayer.positionKey, 'right', 'attack');
                    const rightDefense = AttributeCalculator.calculateContribution(player, tacticalPlayer.positionKey, 'right', 'defense');
                    const rightPossession = AttributeCalculator.calculateContribution(player, tacticalPlayer.positionKey, 'right', 'possession');

                    // Sum all contributions to get total positional performance
                    const totalContribution = leftAttack + leftDefense + leftPossession +
                                             centerAttack + centerDefense + centerPossession +
                                             rightAttack + rightDefense + rightPossession;

                    return {
                        playerId: player.id,
                        name: player.name,
                        position: tacticalPlayer.positionKey,
                        stamina: parseFloat(currentFit.toFixed(2)),
                        form: player.form,
                        experience: player.experience || 0,
                        overall: player.overall || 50,
                        conditionMultiplier: parseFloat(conditionMultiplier.toFixed(3)),
                        positionalContribution: parseFloat(totalContribution.toFixed(2)), // Raw contribution from position
                        isSubstitute: tacticalPlayer.isOriginal === false,
                        appearance: player.appearance // Include player appearance from database
                    };
                });
        };

        this.events.push({
            minute: time,
            type: 'snapshot',
            description: 'Match Snapshot Update',
            data: {
                home: {
                    teamName: this.homeTeam.name,
                    laneStrengths: homeSnapshot?.laneStrengths,
                    gkRating: homeSnapshot?.gkRating,
                    players: mapPlayerStates(this.homeTeam)
                },
                away: {
                    teamName: this.awayTeam.name,
                    laneStrengths: awaySnapshot?.laneStrengths,
                    gkRating: awaySnapshot?.gkRating,
                    players: mapPlayerStates(this.awayTeam)
                }
            }
        });
    }
}

