import { Team } from './classes/Team';
import { Lane, TacticalPlayer, TacticalInstruction, ScoreStatus, AttackType, ShotType } from './types/simulation.types';
import { AttributeCalculator } from './utils/attribute-calculator';
import { ConditionSystem } from './systems/condition.system';
import { Player } from '../types/player.types';
import { BenchConfig } from '@goalxi/database';

// 进攻类型分布配置（仅 balanced 模式已实现）
const ATTACK_TYPE_DISTRIBUTION: Record<number, number[]> = {
    0: [15, 30, 15, 30, 10], // balanced: 传中, 短传, 直塞, 突破, 远射
};

// 进攻类型配置（推进参数）
const ATTACK_TYPE_CONFIG: Record<AttackType, { pushK: number; pushOffset: number }> = {
    [AttackType.CROSS]: { pushK: 0.025, pushOffset: -5 },
    [AttackType.SHORT_PASS]: { pushK: 0.030, pushOffset: -5 },
    [AttackType.THROUGH_PASS]: { pushK: 0.030, pushOffset: -8 },
    [AttackType.DRIBBLE]: { pushK: 0.035, pushOffset: -10 },
    [AttackType.LONG_SHOT]: { pushK: 0, pushOffset: 0 }, // 远射不经过推进阶段
};

// 射门类型配置
// 公式: P = 1 / (1 + exp(-(rating - gkRating - offset) * k / 1.5))
// 注意：offset 会先除以 1.5
// 目标进球率: 单刀 60%+, 头球 50%, 补射 50%, 抽射 35%, 远射 20%
const SHOT_TYPE_CONFIG: Record<ShotType, { k: number; offset: number }> = {
    [ShotType.ONE_ON_ONE]: { k: 0.012, offset: -65 }, // ~60%+
    [ShotType.HEADER]: { k: 0.010, offset: -40 },     // ~50%
    [ShotType.REBOUND]: { k: 0.008, offset: -30 },    // ~50%
    [ShotType.NORMAL]: { k: 0.012, offset: 25 },      // ~35%
    [ShotType.LONG_SHOT]: { k: 0.012, offset: 50 },   // ~20%
};

/**
 * Map position keys to bench config keys
 * FB = Fullback (covers LB/RB/WBL/WBR)
 * W = Winger (covers LW/RW/LM/RM)
 * CM = Central Midfield (covers AM/CM/DM all left/center/right variants)
 */
const POSITION_TO_BENCH_KEY: Record<string, keyof BenchConfig> = {
    // Goalkeeper
    'GK': 'goalkeeper',
    // Center Back (3 positions)
    'CDL': 'centerBack', 'CD': 'centerBack', 'CDR': 'centerBack',
    // Fullback (4 positions: LB, RB, WBL, WBR)
    'LB': 'fullback', 'RB': 'fullback', 'WBL': 'fullback', 'WBR': 'fullback',
    // Winger (4 positions: LW, RW, LM, RM)
    'LW': 'winger', 'RW': 'winger', 'LM': 'winger', 'RM': 'winger',
    // Central Midfield (9 positions: AM/CM/DM x left/center/right)
    'AML': 'centralMidfield', 'AM': 'centralMidfield', 'AMR': 'centralMidfield',
    'CML': 'centralMidfield', 'CM': 'centralMidfield', 'CMR': 'centralMidfield',
    'DML': 'centralMidfield', 'DM': 'centralMidfield', 'DMR': 'centralMidfield',
    // Forward (3 positions)
    'CFL': 'forward', 'CF': 'forward', 'CFR': 'forward'
};

export interface MatchEvent {
    minute: number;
    type: 'goal' | 'miss' | 'save' | 'turnover' | 'advance' | 'snapshot' | 'shot' | 'corner' | 'foul' | 'yellow_card' | 'red_card' | 'offside' | 'substitution' | 'injury' | 'penalty_goal' | 'penalty_miss' | 'kickoff' | 'half_time' | 'second_half' | 'full_time' | 'tactical_change' | 'attack_sequence' | 'free_kick';
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

    // 比赛统计
    private matchStats: {
        attackTypeStats: Record<string, { attempts: number; goals: number; shots: number }>;
        shotTypeStats: Record<string, { attempts: number; goals: number; saves: number; misses: number; blocks: number }>;
        possessionStats: { home: number; away: number };
    };

