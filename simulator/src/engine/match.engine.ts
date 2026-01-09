import { Team } from './classes/Team';
import { Lane, TacticalPlayer, TacticalInstruction, ScoreStatus } from './types/simulation.types';
import { AttributeCalculator } from './utils/attribute-calculator';
import { ConditionSystem } from './systems/condition.system';
import { Player } from '../types/player.types';

export interface MatchEvent {
    minute: number;
    type: 'goal' | 'miss' | 'save' | 'turnover' | 'advance' | 'snapshot' | 'shot' | 'corner' | 'foul' | 'yellow_card' | 'red_card' | 'offside' | 'substitution' | 'injury' | 'penalty_goal' | 'penalty_miss' | 'kickoff' | 'half_time' | 'second_half' | 'full_time' | 'tactical_change' | 'attack_sequence';
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
    private knownPlayerIds: Set<string> = new Set();

    constructor(
        public homeTeam: Team,
        public awayTeam: Team,
        private homeInstructions: TacticalInstruction[] = [],
        private awayInstructions: TacticalInstruction[] = [],
        private substitutePlayers: Map<string, TacticalPlayer> = new Map() // All potential subs mapped by ID
    ) {
        this.possessionTeam = homeTeam;
        this.defendingTeam = awayTeam;

        // Register starting lineups
        [...homeTeam.players, ...awayTeam.players].forEach(p => {
            this.knownPlayerIds.add((p.player as Player).id);
        });
    }

    public simulateMatch(): MatchEvent[] {
        this.events = [];
        this.time = 0;

        // KICKOFF Event
        this.events.push({
            minute: 0,
            type: 'kickoff',
            description: `The match has started! ${this.homeTeam.name} vs ${this.awayTeam.name}`,
            data: {
                homeTeam: this.homeTeam.name,
                awayTeam: this.awayTeam.name
            }
        });

        // Commentaries for both teams' players at the start
        const getLineupText = (team: Team) => {
            const players = team.players.map(p => {
                const player = p.player as Player;
                return `${player.name} (${p.positionKey})`;
            });
            return `📋 ${team.name} Lineup: ${players.join(', ')}`;
        };

        this.events.push({
            minute: 0,
            type: 'kickoff',
            description: getLineupText(this.homeTeam),
            teamName: this.homeTeam.name
        });

        this.events.push({
            minute: 0,
            type: 'kickoff',
            description: getLineupText(this.awayTeam),
            teamName: this.awayTeam.name
        });

        const MOMENTS_COUNT = 20;
        const MINS_PER_MOMENT = 90 / MOMENTS_COUNT;

        // Initial Snapshot
        this.homeTeam.updateSnapshot();
        this.awayTeam.updateSnapshot();
        this.generateSnapshotEvent(0);

        // Pre-calculate moment times to maintain original pacing (approx 20 moments)
        const momentTimes = new Set<number>();
        for (let i = 0; i < MOMENTS_COUNT; i++) {
            let nextTime = ((i * 90 / MOMENTS_COUNT) + (Math.random() * 90 / MOMENTS_COUNT)) | 0;
            if (nextTime < 1) nextTime = 1;
            if (nextTime > 90) nextTime = 90;
            momentTimes.add(nextTime);
        }

        this.homeScore = 0;
        this.awayScore = 0;

        for (let t = 1; t <= 90; t++) {
            this.time = t;

            // Half Time Event at start of second half
            if (t === 46) {
                this.events.push({
                    minute: 45,
                    type: 'half_time',
                    description: `The referee blows for half-time! Score: ${this.homeTeam.name} ${this.homeScore}-${this.awayScore} ${this.awayTeam.name}`,
                    data: { period: 'half_time' }
                });

                this.events.push({
                    minute: 46,
                    type: 'second_half',
                    description: 'The players return to the pitch. Second half begins!',
                    data: {
                        period: 'second_half',
                        homeScore: this.homeScore,
                        awayScore: this.awayScore
                    }
                });
            }

            // 1. Process Tactical Instructions
            this.processTacticalInstructions(t);

            // 2. Update Condition (Stamina Decay & Recovery)
            const isHTStart = (t === 46);
            this.homeTeam.updateCondition(1, isHTStart);
            this.awayTeam.updateCondition(1, isHTStart);

            // 3. Generate Snapshot (Every 5 mins, 45, 46, 90)
            const isSnapshotMinute = (t % 5 === 0 || t === 45 || t === 46 || t === 90);
            if (isSnapshotMinute) {
                this.homeTeam.updateSnapshot();
                this.awayTeam.updateSnapshot();
                this.generateSnapshotEvent(t);
            }

            // 4. Key Moments
            if (momentTimes.has(t)) {
                const initialEventCount = this.events.length;
                this.simulateKeyMoment();

                // Update Score Tracker immediately from new events
                const newEvents = this.events.slice(initialEventCount);
                for (const event of newEvents) {
                    if (event.type === 'goal') {
                        if (event.teamName === this.homeTeam.name) this.homeScore++;
                        else this.awayScore++;
                    }
                }
            }
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

        // Update Snapshot for start of ET
        this.homeTeam.updateSnapshot();
        this.awayTeam.updateSnapshot();
        this.generateSnapshotEvent(90);

        // Pre-calculate moment times for ET (approx 7 moments)
        const momentTimes = new Set<number>();
        for (let i = 0; i < MOMENTS_COUNT; i++) {
            let nextTime = (90 + ((i * 30 / MOMENTS_COUNT) + (Math.random() * 30 / MOMENTS_COUNT))) | 0;
            if (nextTime <= 90) nextTime = 91;
            if (nextTime > 120) nextTime = 120;
            momentTimes.add(nextTime);
        }

        for (let t = 91; t <= 120; t++) {
            this.time = t;

            // Extra Time Period Kickoffs
            if (t === 91) {
                this.events.push({
                    minute: 90,
                    type: 'kickoff',
                    description: 'Extra time begins!',
                    data: { period: 'extra_time', homeScore: this.homeScore, awayScore: this.awayScore }
                });
            }
            if (t === 106) {
                this.events.push({
                    minute: 105,
                    type: 'kickoff',
                    description: 'Second half of extra time begins!',
                    data: { period: 'extra_time_second_half', homeScore: this.homeScore, awayScore: this.awayScore }
                });
            }

            // 1. Process Tactical Instructions
            this.processTacticalInstructions(t);

            // 2. Update Condition
            const isPeriodStart = (t === 91 || t === 106);
            this.homeTeam.updateCondition(1, isPeriodStart);
            this.awayTeam.updateCondition(1, isPeriodStart);

            // 3. Snapshot (95, 100, 105, 110, 115, 120)
            const isSnapshotMinute = (t % 5 === 0 || t === 105 || t === 120);
            if (isSnapshotMinute) {
                this.homeTeam.updateSnapshot();
                this.awayTeam.updateSnapshot();
                this.generateSnapshotEvent(t);
            }

            // 4. Key Moments
            if (momentTimes.has(t)) {
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
            }
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
                const playerOut = team.players.find(p => (p.player as Player).id === ins.playerId);
                const subPlayer = this.substitutePlayers.get(ins.newPlayerId!);

                if (subPlayer && playerOut) {
                    const playerOutName = (playerOut.player as Player).name;
                    const playerInName = (subPlayer.player as Player).name;

                    team.substitutePlayer(ins.playerId, subPlayer);
                    subPlayer.entryMinute = minute; // Set entry minute
                    description = `Substitution for ${team.name}: ${playerInName} replaces ${playerOutName}.`;

                    (ins as any).playerInName = playerInName;
                    (ins as any).playerOutName = playerOutName;
                    success = true;
                }
            } else if (ins.type === 'position_swap') {
                const playerA = team.players.find(p => (p.player as Player).id === ins.playerId);
                const playerB = team.players.find(p => (p.player as Player).id === ins.newPlayerId);

                if (playerA && playerB && !playerA.isSentOff && !playerB.isSentOff) {
                    const tempPos = playerA.positionKey;
                    playerA.positionKey = playerB.positionKey;
                    playerB.positionKey = tempPos;

                    const playerAName = (playerA.player as Player).name;
                    const playerBName = (playerB.player as Player).name;

                    description = `Tactical change: ${team.name} swaps positions between ${playerAName} and ${playerBName}.`;
                    success = true;
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
                description: `🟥 RED CARD! ${p.name} is sent off after a reckless challenge! ${team.name} are down to 10 men.`
            });
            team.updateSnapshot();
        } else if (roll < 0.4) {
            // Yellow Card
            this.events.push({
                minute: this.time,
                type: 'yellow_card',
                teamName: team.name,
                playerId: p.id,
                description: `🟨 Yellow card for ${p.name}. The referee warns him to be careful.`
            });
        } else {
            // Just a foul
            this.events.push({
                minute: this.time,
                type: 'foul',
                teamName: team.name,
                description: `⚠️ Foul by ${p.name}. A brief stoppage in play.`
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
                ? `⚽ GOAL! ${shooterName} scores for ${possessor}! Brilliant assist by ${assistName}`
                : `⚽ GOAL! ${shooterName} scores for ${possessor}! What a clinical finish!`;
        } else if (finalResult === 'save' && shot?.shooter) {
            const shooterName = (shot.shooter.player as Player).name;
            description = `🧤 SPECTACULAR SAVE! ${possessor} breaks through ${lane}, but ${shooterName}'s powerful shot is denied by ${defender}'s keeper!`;
        } else if (finalResult === 'blocked' && shot?.shooter) {
            const shooterName = (shot.shooter.player as Player).name;
            description = `🛑 Deflected! ${shooterName} tries his luck from the ${lane}, but the defense blocks it for a corner.`;
        } else if (finalResult === 'defense_stopped') {
            description = `🛡️ Excellent defensive work! ${defender} intercepts the build-up through the ${lane}.`;
        } else if (finalResult === 'blocked') {
            description = `🛡️ ${possessor} wins possession in ${lane} and pushes forward, but the attack is blocked under pressure from ${defender}!`;
        } else {
            description = `⚔️ ${possessor} wins possession in ${lane}, but ${defender} defends successfully and stops the attack!`;
        }

        // Calculate the score AFTER this event (for goal events)
        const scoreAfterEvent = {
            home: finalResult === 'goal' && midfieldBattle.winner === 'home' ? this.homeScore + 1 : this.homeScore,
            away: finalResult === 'goal' && midfieldBattle.winner === 'away' ? this.awayScore + 1 : this.awayScore
        };

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
            finalResult: finalResult,
            scoreAfterEvent: finalResult === 'goal' ? scoreAfterEvent : undefined
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

        const mapPlayerStates = (team: Team, isFullMatchSnapshot: boolean) => {
            const teamStates = [];
            for (let i = 0; i < team.players.length; i++) {
                const tacticalPlayer = team.players[i];
                if (tacticalPlayer.isSentOff) continue;

                const player = tacticalPlayer.player as Player;
                const fitness = team.playerFitness[i];
                const multiplier = ConditionSystem.calculateMultiplier(
                    fitness,
                    player.currentStamina,
                    player.form,
                    player.experience
                );

                const lAtk = AttributeCalculator.calculateContribution(player, tacticalPlayer.positionKey, 'left', 'attack');
                const lDef = AttributeCalculator.calculateContribution(player, tacticalPlayer.positionKey, 'left', 'defense');
                const lPos = AttributeCalculator.calculateContribution(player, tacticalPlayer.positionKey, 'left', 'possession');

                const cAtk = AttributeCalculator.calculateContribution(player, tacticalPlayer.positionKey, 'center', 'attack');
                const cDef = AttributeCalculator.calculateContribution(player, tacticalPlayer.positionKey, 'center', 'defense');
                const cPos = AttributeCalculator.calculateContribution(player, tacticalPlayer.positionKey, 'center', 'possession');

                const rAtk = AttributeCalculator.calculateContribution(player, tacticalPlayer.positionKey, 'right', 'attack');
                const rDef = AttributeCalculator.calculateContribution(player, tacticalPlayer.positionKey, 'right', 'defense');
                const rPos = AttributeCalculator.calculateContribution(player, tacticalPlayer.positionKey, 'right', 'possession');

                const totalContribution = (lAtk + lDef + lPos + cAtk + cDef + cPos + rAtk + rDef + rPos) * multiplier;

                // A player needs full data if it's the global full snapshot (min 0) or if they just appeared (sub)
                const isNewPlayer = !this.knownPlayerIds.has(player.id);
                const needsFullData = isFullMatchSnapshot || isNewPlayer;

                const state: any = {
                    id: player.id,
                    p: tacticalPlayer.positionKey,
                    st: parseFloat(fitness.toFixed(1)),
                    f: player.form,
                    cm: parseFloat(multiplier.toFixed(3)),
                    pc: parseFloat(totalContribution.toFixed(1)),
                    em: tacticalPlayer.entryMinute || 0
                };

                if (needsFullData) {
                    state.n = player.name;
                    state.o = player.overall || 50;
                    state.ex = player.experience || 0;
                    state.age = player.exactAge[0] || 0;
                    state.ad = player.exactAge[1] || 0;
                    state.ap = player.appearance;

                    // Mark as known so we don't send full data again
                    this.knownPlayerIds.add(player.id);
                }
                teamStates.push(state);
            }
            return teamStates;
        };

        const formatLanes = (ls: any) => {
            if (!ls) return null;
            const res: any = {};
            for (const [lane, phases] of Object.entries(ls)) {
                res[lane] = {
                    atk: parseFloat(((phases as any).attack || 0).toFixed(1)),
                    def: parseFloat(((phases as any).defense || 0).toFixed(1)),
                    pos: parseFloat(((phases as any).possession || 0).toFixed(1))
                };
            }
            return res;
        };

        this.events.push({
            minute: time,
            type: 'snapshot',
            description: 'Match Snapshot Update',
            data: {
                h: {
                    n: time === 0 ? this.homeTeam.name : undefined,
                    ls: formatLanes(homeSnapshot?.laneStrengths),
                    gk: parseFloat((homeSnapshot?.gkRating || 0).toFixed(1)),
                    ps: mapPlayerStates(this.homeTeam, time === 0)
                },
                a: {
                    n: time === 0 ? this.awayTeam.name : undefined,
                    ls: formatLanes(awaySnapshot?.laneStrengths),
                    gk: parseFloat((awaySnapshot?.gkRating || 0).toFixed(1)),
                    ps: mapPlayerStates(this.awayTeam, time === 0)
                }
            }
        });
    }
}