    constructor(
        public homeTeam: Team,
        public awayTeam: Team,
        private homeInstructions: TacticalInstruction[] = [],
        private awayInstructions: TacticalInstruction[] = [],
        private substitutePlayers: Map<string, TacticalPlayer> = new Map(), // All potential subs mapped by ID
        private homeBenchConfig: BenchConfig | null = null,
        private awayBenchConfig: BenchConfig | null = null
    ) {
        this.possessionTeam = homeTeam;
        this.defendingTeam = awayTeam;

        // Register starting lineups
        [...homeTeam.players, ...awayTeam.players].forEach(p => {
            this.knownPlayerIds.add((p.player as Player).id);
        });

        // 初始化比赛统计
        this.matchStats = {
            attackTypeStats: {},
            shotTypeStats: {},
            possessionStats: { home: 0, away: 0 }
        };

        // 初始化攻击类型统计（只使用字符串键）
        Object.keys(AttackType).forEach(key => {
            if (isNaN(Number(key))) {
                this.matchStats.attackTypeStats[key] = { attempts: 0, goals: 0, shots: 0 };
            }
        });

        // 初始化射门类型统计（只使用字符串键）
        Object.keys(ShotType).forEach(key => {
            if (isNaN(Number(key))) {
                this.matchStats.shotTypeStats[key] = { attempts: 0, goals: 0, saves: 0, misses: 0, blocks: 0 };
            }
        });
    }

    /**
     * Get substitute player for a specific position
     */
    private getSubstituteForPosition(team: Team, benchConfig: BenchConfig | null, positionKey: string): TacticalPlayer | null {
        if (!benchConfig) return null;

        const benchKey = POSITION_TO_BENCH_KEY[positionKey];
        if (!benchKey) return null;

        const subPlayerId = benchConfig[benchKey];
        if (!subPlayerId) return null;

        // Look up in substitutePlayers map first
        const subPlayer = this.substitutePlayers.get(subPlayerId);
        if (subPlayer) return subPlayer;

        // Fallback: search in team players (shouldn't happen normally)
        return team.players.find(p => (p.player as Player).id === subPlayerId) || null;
    }

    public simulateMatch(): MatchEvent[] {
        // 清除属性计算缓存，确保每次模拟从零开始
        AttributeCalculator.clearCache();

        this.events = [];
        this.time = 0;

        // KICKOFF Event
        this.events.push({
            minute: 0,
            type: 'kickoff',
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
            teamName: this.homeTeam.name
        });

        this.events.push({
            minute: 0,
            type: 'kickoff',
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
                    data: { period: 'half_time' }
                });

                this.events.push({
                    minute: 46,
                    type: 'second_half',
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
                    data: { period: 'extra_time', homeScore: this.homeScore, awayScore: this.awayScore }
                });
            }
            if (t === 106) {
                this.events.push({
                    minute: 105,
                    type: 'kickoff',
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
            data: { homeScore: homePKScore, awayScore: awayPKScore, isPenalty: true }
        });

        return this.events;
    }

    /**
     * 获取比赛统计数据
     */
    public getMatchStats() {
        const totalAttacks = Object.values(this.matchStats.attackTypeStats).reduce((sum, s) => sum + s.attempts, 0);
        const totalShots = Object.values(this.matchStats.shotTypeStats).reduce((sum, s) => sum + s.attempts, 0);
        const totalPossession = this.matchStats.possessionStats.home + this.matchStats.possessionStats.away;

        return {
            // 进攻类型统计
            attackTypeStats: Object.entries(this.matchStats.attackTypeStats).map(([type, stats]) => ({
                type,
                attempts: stats.attempts,
                attemptsPercent: totalAttacks > 0 ? (stats.attempts / totalAttacks * 100).toFixed(1) + '%' : '0%',
                shots: stats.shots,
                shotPercent: stats.attempts > 0 ? (stats.shots / stats.attempts * 100).toFixed(1) + '%' : '0%',
                goals: stats.goals,
                goalRate: stats.shots > 0 ? (stats.goals / stats.shots * 100).toFixed(1) + '%' : '0%'
            })),
            // 射门类型统计
            shotTypeStats: Object.entries(this.matchStats.shotTypeStats).map(([type, stats]) => ({
                type,
                attempts: stats.attempts,
                attemptsPercent: totalShots > 0 ? (stats.attempts / totalShots * 100).toFixed(1) + '%' : '0%',
                goals: stats.goals,
                goalRate: stats.attempts > 0 ? (stats.goals / stats.attempts * 100).toFixed(1) + '%' : '0%',
                saves: stats.saves,
                saveRate: stats.attempts > 0 ? (stats.saves / stats.attempts * 100).toFixed(1) + '%' : '0%',
                misses: stats.misses,
                missRate: stats.attempts > 0 ? (stats.misses / stats.attempts * 100).toFixed(1) + '%' : '0%',
                blocks: stats.blocks,
                blockRate: stats.attempts > 0 ? (stats.blocks / stats.attempts * 100).toFixed(1) + '%' : '0%'
            })),
            // 控球统计
            possessionStats: {
                home: this.matchStats.possessionStats.home,
                away: this.matchStats.possessionStats.away,
                homePercent: totalPossession > 0 ? (this.matchStats.possessionStats.home / totalPossession * 100).toFixed(1) + '%' : '0%',
                awayPercent: totalPossession > 0 ? (this.matchStats.possessionStats.away / totalPossession * 100).toFixed(1) + '%' : '0%'
            },
            summary: {
                totalAttacks,
                totalShots,
                totalGoals: this.homeScore + this.awayScore,
                homeScore: this.homeScore,
                awayScore: this.awayScore
            }
        };
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
        const kickerTeam = this.homeTeam.players.some(tp => (tp.player as Player).id === p.id)
            ? this.homeTeam.name
            : this.awayTeam.name;
        this.events.push({
            minute: 120,
            type: goal ? 'penalty_goal' : 'penalty_miss',
            teamName: kickerTeam,
            playerId: p.id,
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

            if (ins.type === 'move') {
                if (!team.isPositionOccupied(ins.newPosition)) {
                    team.movePlayer(ins.playerId, ins.newPosition);
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

                    // 重新缓存两个球员在新位置的贡献值
                    AttributeCalculator.preCachePlayerContributions(playerA.player as Player, playerA.positionKey);
                    AttributeCalculator.preCachePlayerContributions(playerB.player as Player, playerB.positionKey);

                    success = true;
                }
            }

            if (success) {
                this.events.push({
                    minute,
                    type: ins.type === 'swap' ? 'substitution' : 'tactical_change',
                    teamName: team.name,
                    playerId: ins.type === 'swap' ? ins.newPlayerId : ins.playerId,
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
        if (Math.random() < 0.10) {
            this.resolveFoul();
            return; // Foul interrupts the play
        }

        // Step 2: Midfield Battle (Possession)
        const homeControl = this.homeTeam.calculateLaneStrength(this.currentLane, 'possession');
        const awayControl = this.awayTeam.calculateLaneStrength(this.currentLane, 'possession');
        const homeWinsPossession = this.resolveDuel(homeControl, awayControl, 0.02, 0);

        this.possessionTeam = homeWinsPossession ? this.homeTeam : this.awayTeam;
        this.defendingTeam = homeWinsPossession ? this.awayTeam : this.homeTeam;

        // Step 3: Select Attack Type (based on attackStyle)
        const attackStyle = 0; // 当前仅支持 balanced
        const attackType = this.selectAttackType(attackStyle);

        // Calculate attack/defense power for this lane
        const attPower = this.possessionTeam.calculateLaneStrength(this.currentLane, 'attack') * 1.15;
        const defPower = this.defendingTeam.calculateLaneStrength(this.currentLane, 'defense');

        // Step 4: Attack Push (Attack vs Defense)
        // 远射跳过推进阶段
        let pushSuccess = false;
        if (attackType !== AttackType.LONG_SHOT) {
            const attackConfig = ATTACK_TYPE_CONFIG[attackType];
            pushSuccess = this.resolveDuel(attPower, defPower, attackConfig.pushK, attackConfig.pushOffset);
        }

        // Step 5: Shot attempt
        let shotResult: 'goal' | 'save' | 'blocked' | 'miss' | 'no_shot' = 'no_shot';
        let shooter: TacticalPlayer | null = null;
        let assistPlayer: TacticalPlayer | null = null;
        let finalShootRating = 0;
        let gkRating = 0;
        let shotType: ShotType = ShotType.NORMAL;

        // 远射：直接起脚，不经过推进
        if (attackType === AttackType.LONG_SHOT) {
            shooter = this.selectLongShotShooter(this.possessionTeam);
            if (shooter) {
                const player = shooter.player as Player;
                shotType = ShotType.LONG_SHOT;
                finalShootRating = this.calculateLongShotRating(player);

                const gk = this.defendingTeam.getGoalkeeper();
                gkRating = gk ? (this.defendingTeam.getSnapshot()?.gkRating || 100) : 100;

                const shotConfig = SHOT_TYPE_CONFIG[shotType];
                const isGoal = this.resolveDuel(finalShootRating, gkRating, shotConfig.k, shotConfig.offset);

                // 远射：65% 有助攻
                if (Math.random() < 0.65) {
                    assistPlayer = this.selectAssist(this.possessionTeam, shooter, 'OTHER');
                }

                shotResult = isGoal ? 'goal' : 'miss';
            }
        } else if (pushSuccess) {
            // 常规进攻：推进成功后选择射门类型
            shotType = this.selectShotType(attackType);
            shooter = this.selectShooter(this.possessionTeam);

            if (shooter) {
                const player = shooter.player as Player;

                // 根据射门类型计算评分
                switch (shotType) {
                    case ShotType.HEADER:
                        finalShootRating = this.calculateHeaderRating(player);
                        break;
                    case ShotType.ONE_ON_ONE:
                        finalShootRating = this.calculateOneOnOneRating(player);
                        break;
                    case ShotType.REBOUND:
                    case ShotType.NORMAL:
                        finalShootRating = this.calculateShootRating(player);
                        break;
                    default:
                        finalShootRating = this.calculateShootRating(player);
                }

                // 随机波动因子
                finalShootRating *= (0.6 + Math.random() * 0.5);

                const gk = this.defendingTeam.getGoalkeeper();
                gkRating = gk ? (this.defendingTeam.getSnapshot()?.gkRating || 100) : 100;

                // 根据射门类型计算成功率
                const shotConfig = SHOT_TYPE_CONFIG[shotType];
                const isGoal = this.resolveDuel(finalShootRating, gkRating, shotConfig.k, shotConfig.offset);

                // 助攻逻辑（根据射门类型）
                if (shotType === ShotType.HEADER) {
                    // 头球：100% 有助攻（来自传中）
                    assistPlayer = this.selectAssist(this.possessionTeam, shooter, 'CROSS');
                } else if (shotType === ShotType.REBOUND) {
                    // 补射：0% 助攻
                    assistPlayer = null;
                } else {
                    // 抽射/单刀：65% 有助攻
                    if (Math.random() < 0.65) {
                        assistPlayer = this.selectAssist(this.possessionTeam, shooter, 'OTHER');
                    }
                }

                // 15% 概率被封堵（产生角球）
                if (!isGoal && Math.random() < 0.15) {
                    shotResult = 'blocked';
                } else {
                    shotResult = isGoal ? 'goal' : 'save';
                }
            } else {
                shotResult = 'blocked';
            }
        }

        // Record the complete attack sequence as ONE event
        this.recordAttackSequence({
            lane: this.currentLane,
            attackType: attackType,
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
                shotType: shotType,
                shooter: shooter,
                assist: assistPlayer,
                shootRating: finalShootRating,
                gkRating: gkRating
            }
        });
    }

    private resolveFoul() {
        const foulingTeam = Math.random() < 0.5 ? this.homeTeam : this.awayTeam;
        const victimTeam = foulingTeam === this.homeTeam ? this.awayTeam : this.homeTeam;
        const playerIdx = (Math.random() * foulingTeam.players.length) | 0;
        const player = foulingTeam.players[playerIdx];
        if (!player || player.isSentOff) return;

        const p = player.player as Player;
        const roll = Math.random();

        if (roll < 0.1) {
            // Direct Red Card
            foulingTeam.sendOffPlayer(p.id);
            player.isSentOff = true;
            this.events.push({
                minute: this.time,
                type: 'red_card',
                teamName: foulingTeam.name,
                playerId: p.id,
            });
            foulingTeam.updateSnapshot();
        } else if (roll < 0.4) {
            // Yellow Card - check for second yellow
            const currentYellows = player.yellowCards || 0;
            player.yellowCards = currentYellows + 1;

            if (currentYellows >= 1) {
                // Second yellow = red card
                foulingTeam.sendOffPlayer(p.id);
                this.events.push({
                    minute: this.time,
                    type: 'red_card',
                    teamName: foulingTeam.name,
                    playerId: p.id,
                });
                foulingTeam.updateSnapshot();
            } else {
                // First yellow - also determine set piece
                this.events.push({
                    minute: this.time,
                    type: 'yellow_card',
                    teamName: foulingTeam.name,
                    playerId: p.id,
                });
                // Trigger set piece
                this.resolveSetPieceFromFoul(foulingTeam, victimTeam);
            }
        } else {
            // Just a foul - trigger set piece
            this.events.push({
                minute: this.time,
                type: 'foul',
                teamName: foulingTeam.name,
            });
            // Trigger set piece
            this.resolveSetPieceFromFoul(foulingTeam, victimTeam);
        }
    }

    /**
     * Determine and resolve set piece from foul
     * Using 'center' lane as proxy for attacking/penalty area
     */
    private resolveSetPieceFromFoul(foulingTeam: Team, victimTeam: Team): void {
        const roll = Math.random();

        // Determine set piece type based on position
        // 'center' lane is used as proxy for penalty area/attacking zone
        const isInPenaltyArea = this.currentLane === 'center';

        if (isInPenaltyArea) {
            // In attacking zone - could be penalty or indirect FK
            if (roll < 0.30) {
                // 30% chance to be a penalty in the box
                this.resolvePenalty(foulingTeam, victimTeam);
            } else {
                // 70% chance to be indirect free kick
                this.resolveIndirectFreeKick(victimTeam, foulingTeam);
            }
        } else {
            // Not in attacking zone - 65% chance to be direct free kick
            if (roll < 0.65) {
                this.resolveDirectFreeKick(victimTeam, foulingTeam);
            }
            // 35% chance nothing happens (simple foul)
        }
    }

    private recordAttackSequence(sequence: {
        lane: Lane;
        attackType: AttackType;
        midfieldBattle: { homeStrength: number; awayStrength: number; winner: 'home' | 'away' };
        attackPush: { attackPower: number; defensePower: number; success: boolean };
        shot: { result: 'goal' | 'save' | 'blocked' | 'miss'; shotType: ShotType; shooter: TacticalPlayer | null; assist: TacticalPlayer | null; shootRating: number; gkRating: number } | null;
    }) {
        const { lane, attackType, midfieldBattle, attackPush, shot } = sequence;

        // Determine overall result
        let finalResult: 'goal' | 'save' | 'blocked' | 'miss' | 'defense_stopped';
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

        // Helper to get shot type name
        const getShotTypeName = (type: ShotType): string => {
            switch (type) {
                case ShotType.HEADER: return 'header';
                case ShotType.ONE_ON_ONE: return 'one-on-one';
                case ShotType.REBOUND: return 'rebound';
                case ShotType.LONG_SHOT: return 'long-range shot';
                default: return 'shot';
        }
        };

        const possessor = midfieldBattle.winner === 'home' ? this.homeTeam.name : this.awayTeam.name;
        const defender = midfieldBattle.winner === 'home' ? this.awayTeam.name : this.homeTeam.name;

        const scoreAfterEvent = {
            home: finalResult === 'goal' && midfieldBattle.winner === 'home' ? this.homeScore + 1 : this.homeScore,
            away: finalResult === 'goal' && midfieldBattle.winner === 'away' ? this.awayScore + 1 : this.awayScore
        };

        // Build event data
        const eventData: any = {
            sequence: {
                attackType: AttackType[attackType],
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
                    shotType: ShotType[shot.shotType],
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
            data: eventData
        });

        // Trigger corner if shot was blocked
        if (finalResult === 'blocked' && shot?.shooter) {
            if (Math.random() < 0.87) {
                const cornerTeam = midfieldBattle.winner === 'home' ? this.homeTeam : this.awayTeam;
                const defendingTeam = midfieldBattle.winner === 'home' ? this.awayTeam : this.homeTeam;
                this.resolveCorner(cornerTeam, defendingTeam);
            }
        }

        // 更新统计数据
        this.updateStats(attackType, shot, finalResult);
    }

    /**
     * 更新比赛统计
     */
    private updateStats(attackType: AttackType, shot: any, result: string) {
        const attackKey = AttackType[attackType];
        this.matchStats.attackTypeStats[attackKey].attempts++;

        if (shot) {
            const shotKey = ShotType[shot.shotType];
            this.matchStats.attackTypeStats[attackKey].shots++;
            this.matchStats.shotTypeStats[shotKey].attempts++;

            if (result === 'goal') {
                this.matchStats.attackTypeStats[attackKey].goals++;
                this.matchStats.shotTypeStats[shotKey].goals++;
            } else if (result === 'save') {
                this.matchStats.shotTypeStats[shotKey].saves++;
            } else if (result === 'miss') {
                this.matchStats.shotTypeStats[shotKey].misses++;
            } else if (result === 'blocked') {
                this.matchStats.shotTypeStats[shotKey].blocks++;
            }
        }

        // 更新控球统计（每次进攻算一次控球）
        const possessionTeam = result === 'goal' || result === 'save' || result === 'blocked' || result === 'miss'
            ? this.possessionTeam.name
            : this.defendingTeam.name;
        if (possessionTeam === this.homeTeam.name) {
            this.matchStats.possessionStats.home++;
        } else {
            this.matchStats.possessionStats.away++;
        }
    }

    private selectShooter(team: Team): TacticalPlayer {
        const candidates = team.players.filter(p => !p.isSentOff);
        const len = candidates.length;

        // 射手权重：CF 40% | W 20% | AM 15% | 其他 25%
        const rand = Math.random();

        // 优先 CF（40%）
        const cfs = candidates.filter(p => p.positionKey.includes('CF'));
        if (cfs.length > 0 && rand < 0.40) {
            return cfs[(Math.random() * cfs.length) | 0];
        }

        // 其次 W（20%）
        const ws = candidates.filter(p => p.positionKey.includes('W'));
        if (ws.length > 0 && rand < 0.60) { // 0.40 + 0.20
            return ws[(Math.random() * ws.length) | 0];
        }

        // 再次 AM（15%）
        const ams = candidates.filter(p => p.positionKey.includes('AM'));
        if (ams.length > 0 && rand < 0.75) { // 0.60 + 0.15
            return ams[(Math.random() * ams.length) | 0];
        }

        // 其他位置随机（剩余 25%）
        return candidates[(Math.random() * len) | 0];
    }

    /**
     * 远射射手选择：按位置权重，不看属性
     * AM(45%) > W(25%) > CM(20%) > 其他(10%)
     */
    private selectLongShotShooter(team: Team): TacticalPlayer {
        const candidates = team.players.filter(p => !p.isSentOff && !p.positionKey.includes('GK'));

        // 优先级1：AM（45%）
        const ams = candidates.filter(p => p.positionKey.includes('AM'));
        if (ams.length > 0 && Math.random() < 0.45) {
            return ams[(Math.random() * ams.length) | 0];
        }

        // 优先级2：W（25%，在剩余55%中）
        const ws = candidates.filter(p => p.positionKey.includes('W'));
        if (ws.length > 0 && Math.random() < 0.4545) { // 0.25 / 0.55
            return ws[(Math.random() * ws.length) | 0];
        }

        // 优先级3：CM（20%，在剩余30%中）
        const cms = candidates.filter(p => p.positionKey.includes('CM'));
        if (cms.length > 0 && Math.random() < 0.6667) { // 0.20 / 0.30
            return cms[(Math.random() * cms.length) | 0];
        }

        // 优先级4：其他位置（剩余10%）
        const others = candidates.filter(p =>
            !p.positionKey.includes('AM') &&
            !p.positionKey.includes('W') &&
            !p.positionKey.includes('CM')
        );
        if (others.length > 0) {
            return others[(Math.random() * others.length) | 0];
        }

        return candidates[(Math.random() * candidates.length) | 0];
    }

    private selectAssist(team: Team, shooter: TacticalPlayer, attackType: 'CROSS' | 'OTHER' = 'OTHER'): TacticalPlayer | null {
        // Get all players except the shooter and GK
        const candidates = team.players.filter(p =>
            !p.isSentOff &&
            p !== shooter &&
            !p.positionKey.includes('GK')
        );

        if (candidates.length === 0) return null;

        // For CROSS (传中), the assister must be a wide player
        if (attackType === 'CROSS') {
            const widePlayers = candidates.filter(p =>
                p.positionKey.includes('LB') ||
                p.positionKey.includes('RB') ||
                p.positionKey.includes('WBL') ||
                p.positionKey.includes('WBR') ||
                p.positionKey.includes('LW') ||
                p.positionKey.includes('RW')
            );
            if (widePlayers.length > 0) {
                return widePlayers[(Math.random() * widePlayers.length) | 0];
            }
            // Fallback: no wide player available, no assist
            return null;
        }

        // For other attack types, prioritize midfielders and wingers
        const preferredAssisters = candidates.filter(p =>
            p.positionKey.includes('AM') ||
            p.positionKey.includes('CM') ||
            p.positionKey.includes('W') ||
            p.positionKey.includes('M')
        );

        if (preferredAssisters.length > 0 && Math.random() < 0.7) {
            return preferredAssisters[(Math.random() * preferredAssisters.length) | 0];
        }

        return candidates[(Math.random() * candidates.length) | 0];
    }

    /**
     * 根据 attackStyle 选择进攻类型
     * @param attackStyle 0=balanced (当前唯一实现)
     * @returns 进攻类型枚举
     */
    private selectAttackType(attackStyle: number = 0): AttackType {
        const distribution = ATTACK_TYPE_DISTRIBUTION[attackStyle];
        if (!distribution) {
            // 默认使用 balanced
            return AttackType.DRIBBLE;
        }

        const rand = Math.random() * 100;
        let cumulative = 0;

        for (let i = 0; i < distribution.length; i++) {
            cumulative += distribution[i];
            if (rand < cumulative) {
                return i as AttackType;
            }
        }

        return AttackType.DRIBBLE; // Fallback
    }

    /**
     * 根据进攻类型选择射门类型
     * @param attackType 进攻类型
     * @returns 射门类型
     */
    private selectShotType(attackType: AttackType): ShotType {
        const rand = Math.random() * 100;

        switch (attackType) {
            case AttackType.CROSS:
                // 传中：头球 50%，抽射 30%，补射 20%
                if (rand < 50) return ShotType.HEADER;
                if (rand < 80) return ShotType.NORMAL;
                return ShotType.REBOUND;

            case AttackType.SHORT_PASS:
                // 短传配合：抽射 80%，补射 20%
                return rand < 80 ? ShotType.NORMAL : ShotType.REBOUND;

            case AttackType.THROUGH_PASS:
                // 直塞：单刀 50%，抽射 50%
                return rand < 50 ? ShotType.ONE_ON_ONE : ShotType.NORMAL;

            case AttackType.DRIBBLE:
                // 突破：抽射 70%，补射 30%
                return rand < 70 ? ShotType.NORMAL : ShotType.REBOUND;

            case AttackType.LONG_SHOT:
                return ShotType.LONG_SHOT;

            default:
                return ShotType.NORMAL;
        }
    }

    /**
     * 计算头球评分
     * 头球评分 = strength×5 + positioning×3 + finishing×2
     */
    private calculateHeaderRating(player: Player): number {
        const attrs = player.attributes;
        return (
            (attrs.strength ?? 10) * 5 +
            (attrs.positioning ?? 10) * 3 +
            (attrs.finishing ?? 10) * 2
        );
    }

    /**
     * 计算抽射评分（禁区内常规射门）
     * 抽射评分 = finishing×4 + composure×3 + positioning×2 + strength×1
     */
    private calculateShootRating(player: Player): number {
        const attrs = player.attributes;
        return (
            (attrs.finishing ?? 10) * 4 +
            (attrs.composure ?? 10) * 3 +
            (attrs.positioning ?? 10) * 2 +
            (attrs.strength ?? 10) * 1
        );
    }

    /**
     * 计算单刀球评分
     * 单刀评分 = finishing×5 + composure×3 + pace×2
     */
    private calculateOneOnOneRating(player: Player): number {
        const attrs = player.attributes;
        return (
            (attrs.finishing ?? 10) * 5 +
            (attrs.composure ?? 10) * 3 +
            (attrs.pace ?? 10) * 2
        );
    }

    /**
     * 计算远射评分
     * 远射评分 = finishing×0.6 + composure×0.3 + strength×0.1
     * 距离因子（18-30米）会影响最终评分
     */
    private calculateLongShotRating(player: Player): number {
        const attrs = player.attributes;

        // 基础评分
        const baseRating = (
            (attrs.finishing ?? 10) * 0.6 +
            (attrs.composure ?? 10) * 0.3 +
            (attrs.strength ?? 10) * 0.1
        );

        // 距离因子（越远越难）
        const minDistance = 18;
        const maxDistance = 30;
        const distance = minDistance + Math.random() * (maxDistance - minDistance);
        const distanceFactor = 1 - (distance - minDistance) / 50;

        return baseRating * distanceFactor;
    }

    private resolveDuel(valA: number, valB: number, k: number, offset: number): boolean {
        // 属性差距系数：让 4 点属性差距不会导致进球数差距过大
        // 除以 1.5 来降低属性差距对结果的影响
        const diff = (valA - valB - offset) / 1.5;
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

    // ==================== SET PIECE METHODS ====================

    /**
     * Resolve a corner kick
     * Formula: P = 1 / (1 + exp(-diff × 0.15 + 2.3))
     * Attack = avgFK×0.7 + kickerFK×0.5
     * Defense = opponentAvgFK×0.6 + GKRating×0.2
     * When skills equal (avg=10, kicker≈11.7, diff≈5): P ≈ 18%
     */
    private resolveCorner(attackingTeam: Team, defendingTeam: Team): void {
        const avgFK = attackingTeam.getAvgFreeKicks();
        const kicker = attackingTeam.getBestSetPieceTaker('corner');
        const opponentAvgFK = defendingTeam.getAvgFreeKicks();
        const gkRating = defendingTeam.getGoalkeeperSetPieceRating();

        if (!kicker) return;

        const attackScore = avgFK * 0.7 + (kicker.player as Player).attributes.freeKicks * 0.5;
        const defenseScore = opponentAvgFK * 0.6 + gkRating * 0.2;
        const diff = attackScore - defenseScore;
        const probability = 1 / (1 + Math.exp(-diff * 0.15 + 2.2));
        const isGoal = Math.random() < probability;

        const kickerPlayer = kicker.player as Player;

        this.events.push({
            minute: this.time,
            type: isGoal ? 'goal' : 'corner',
            teamName: attackingTeam.name,
            playerId: kickerPlayer.id,
            data: {
                setPieceType: 'corner',
                attackScore: parseFloat(attackScore.toFixed(2)),
                defenseScore: parseFloat(defenseScore.toFixed(2)),
                probability: parseFloat(probability.toFixed(2)),
                result: isGoal ? 'goal' : 'save'
            }
        });

        if (isGoal) {
            if (attackingTeam === this.homeTeam) this.homeScore++;
            else this.awayScore++;
        }

        // Update stats (use team name as ID for now, should use teamId)
        const teamId = attackingTeam.name; // TODO: Use actual team ID
        this.updateSetPieceStats(teamId, 'corner');
    }

    /**
     * Resolve an indirect free kick (free kick that requires a touch)
     * Formula: P = 1 / (1 + exp(-diff × 0.15 + 2.3))
     * Attack = avgFK×0.6 + kickerFK×0.6
     * Defense = opponentAvgFK×0.6 + GKRating×0.2
     * When skills equal (avg=10, kicker≈11.7, diff≈5): P ≈ 18%
     */
    private resolveIndirectFreeKick(attackingTeam: Team, defendingTeam: Team): void {
        const avgFK = attackingTeam.getAvgFreeKicks();
        const kicker = attackingTeam.getBestSetPieceTaker('free_kick');
        const opponentAvgFK = defendingTeam.getAvgFreeKicks();
        const gkRating = defendingTeam.getGoalkeeperSetPieceRating();

        if (!kicker) return;

        const attackScore = avgFK * 0.6 + (kicker.player as Player).attributes.freeKicks * 0.6;
        const defenseScore = opponentAvgFK * 0.6 + gkRating * 0.2;
        const diff = attackScore - defenseScore;
        const probability = 1 / (1 + Math.exp(-diff * 0.15 + 2.3));

        const isGoal = Math.random() < probability;

        const kickerPlayer = kicker.player as Player;

        this.events.push({
            minute: this.time,
            type: isGoal ? 'goal' : 'free_kick',
            teamName: attackingTeam.name,
            playerId: kickerPlayer.id,
            data: {
                setPieceType: 'indirect_free_kick',
                attackScore: parseFloat(attackScore.toFixed(2)),
                defenseScore: parseFloat(defenseScore.toFixed(2)),
                probability: parseFloat(probability.toFixed(2)),
                result: isGoal ? 'goal' : 'save'
            }
        });

        if (isGoal) {
            if (attackingTeam === this.homeTeam) this.homeScore++;
            else this.awayScore++;
        }

        // Update stats
        const teamId = attackingTeam.name;
        this.updateSetPieceStats(teamId, 'indirect_fk');
    }

    /**
     * Resolve a direct free kick (shoot directly on goal)
     * Formula: P = 1 / (1 + exp(-diff × 0.15 + 2.3))
     * Attack = kickerFK×1.0 + kickerComp×0.5
     * Defense = GKref×0.6 + GKhand×0.4 + GKcomp×0.4
     * When skills equal (avg=10, kicker≈11.7, diff≈5): P ≈ 18%
     */
    private resolveDirectFreeKick(attackingTeam: Team, defendingTeam: Team): void {
        const kicker = attackingTeam.getBestSetPieceTaker('free_kick');
        const gk = defendingTeam.getGoalkeeper();

        if (!kicker || !gk) return;

        const kickerP = kicker.player as Player;
        const gkP = gk.player as Player;

        const attackScore = (kickerP.attributes.freeKicks ?? 10) * 1.0 + (kickerP.attributes.composure ?? 10) * 0.5;
        const defenseScore = (gkP.attributes.gk_reflexes ?? 10) * 0.6 +
                            (gkP.attributes.gk_handling ?? 10) * 0.4 +
                            (gkP.attributes.composure ?? 10) * 0.4;
        const diff = attackScore - defenseScore;
        const probability = 1 / (1 + Math.exp(-diff * 0.15 + 2.2));
        const isGoal = Math.random() < probability;

        this.events.push({
            minute: this.time,
            type: isGoal ? 'goal' : 'free_kick',
            teamName: attackingTeam.name,
            playerId: kickerP.id,
            data: {
                setPieceType: 'direct_free_kick',
                attackScore: parseFloat(attackScore.toFixed(2)),
                defenseScore: parseFloat(defenseScore.toFixed(2)),
                probability: parseFloat(probability.toFixed(2)),
                result: isGoal ? 'goal' : 'save'
            }
        });

        if (isGoal) {
            if (attackingTeam === this.homeTeam) this.homeScore++;
            else this.awayScore++;
        }

        // Update stats
        const teamId = attackingTeam.name;
        this.updateSetPieceStats(teamId, 'direct_fk');
    }

    /**
     * Resolve a penalty kick
     * Formula: P = 1 / (1 + exp(-diff × 0.12 - 0.9))
     * Attack = kickerPen×1.2 + kickerComp×0.5
     * Defense = GKref×0.8 + GKhand×0.6 + GKcomp×0.4
     * When skills equal (avg=10, diff≈0): P ≈ 72%
     */
    private resolvePenalty(foulingTeam: Team, attackingTeam: Team): void {
        const kicker = attackingTeam.getBestSetPieceTaker('penalty');
        const gk = foulingTeam.getGoalkeeper();

        if (!kicker || !gk) return;

        const kickerP = kicker.player as Player;
        const gkP = gk.player as Player;

        const attackScore = (kickerP.attributes.penalties ?? 10) * 1.2 + (kickerP.attributes.composure ?? 10) * 0.5;
        const defenseScore = (gkP.attributes.gk_reflexes ?? 10) * 0.8 +
                            (gkP.attributes.gk_handling ?? 10) * 0.6 +
                            (gkP.attributes.composure ?? 10) * 0.4;
        const diff = attackScore - defenseScore;
        const probability = 1 / (1 + Math.exp(-diff * 0.12 - 0.9));
        const isGoal = Math.random() < probability;

        this.events.push({
            minute: this.time,
            type: isGoal ? 'goal' : 'penalty_miss',
            teamName: attackingTeam.name,
            playerId: kickerP.id,
            data: {
                setPieceType: 'penalty',
                attackScore: parseFloat(attackScore.toFixed(2)),
                defenseScore: parseFloat(defenseScore.toFixed(2)),
                probability: parseFloat(probability.toFixed(2)),
                result: isGoal ? 'goal' : 'save'
            }
        });

        if (isGoal) {
            if (attackingTeam === this.homeTeam) this.homeScore++;
            else this.awayScore++;
        }

        // Update stats
        const teamId = attackingTeam.name;
        this.updateSetPieceStats(teamId, 'penalty');
    }

    // ==================== SET PIECE STATS ====================

    private setPieceStats: Map<string, { corners: number; freeKicks: number; indirectFreeKicks: number; penalties: number }> = new Map();

    private updateSetPieceStats(teamId: string, type: 'corner' | 'direct_fk' | 'indirect_fk' | 'penalty'): void {
        const stats = this.setPieceStats.get(teamId) || { corners: 0, freeKicks: 0, indirectFreeKicks: 0, penalties: 0 };
        switch (type) {
            case 'corner': stats.corners++; break;
            case 'direct_fk': stats.freeKicks++; break;
            case 'indirect_fk': stats.indirectFreeKicks++; break;
            case 'penalty': stats.penalties++; break;
        }
        this.setPieceStats.set(teamId, stats);
    }

    getSetPieceStats(): Map<string, { corners: number; freeKicks: number; indirectFreeKicks: number; penalties: number }> {
        return this.setPieceStats;
    }
}

