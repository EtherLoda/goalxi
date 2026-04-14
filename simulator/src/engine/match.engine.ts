import { Team } from './classes/Team';
import {
  Lane,
  TacticalPlayer,
  TacticalInstruction,
  ScoreStatus,
  AttackType,
  ShotType,
  TeamSnapshot,
} from './types/simulation.types';
import { AttributeCalculator } from './utils/attribute-calculator';
import { ConditionSystem } from './systems/condition.system';
import { InjurySystem, InjuryEventData } from './systems/injury.system';
import { Player, PlayerAbility } from '../types/player.types';
import { BenchConfig, calculatePositionFit } from '@goalxi/database';

// ---------- Ability Helper ----------
const hasAbility = (
  player: Player | undefined,
  ability: PlayerAbility,
): boolean => {
  return (
    Array.isArray(player?.attributes?.abilities) &&
    player.attributes.abilities.includes(ability)
  );
};

// 三条路的进攻方式分布配置（平均值 ≈ 1.0）
// 索引顺序: 0=传中, 1=短传, 2=直塞, 3=突破, 4=远射
const WEATHER_ATTACK_WEIGHTS: Record<string, number[]> = {
  sunny: [1.05, 0.95, 1.0, 1.1, 1.1],
  cloudy: [1.0, 1.0, 1.0, 1.0, 1.0],
  rainy: [0.9, 0.95, 0.85, 1.15, 0.8],
  heavy_rain: [0.7, 0.8, 0.7, 1.2, 0.6],
  windy: [1.2, 0.95, 1.0, 1.0, 1.25],
  foggy: [0.9, 0.9, 0.6, 1.05, 0.7],
  snowy: [1.15, 0.9, 0.8, 0.9, 0.75],
};

// 三条路的进攻方式分布配置（balanced模式）
// 索引顺序: 0=传中, 1=短传, 2=直塞, 3=突破, 4=远射
const LANE_ATTACK_DISTRIBUTION: Record<string, number[]> = {
  left: [25, 30, 10, 30, 5], // 边路：短传/带球为主，传中次之
  right: [25, 30, 10, 30, 5], // 边路：短传/带球为主，传中次之
  center: [5, 45, 15, 25, 10], // 中路：短传为主
};

// 进攻类型配置（推进参数）
// pushOffset 为正时增加进攻难度，目标推进成功率约 50%
const ATTACK_TYPE_CONFIG: Record<
  AttackType,
  { pushK: number; pushOffset: number }
> = {
  [AttackType.CROSS]: { pushK: 3.5, pushOffset: -7 },
  [AttackType.SHORT_PASS]: { pushK: 3.5, pushOffset: -7 },
  [AttackType.THROUGH_PASS]: { pushK: 3.5, pushOffset: -7 },
  [AttackType.DRIBBLE]: { pushK: 3.5, pushOffset: -7 },
  [AttackType.LONG_SHOT]: { pushK: 0, pushOffset: 0 }, // 远射不经过推进阶段
};

// 射门类型配置
// 新公式: P = 1 / (1 + exp(-(ratio - 1 - offset/100) * k))
// 射门公式用k=2.2，让ratio=2时约90%
// 目标进球率: 单刀 ~60%, 头球 ~50%, 补射 ~50%, 抽射 ~38%, 远射 ~22%
const SHOT_TYPE_CONFIG: Record<ShotType, { k: number; offset: number }> = {
  [ShotType.ONE_ON_ONE]: { k: 1.5, offset: 0 }, // ratio=1→50%, ratio=2→82%
  [ShotType.HEADER]: { k: 1.5, offset: 0 }, // ratio=1→50%, ratio=2→82%
  [ShotType.REBOUND]: { k: 1.5, offset: 0 }, // ratio=1→50%, ratio=2→82%
  [ShotType.NORMAL]: { k: 1.5, offset: 0 }, // ratio=1→50%, ratio=2→82%
  [ShotType.LONG_SHOT]: { k: 1.5, offset: 0 }, // ratio=1→50%, ratio=2→82%
};

/**
 * Map position keys to bench config keys
 * FB = Fullback (covers LB/RB/WBL/WBR)
 * W = Winger (covers LW/RW/LM/RM)
 * CM = Central Midfield (covers AM/CM/DM all left/center/right variants)
 */
const POSITION_TO_BENCH_KEY: Record<string, keyof BenchConfig> = {
  // Goalkeeper
  GK: 'goalkeeper',
  // Center Back (3 positions)
  CDL: 'centerBack',
  CD: 'centerBack',
  CDR: 'centerBack',
  // Fullback (4 positions: LB, RB, WBL, WBR)
  LB: 'fullback',
  RB: 'fullback',
  WBL: 'fullback',
  WBR: 'fullback',
  // Winger (4 positions: LW, RW, LM, RM)
  LW: 'winger',
  RW: 'winger',
  LM: 'winger',
  RM: 'winger',
  // Central Midfield (9 positions: AM/CM/DM x left/center/right)
  AML: 'centralMidfield',
  AM: 'centralMidfield',
  AMR: 'centralMidfield',
  CML: 'centralMidfield',
  CM: 'centralMidfield',
  CMR: 'centralMidfield',
  DML: 'centralMidfield',
  DM: 'centralMidfield',
  DMR: 'centralMidfield',
  // Forward (3 positions)
  CFL: 'forward',
  CF: 'forward',
  CFR: 'forward',
};

// ==================== STAR RATING HELPERS ====================
// Thresholds for all players (0-100 scale contribution)
const STAR_THRESHOLDS = [
  { threshold: 95, stars: 5.0 },
  { threshold: 85, stars: 4.5 },
  { threshold: 75, stars: 4.0 },
  { threshold: 65, stars: 3.5 },
  { threshold: 50, stars: 3.0 },
  { threshold: 40, stars: 2.5 },
  { threshold: 30, stars: 2.0 },
  { threshold: 22, stars: 1.5 },
  { threshold: 14, stars: 1.0 },
  { threshold: 0, stars: 0.5 },
];

function contributionToStars(contribution: number): number {
  let stars = 0.5;
  for (const { threshold, stars: s } of STAR_THRESHOLDS) {
    if (contribution >= threshold) {
      stars = s;
      break;
    }
  }
  // 向上取整到0.5星: 3.2→3.5, 3.7→4.0
  return Math.ceil(stars * 2) / 2;
}

export interface MatchEvent {
  minute: number;
  type:
    | 'goal'
    | 'miss'
    | 'save'
    | 'turnover'
    | 'advance'
    | 'snapshot'
    | 'shot'
    | 'corner'
    | 'foul'
    | 'yellow_card'
    | 'red_card'
    | 'offside'
    | 'substitution'
    | 'injury'
    | 'penalty_goal'
    | 'penalty_miss'
    | 'kickoff'
    | 'half_time'
    | 'second_half'
    | 'full_time'
    | 'tactical_change'
    | 'attack_sequence'
    | 'free_kick';
  teamName?: string;
  teamId?: string;
  playerId?: string;
  relatedPlayerId?: string; // For assists, second yellow cards, etc.
  phase?: string;
  lane?: string;
  data?: Record<string, any>;
  eventScheduledTime?: Date; // Real-world time when this event should be revealed (calculated by processor)
}

export class MatchEngine {
  private time: number = 0;
  private events: MatchEvent[] = [];
  public homeScore: number = 0;
  public awayScore: number = 0;

  private possessionTeam: Team;
  private defendingTeam: Team;
  private freshPossession: boolean = false; // 刚获得球权，第一次进攻享受反击加成

  private currentLane: Lane = 'center';
  private knownPlayerIds: Set<string> = new Set();

  // 比赛统计
  private matchStats: {
    attackTypeStats: Record<
      string,
      { attempts: number; goals: number; shots: number }
    >;
    shotTypeStats: Record<
      string,
      {
        attempts: number;
        goals: number;
        saves: number;
        misses: number;
        blocks: number;
      }
    >;
    possessionStats: { home: number; away: number };
  };

  // 球员比赛数据统计
  private playerMatchStats: Map<
    string,
    {
      goals: number;
      assists: number;
      tackles: number; // 抢断成功次数
      appearances: number; // 出场次数（用于判断是否上场）
      minutesPlayed: number;
      contributionSum: number; // 累计贡献值（用于计算平均值）
      contributionCount: number; // 贡献值记录次数
      starsSum: number; // 累计星级
    }
  > = new Map();

  // 球员贡献历史（用于计算平均值）
  private playerContributionHistory: Map<
    string,
    Array<{ minute: number; contribution: number; stars: number }>
  > = new Map();

  // 双方 lane strength 历史（用于计算平均值）
  private laneStrengthHistory: {
    home: Array<{
      minute: number;
      laneStrengths: TeamSnapshot['laneStrengths'];
    }>;
    away: Array<{
      minute: number;
      laneStrengths: TeamSnapshot['laneStrengths'];
    }>;
  } = { home: [], away: [] };

  constructor(
    public homeTeam: Team,
    public awayTeam: Team,
    private homeInstructions: TacticalInstruction[] = [],
    private awayInstructions: TacticalInstruction[] = [],
    private substitutePlayers: Map<string, TacticalPlayer> = new Map(), // All potential subs mapped by ID
    private homeBenchConfig: BenchConfig | null = null,
    private awayBenchConfig: BenchConfig | null = null,
    private weather: string = 'cloudy', // Default weather
  ) {
    this.possessionTeam = homeTeam;
    this.defendingTeam = awayTeam;

    // Register starting lineups and initialize player stats
    [...homeTeam.players, ...awayTeam.players].forEach((p) => {
      const player = p.player as Player;
      this.knownPlayerIds.add(player.id);
      this.playerMatchStats.set(player.id, {
        goals: 0,
        assists: 0,
        tackles: 0,
        appearances: 1, // Starting players have 1 appearance
        minutesPlayed: 0,
        contributionSum: 0,
        contributionCount: 0,
        starsSum: 0,
      });
      this.playerContributionHistory.set(player.id, []);
    });

    // 初始化比赛统计
    this.matchStats = {
      attackTypeStats: {},
      shotTypeStats: {},
      possessionStats: { home: 0, away: 0 },
    };

    // 初始化攻击类型统计（只使用字符串键）
    Object.keys(AttackType).forEach((key) => {
      if (isNaN(Number(key))) {
        this.matchStats.attackTypeStats[key] = {
          attempts: 0,
          goals: 0,
          shots: 0,
        };
      }
    });

    // 初始化射门类型统计（只使用字符串键）
    Object.keys(ShotType).forEach((key) => {
      if (isNaN(Number(key))) {
        this.matchStats.shotTypeStats[key] = {
          attempts: 0,
          goals: 0,
          saves: 0,
          misses: 0,
          blocks: 0,
        };
      }
    });
  }

  /**
   * Get substitute player for a specific position
   */
  private getSubstituteForPosition(
    team: Team,
    benchConfig: BenchConfig | null,
    positionKey: string,
  ): TacticalPlayer | null {
    if (!benchConfig) return null;

    const benchKey = POSITION_TO_BENCH_KEY[positionKey];
    if (!benchKey) return null;

    const subPlayerId = benchConfig[benchKey];
    if (!subPlayerId) return null;

    // Look up in substitutePlayers map first
    const subPlayer = this.substitutePlayers.get(subPlayerId);
    if (subPlayer) return subPlayer;

    // Fallback: search in team players (shouldn't happen normally)
    return (
      team.players.find((p) => (p.player as Player).id === subPlayerId) || null
    );
  }

  public simulateMatch(): MatchEvent[] {
    // 清除属性计算缓存，确保每次模拟从零开始
    AttributeCalculator.clearCache();

    this.events = [];
    this.time = 0;
    this.freshPossession = false;

    // KICKOFF Event
    this.events.push({
      minute: 0,
      type: 'kickoff',
      data: {
        homeTeam: this.homeTeam.name,
        awayTeam: this.awayTeam.name,
      },
    });

    this.events.push({
      minute: 0,
      type: 'kickoff',
      teamName: this.homeTeam.name,
    });

    this.events.push({
      minute: 0,
      type: 'kickoff',
      teamName: this.awayTeam.name,
    });

    const MOMENTS_COUNT = 20;

    // Initial Snapshot
    this.homeTeam.updateSnapshot(0);
    this.awayTeam.updateSnapshot(0);
    this.generateSnapshotEvent(0);

    // Pre-calculate moment times to maintain original pacing (approx 20 moments)
    const momentTimes = new Set<number>();
    for (let i = 0; i < MOMENTS_COUNT; i++) {
      let nextTime =
        ((i * 90) / MOMENTS_COUNT + (Math.random() * 90) / MOMENTS_COUNT) | 0;
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
          data: { period: 'half_time' },
        });

        this.events.push({
          minute: 46,
          type: 'second_half',
          data: {
            period: 'second_half',
            homeScore: this.homeScore,
            awayScore: this.awayScore,
          },
        });
      }

      // 1. Process Tactical Instructions
      this.processTacticalInstructions(t);

      // 2. Update Condition (Stamina Decay & Recovery)
      const isHTStart = t === 46;
      this.homeTeam.updateCondition(1, isHTStart);
      this.awayTeam.updateCondition(1, isHTStart);

      // 3. Generate Snapshot (Every 5 mins, 45, 46, 90)
      const isSnapshotMinute = t % 5 === 0 || t === 45 || t === 46 || t === 90;
      if (isSnapshotMinute) {
        this.homeTeam.updateSnapshot(t);
        this.awayTeam.updateSnapshot(t);
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
        awayScore: this.awayScore,
      },
    });

    // Finalize player minutes played
    this.finalizePlayerMinutes(90);

    return this.events;
  }

  public simulateExtraTime(): MatchEvent[] {
    // Extra Time Setup (30 mins = ~7 moments)
    const MOMENTS_COUNT = 7;

    // Update Snapshot for start of ET
    this.homeTeam.updateSnapshot(90);
    this.awayTeam.updateSnapshot(90);
    this.generateSnapshotEvent(90);

    // Pre-calculate moment times for ET (approx 7 moments)
    const momentTimes = new Set<number>();
    for (let i = 0; i < MOMENTS_COUNT; i++) {
      let nextTime =
        (90 +
          ((i * 30) / MOMENTS_COUNT + (Math.random() * 30) / MOMENTS_COUNT)) |
        0;
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
          data: {
            period: 'extra_time',
            homeScore: this.homeScore,
            awayScore: this.awayScore,
          },
        });
      }
      if (t === 106) {
        this.events.push({
          minute: 105,
          type: 'kickoff',
          data: {
            period: 'extra_time_second_half',
            homeScore: this.homeScore,
            awayScore: this.awayScore,
          },
        });
      }

      // 1. Process Tactical Instructions
      this.processTacticalInstructions(t);

      // 2. Update Condition
      const isPeriodStart = t === 91 || t === 106;
      this.homeTeam.updateCondition(1, isPeriodStart);
      this.awayTeam.updateCondition(1, isPeriodStart);

      // 3. Snapshot (95, 100, 105, 110, 115, 120)
      const isSnapshotMinute = t % 5 === 0 || t === 105 || t === 120;
      if (isSnapshotMinute) {
        this.homeTeam.updateSnapshot(t);
        this.awayTeam.updateSnapshot(t);
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
        awayScore: this.awayScore,
      },
    });

    // Finalize player minutes played
    this.finalizePlayerMinutes(120);

    return this.events;
  }

  public simulatePenaltyShootout(): MatchEvent[] {
    let homePKScore = 0;
    let awayPKScore = 0;
    let round = 1;

    const homeKickers = this.homeTeam.players.filter((p) => !p.isSentOff);
    const awayKickers = this.awayTeam.players.filter((p) => !p.isSentOff);
    const homeGK = this.homeTeam.getGoalkeeper();
    const awayGK = this.awayTeam.getGoalkeeper();

    const getPenaltyScore = (
      player: Player,
      multiplier: number,
      isGK: boolean,
    ) => {
      const attrs = player.attributes;
      if (isGK) {
        return (attrs.gk_reflexes * 0.7 + attrs.composure * 0.3) * multiplier;
      } else {
        return (attrs.finishing * 0.3 + attrs.composure * 0.7) * multiplier;
      }
    };

    const resolvePenalty = (
      kicker: TacticalPlayer,
      keeper: TacticalPlayer | undefined,
    ): boolean => {
      if (!keeper) return true;
      const kPlayer = kicker.player as Player;
      const gPlayer = keeper.player as Player;

      const kMultiplier = ConditionSystem.calculatePenaltyMultiplier(
        kPlayer.form,
        kPlayer.experience,
      );
      let gMultiplier = ConditionSystem.calculatePenaltyMultiplier(
        gPlayer.form,
        gPlayer.experience,
      );

      // penalty_saver: 扑点球时扑救率 +10%
      if (hasAbility(gPlayer, 'penalty_saver')) {
        gMultiplier *= 1.1;
      }

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
      if (this.isShootoutDecided(homePKScore, awayPKScore, 5, round, true))
        break;

      // Away team kicks
      const aKicker = awayKickers[(round - 1) % awayKickers.length];
      const aGoal = resolvePenalty(aKicker, homeGK);
      if (aGoal) awayPKScore++;
      this.recordPenaltyEvent(aKicker, aGoal, homePKScore, awayPKScore);

      // Check if decided
      if (this.isShootoutDecided(homePKScore, awayPKScore, 5, round, false))
        break;
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
      data: { homeScore: homePKScore, awayScore: awayPKScore, isPenalty: true },
    });

    return this.events;
  }

  /**
   * 获取比赛统计数据
   */
  public getMatchStats() {
    const totalAttacks = Object.values(this.matchStats.attackTypeStats).reduce(
      (sum, s) => sum + s.attempts,
      0,
    );
    const totalShots = Object.values(this.matchStats.shotTypeStats).reduce(
      (sum, s) => sum + s.attempts,
      0,
    );
    const totalPossession =
      this.matchStats.possessionStats.home +
      this.matchStats.possessionStats.away;

    return {
      // 进攻类型统计
      attackTypeStats: Object.entries(this.matchStats.attackTypeStats).map(
        ([type, stats]) => ({
          type,
          attempts: stats.attempts,
          attemptsPercent:
            totalAttacks > 0
              ? ((stats.attempts / totalAttacks) * 100).toFixed(1) + '%'
              : '0%',
          shots: stats.shots,
          shotPercent:
            stats.attempts > 0
              ? ((stats.shots / stats.attempts) * 100).toFixed(1) + '%'
              : '0%',
          goals: stats.goals,
          goalRate:
            stats.shots > 0
              ? ((stats.goals / stats.shots) * 100).toFixed(1) + '%'
              : '0%',
        }),
      ),
      // 射门类型统计
      shotTypeStats: Object.entries(this.matchStats.shotTypeStats).map(
        ([type, stats]) => ({
          type,
          attempts: stats.attempts,
          attemptsPercent:
            totalShots > 0
              ? ((stats.attempts / totalShots) * 100).toFixed(1) + '%'
              : '0%',
          goals: stats.goals,
          goalRate:
            stats.attempts > 0
              ? ((stats.goals / stats.attempts) * 100).toFixed(1) + '%'
              : '0%',
          saves: stats.saves,
          saveRate:
            stats.attempts > 0
              ? ((stats.saves / stats.attempts) * 100).toFixed(1) + '%'
              : '0%',
          misses: stats.misses,
          missRate:
            stats.attempts > 0
              ? ((stats.misses / stats.attempts) * 100).toFixed(1) + '%'
              : '0%',
          blocks: stats.blocks,
          blockRate:
            stats.attempts > 0
              ? ((stats.blocks / stats.attempts) * 100).toFixed(1) + '%'
              : '0%',
        }),
      ),
      // 控球统计
      possessionStats: {
        home: this.matchStats.possessionStats.home,
        away: this.matchStats.possessionStats.away,
        homePercent:
          totalPossession > 0
            ? (
                (this.matchStats.possessionStats.home / totalPossession) *
                100
              ).toFixed(1) + '%'
            : '0%',
        awayPercent:
          totalPossession > 0
            ? (
                (this.matchStats.possessionStats.away / totalPossession) *
                100
              ).toFixed(1) + '%'
            : '0%',
      },
      summary: {
        totalAttacks,
        totalShots,
        totalGoals: this.homeScore + this.awayScore,
        homeScore: this.homeScore,
        awayScore: this.awayScore,
      },
    };
  }

  /**
   * Finalize minutes played for all players at end of match
   */
  private finalizePlayerMinutes(finalMinute: number) {
    // Update all players who were on the field
    for (const [playerId, stats] of this.playerMatchStats.entries()) {
      if (stats.appearances > 0 && stats.minutesPlayed === 0) {
        // Player was on field but no minutes tracked yet (substituted in)
        // This is handled at substitution time, but handle edge case
        const player = this.findPlayerById(playerId);
        if (player) {
          const entryMinute = player.entryMinute || 0;
          stats.minutesPlayed = finalMinute - entryMinute;
        }
      }
    }

    // Update starting players who played full match
    for (const team of [this.homeTeam, this.awayTeam]) {
      for (const tp of team.players) {
        const playerId = (tp.player as Player).id;
        const stats = this.playerMatchStats.get(playerId);
        if (stats && stats.appearances > 0 && stats.minutesPlayed === 0) {
          // Starting player who went the full 90/120
          stats.minutesPlayed = finalMinute;
        }
      }
    }
  }

  /**
   * Find player by ID across all teams
   */
  private findPlayerById(playerId: string): TacticalPlayer | undefined {
    for (const team of [this.homeTeam, this.awayTeam]) {
      const found = team.players.find(
        (p) => (p.player as Player).id === playerId,
      );
      if (found) return found;
    }
    for (const [, sub] of this.substitutePlayers) {
      if ((sub.player as Player).id === playerId) return sub;
    }
    return undefined;
  }

  /**
   * Get player match stats for all players in the match
   */
  public getPlayerMatchStats(): Array<{
    playerId: string;
    playerName: string;
    teamName: string;
    position: string;
    goals: number;
    assists: number;
    tackles: number;
    appearances: number;
    minutesPlayed: number;
    avgContribution: number;
    avgStars: number;
  }> {
    const result: Array<{
      playerId: string;
      playerName: string;
      teamName: string;
      position: string;
      goals: number;
      assists: number;
      tackles: number;
      appearances: number;
      minutesPlayed: number;
      avgContribution: number;
      avgStars: number;
    }> = [];

    for (const team of [this.homeTeam, this.awayTeam]) {
      for (const tp of team.players) {
        const player = tp.player as Player;
        const stats = this.playerMatchStats.get(player.id);
        const history = this.playerContributionHistory.get(player.id);
        if (
          stats &&
          (stats.goals > 0 ||
            stats.assists > 0 ||
            stats.tackles > 0 ||
            stats.minutesPlayed > 0)
        ) {
          // Calculate averages from history
          let avgContribution = 0;
          let avgStars = 0;
          if (history && history.length > 0) {
            const totalContribution = history.reduce(
              (sum, h) => sum + h.contribution,
              0,
            );
            const totalStars = history.reduce((sum, h) => sum + h.stars, 0);
            avgContribution = parseFloat(
              (totalContribution / history.length).toFixed(1),
            );
            avgStars = parseFloat((totalStars / history.length).toFixed(2));
          }

          result.push({
            playerId: player.id,
            playerName: player.name,
            teamName: team.name,
            position: tp.positionKey,
            goals: stats.goals,
            assists: stats.assists,
            tackles: stats.tackles,
            appearances: stats.appearances,
            minutesPlayed: stats.minutesPlayed,
            avgContribution,
            avgStars,
          });
        }
      }
    }

    return result;
  }

  /**
   * Get lane strength averages for the match
   */
  public getLaneStrengthAverages(): {
    home: {
      left: { attack: number; defense: number; possession: number };
      center: { attack: number; defense: number; possession: number };
      right: { attack: number; defense: number; possession: number };
    };
    away: {
      left: { attack: number; defense: number; possession: number };
      center: { attack: number; defense: number; possession: number };
      right: { attack: number; defense: number; possession: number };
    };
  } {
    const avgLaneStrength = (
      history: Array<{
        minute: number;
        laneStrengths: TeamSnapshot['laneStrengths'];
      }>,
    ) => {
      if (history.length === 0) {
        return {
          left: { attack: 0, defense: 0, possession: 0 },
          center: { attack: 0, defense: 0, possession: 0 },
          right: { attack: 0, defense: 0, possession: 0 },
        };
      }

      const totals = {
        left: { attack: 0, defense: 0, possession: 0 },
        center: { attack: 0, defense: 0, possession: 0 },
        right: { attack: 0, defense: 0, possession: 0 },
      };

      for (const snapshot of history) {
        for (const lane of ['left', 'center', 'right'] as const) {
          totals[lane].attack += snapshot.laneStrengths[lane].attack;
          totals[lane].defense += snapshot.laneStrengths[lane].defense;
          totals[lane].possession += snapshot.laneStrengths[lane].possession;
        }
      }

      const count = history.length;
      return {
        left: {
          attack: parseFloat((totals.left.attack / count).toFixed(2)),
          defense: parseFloat((totals.left.defense / count).toFixed(2)),
          possession: parseFloat((totals.left.possession / count).toFixed(2)),
        },
        center: {
          attack: parseFloat((totals.center.attack / count).toFixed(2)),
          defense: parseFloat((totals.center.defense / count).toFixed(2)),
          possession: parseFloat((totals.center.possession / count).toFixed(2)),
        },
        right: {
          attack: parseFloat((totals.right.attack / count).toFixed(2)),
          defense: parseFloat((totals.right.defense / count).toFixed(2)),
          possession: parseFloat((totals.right.possession / count).toFixed(2)),
        },
      };
    };

    return {
      home: avgLaneStrength(this.laneStrengthHistory.home),
      away: avgLaneStrength(this.laneStrengthHistory.away),
    };
  }

  /**
   * Get complete match report with all details
   */
  public getMatchReport(): {
    matchInfo: {
      homeTeam: string;
      awayTeam: string;
      homeScore: number;
      awayScore: number;
    };
    playerStats: ReturnType<MatchEngine['getPlayerMatchStats']>;
    laneStrengthAverages: ReturnType<MatchEngine['getLaneStrengthAverages']>;
    matchStats: ReturnType<MatchEngine['getMatchStats']>;
  } {
    return {
      matchInfo: {
        homeTeam: this.homeTeam.name,
        awayTeam: this.awayTeam.name,
        homeScore: this.homeScore,
        awayScore: this.awayScore,
      },
      playerStats: this.getPlayerMatchStats(),
      laneStrengthAverages: this.getLaneStrengthAverages(),
      matchStats: this.getMatchStats(),
    };
  }

  private isShootoutDecided(
    hScore: number,
    aScore: number,
    total: number,
    currentRound: number,
    homeJustKicked: boolean,
  ): boolean {
    const hRemaining = total - currentRound + (homeJustKicked ? 0 : 1);
    const aRemaining = total - currentRound;

    if (hScore > aScore + aRemaining) return true;
    if (aScore > hScore + hRemaining) return true;
    return false;
  }

  private recordPenaltyEvent(
    kicker: TacticalPlayer,
    goal: boolean,
    hScore: number,
    aScore: number,
  ) {
    const p = kicker.player as Player;
    const kickerTeam = this.homeTeam.players.some(
      (tp) => (tp.player as Player).id === p.id,
    )
      ? this.homeTeam.name
      : this.awayTeam.name;
    this.events.push({
      minute: 120,
      type: goal ? 'penalty_goal' : 'penalty_miss',
      teamName: kickerTeam,
      playerId: p.id,
      data: { homeScore: hScore, awayScore: aScore },
    });
  }

  private processTacticalInstructions(minute: number) {
    const homeScoreStatus: ScoreStatus =
      this.homeScore > this.awayScore
        ? 'leading'
        : this.homeScore === this.awayScore
          ? 'draw'
          : 'trailing';
    const awayScoreStatus: ScoreStatus =
      this.awayScore > this.homeScore
        ? 'leading'
        : this.awayScore === this.homeScore
          ? 'draw'
          : 'trailing';

    this.applyInstructionsForTeam(
      this.homeTeam,
      this.homeInstructions,
      minute,
      homeScoreStatus,
    );
    this.applyInstructionsForTeam(
      this.awayTeam,
      this.awayInstructions,
      minute,
      awayScoreStatus,
    );
  }

  private applyInstructionsForTeam(
    team: Team,
    instructions: TacticalInstruction[],
    minute: number,
    scoreStatus: ScoreStatus,
  ) {
    const pending = instructions.filter(
      (ins) =>
        ins.minute === minute &&
        (!ins.condition || ins.condition === scoreStatus),
    );

    for (const ins of pending) {
      let success = false;

      if (ins.type === 'move') {
        if (!team.isPositionOccupied(ins.newPosition)) {
          team.movePlayer(ins.playerId, ins.newPosition);
          success = true;
        }
      } else if (ins.type === 'swap') {
        const playerOut = team.players.find(
          (p) => (p.player as Player).id === ins.playerId,
        );
        const subPlayer = this.substitutePlayers.get(ins.newPlayerId);

        if (subPlayer && playerOut) {
          const playerOutName = (playerOut.player as Player).name;
          const playerInName = (subPlayer.player as Player).name;

          // Track player stats for substitution
          const playerOutId = (playerOut.player as Player).id;
          const playerInId = (subPlayer.player as Player).id;

          // Update minutes played for player going out
          const outStats = this.playerMatchStats.get(playerOutId);
          if (outStats) {
            outStats.minutesPlayed += minute - (playerOut.entryMinute || 0);
          }

          // Initialize stats for player coming in
          let inStats = this.playerMatchStats.get(playerInId);
          if (!inStats) {
            inStats = {
              goals: 0,
              assists: 0,
              tackles: 0,
              appearances: 1,
              minutesPlayed: 0,
              contributionSum: 0,
              contributionCount: 0,
              starsSum: 0,
            };
            this.playerMatchStats.set(playerInId, inStats);
            this.playerContributionHistory.set(playerInId, []);
          } else {
            inStats.appearances++;
          }

          team.substitutePlayer(ins.playerId, subPlayer);
          subPlayer.entryMinute = minute; // Set entry minute

          (ins as any).playerInName = playerInName;
          (ins as any).playerOutName = playerOutName;
          success = true;
        }
      } else if (ins.type === 'position_swap') {
        const playerA = team.players.find(
          (p) => (p.player as Player).id === ins.playerId,
        );
        const playerB = team.players.find(
          (p) => (p.player as Player).id === ins.newPlayerId,
        );

        if (playerA && playerB && !playerA.isSentOff && !playerB.isSentOff) {
          const tempPos = playerA.positionKey;
          playerA.positionKey = playerB.positionKey;
          playerB.positionKey = tempPos;

          // 重新缓存两个球员在新位置的贡献值
          AttributeCalculator.preCachePlayerContributions(
            playerA.player as Player,
            playerA.positionKey,
          );
          AttributeCalculator.preCachePlayerContributions(
            playerB.player as Player,
            playerB.positionKey,
          );

          success = true;
        }
      }

      if (success) {
        this.events.push({
          minute,
          type: ins.type === 'swap' ? 'substitution' : 'tactical_change',
          teamName: team.name,
          playerId: ins.type === 'swap' ? ins.newPlayerId : ins.playerId,
          data: ins,
        });
        team.updateSnapshot(this.time); // Immediate re-calculation
      }
    }
  }

  private getPlayerById(team: Team, id: string): Player | undefined {
    return team.players.find((p) => (p.player as Player).id === id)?.player;
  }

  private getPlayerAtPos(team: Team, pos: string): Player | undefined {
    return team.players.find((p) => p.positionKey === pos)?.player;
  }

  private simulateKeyMoment() {
    this.changeLane();

    // Step 1: Foul Check (Small random chance)
    if (Math.random() < 0.1) {
      this.resolveFoul();
      return; // Foul interrupts the play
    }

    // Step 1b: General injury check - represents muscle strain/joint issues during play
    // Check both teams (random player from each team)
    this.checkAndGenerateInjury(this.homeTeam, 'other');
    this.checkAndGenerateInjury(this.awayTeam, 'other');

    // Step 2: Midfield Battle (Possession)
    const homeControl = this.homeTeam.calculateLaneStrength(
      this.currentLane,
      'possession',
    );
    const awayControl = this.awayTeam.calculateLaneStrength(
      this.currentLane,
      'defense',
    );

    // tackle_master: 防守方有抢断专家时中场控制 +8%
    const homeTackleBonus =
      this.homeTeam.players.filter((p) =>
        hasAbility(p.player as Player, 'tackle_master'),
      ).length * 0.08;
    const awayTackleBonus =
      this.awayTeam.players.filter((p) =>
        hasAbility(p.player as Player, 'tackle_master'),
      ).length * 0.08;

    const homeControlWithBonus = homeControl * (1 + awayTackleBonus); // defending team benefits
    const awayControlWithBonus = awayControl * (1 + homeTackleBonus); // defending team benefits

    const homeWinsPossession = this.resolveDuel(
      homeControlWithBonus,
      awayControlWithBonus,
      0.5,
      0,
    );

    this.possessionTeam = homeWinsPossession ? this.homeTeam : this.awayTeam;
    this.defendingTeam = homeWinsPossession ? this.awayTeam : this.homeTeam;

    // Step 2b: Injury check for midfield battle (tackle/muscle strain from the duel)
    // Check the team that lost possession (they were tackling)
    this.checkAndGenerateInjury(this.defendingTeam, 'tackle');

    // Step 3: Select Attack Type (based on lane)
    const attackType = this.selectAttackType(this.currentLane);

    // Calculate attack/defense power for this lane
    // 移除 1.15 进攻加成和 1.3 防守倍率，让攻守双方在相等的 lane strength 下公平对抗
    let attPower = this.possessionTeam.calculateLaneStrength(
      this.currentLane,
      'attack',
    );
    const defPower = this.defendingTeam.calculateLaneStrength(
      this.currentLane,
      'defense',
    );

    // counter_starter: 防守抢断后反击时，每个反击专家 +5%
    // 只有刚获得球权（freshPossession=true）时才触发
    if (this.freshPossession) {
      const counterStarterCount = this.possessionTeam.players.filter((p) =>
        hasAbility(p.player as Player, 'counter_starter'),
      ).length;
      if (counterStarterCount > 0) {
        attPower *= 1 + 0.05 * counterStarterCount;
      }
      this.freshPossession = false; // 重置标志
    }

    // Step 4: Attack Push (Attack vs Defense)
    // 远射跳过推进阶段
    let pushSuccess = false;
    let preSelectedShooter: TacticalPlayer | null = null;
    let preSelectedPasser: TacticalPlayer | null = null;
    if (attackType !== AttackType.LONG_SHOT) {
      preSelectedShooter = this.selectShooter(this.possessionTeam);
      // 预先选取传球者，以便检查 ability 对 push 的加成
      const passAssistType =
        attackType === AttackType.CROSS ? 'CROSS' : 'OTHER';
      preSelectedPasser = this.selectAssist(
        this.possessionTeam,
        preSelectedShooter,
        passAssistType,
      );
      const passerPlayer = preSelectedPasser?.player as Player | undefined;

      const attackConfig = ATTACK_TYPE_CONFIG[attackType];
      let effectiveAttPower = attPower;

      // long_passer: 直塞进攻时进攻贡献 +6%
      if (
        attackType === AttackType.THROUGH_PASS &&
        hasAbility(passerPlayer, 'long_passer')
      ) {
        effectiveAttPower *= 1.06;
      }
      // cross_specialist: 传中进攻时进攻贡献 +8%
      if (
        attackType === AttackType.CROSS &&
        hasAbility(passerPlayer, 'cross_specialist')
      ) {
        effectiveAttPower *= 1.08;
      }
      // dribble_master: 突破进攻时进攻贡献 +6%
      if (
        attackType === AttackType.DRIBBLE &&
        hasAbility(passerPlayer, 'dribble_master')
      ) {
        effectiveAttPower *= 1.06;
      }

      // header_specialist: 进攻方头球专家加成（传中进攻时）
      // 每个有头球专家的进攻球员提供+5%加成，可叠加
      if (attackType === AttackType.CROSS) {
        const attackerHeaderCount = this.possessionTeam.players.filter((p) =>
          hasAbility(p.player as Player, 'header_specialist'),
        ).length;
        if (attackerHeaderCount > 0) {
          effectiveAttPower *= 1 + 0.05 * attackerHeaderCount;
        }
      }

      // header_specialist: 防守方头球解围加成（传中进攻时）
      // 每个有头球专家的球员提供+8%加成，可叠加
      let effectiveDefPower = defPower;
      if (attackType === AttackType.CROSS) {
        const defenderHeaderCount = this.defendingTeam.players.filter((p) =>
          hasAbility(p.player as Player, 'header_specialist'),
        ).length;
        if (defenderHeaderCount > 0) {
          effectiveDefPower *= 1 + 0.08 * defenderHeaderCount;
        }
      }

      // ==========================================
      // 反击机制：当防守强度远高于进攻时，增加断球概率和反击加成
      // ==========================================
      const DEF_THRESHOLD = 1.3; // defRatio 阈值
      const MAX_INTERCEPT_CHANCE = 0.25; // 最高25%断球率
      const MAX_COUNTER_BONUS = 0.3; // 最高30%反击加成

      let interceptTriggered = false;
      const defRatio = effectiveDefPower / effectiveAttPower;

      if (defRatio > DEF_THRESHOLD) {
        // 计算断球机会（防守远强于进攻时，有概率直接断球打反击）
        const interceptChance = Math.min(
          MAX_INTERCEPT_CHANCE,
          (defRatio - DEF_THRESHOLD) * 0.1,
        );

        if (Math.random() < interceptChance) {
          // 直接断球，防守方获得球权并发动反击
          interceptTriggered = true;

          // 角色互换： possessionTeam 变成 defendingTeam，defendingTeam 变成 possessionTeam
          const temp = this.possessionTeam;
          this.possessionTeam = this.defendingTeam;
          this.defendingTeam = temp;

          // 反击时进攻加成
          const counterBonus = Math.min(
            MAX_COUNTER_BONUS,
            (defRatio - DEF_THRESHOLD) * 0.15,
          );
          // 直接在effectiveAttPower上应用反击加成
          effectiveAttPower *= 1 + counterBonus;

          // 拦截成功后，让新的进攻方直接射门（不需要再走推进流程）
          pushSuccess = true;
        }
      }

      // 反击加成：刚获得球权时（反击），进攻贡献提升
      if (!interceptTriggered && this.freshPossession) {
        const counterStarterCount = this.possessionTeam.players.filter((p) =>
          hasAbility(p.player as Player, 'counter_starter'),
        ).length;
        if (counterStarterCount > 0) {
          effectiveAttPower *= 1 + 0.05 * counterStarterCount;
        }
      }

      // 推进判定（正常流程）
      if (!interceptTriggered) {
        pushSuccess = this.resolveDuel(
          effectiveAttPower,
          effectiveDefPower,
          attackConfig.pushK,
          attackConfig.pushOffset,
        );
        // 如果进攻失败，防守方获得球权，下次进攻享受反击加成
        if (!pushSuccess) {
          this.freshPossession = true;
        } else {
          // 推进成功：进攻方冲刺过人受伤检核
          this.checkAndGenerateInjury(this.possessionTeam, 'sprint');
        }
      } else {
        // 反击触发后，重置标志（反击加成已应用）
        this.freshPossession = false;
      }
    }

    // Step 5: Shot attempt
    let shotResult: 'goal' | 'save' | 'blocked' | 'miss' | 'no_shot' =
      'no_shot';
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
        // long_shooter: 远射评分 +10%
        if (hasAbility(player, 'long_shooter')) {
          finalShootRating *= 1.1;
        }

        const gk = this.defendingTeam.getGoalkeeper();
        gkRating = gk ? this.defendingTeam.getSnapshot()?.gkRating || 100 : 100;

        const shotConfig = SHOT_TYPE_CONFIG[shotType];
        const isGoal = this.resolveDuel(
          finalShootRating,
          gkRating,
          shotConfig.k,
          shotConfig.offset,
        );

        // 远射：65% 有助攻
        if (Math.random() < 0.65) {
          assistPlayer = this.selectAssist(
            this.possessionTeam,
            shooter,
            'OTHER',
          );
        }

        shotResult = isGoal ? 'goal' : 'miss';
      }
    } else if (pushSuccess) {
      // 常规进攻：推进成功后选择射门类型（复用预选的射手）
      shotType = this.selectShotType(attackType);
      shooter = preSelectedShooter;

      if (shooter) {
        const player = shooter.player as Player;

        // 根据射门类型计算评分
        switch (shotType) {
          case ShotType.HEADER:
            finalShootRating = this.calculateHeaderRating(player);
            // 头球争顶受伤检核
            this.checkAndGenerateInjury(this.possessionTeam, 'jump');
            break;
          case ShotType.ONE_ON_ONE:
            finalShootRating = this.calculateOneOnOneRating(player);
            break;
          case ShotType.REBOUND:
            finalShootRating = this.calculateShootRating(player);
            // rebound_specialist: 补射评分 +10%
            if (hasAbility(player, 'rebound_specialist')) {
              finalShootRating *= 1.1;
            }
            break;
          case ShotType.NORMAL:
            finalShootRating = this.calculateShootRating(player);
            break;
          default:
            finalShootRating = this.calculateShootRating(player);
        }

        // 随机波动因子
        finalShootRating *= 0.6 + Math.random() * 0.5;

        const gk = this.defendingTeam.getGoalkeeper();
        gkRating = gk ? this.defendingTeam.getSnapshot()?.gkRating || 100 : 100;

        // 根据射门类型计算成功率
        const shotConfig = SHOT_TYPE_CONFIG[shotType];
        const isGoal = this.resolveDuel(
          finalShootRating,
          gkRating,
          shotConfig.k,
          shotConfig.offset,
        );

        // 助攻逻辑（根据射门类型）
        if (shotType === ShotType.HEADER) {
          // 头球：100% 有助攻（来自传中），复用预选的边路传球者
          assistPlayer = preSelectedPasser;
        } else if (shotType === ShotType.REBOUND) {
          // 补射：0% 助攻
          assistPlayer = null;
        } else {
          // 抽射/单刀：65% 有助攻，复用预选的传球者
          if (Math.random() < 0.65) {
            assistPlayer = preSelectedPasser;
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
        winner: homeWinsPossession ? 'home' : 'away',
      },
      attackPush: {
        attackPower: attPower,
        defensePower: defPower,
        success: pushSuccess,
      },
      shot:
        shotResult === 'no_shot'
          ? null
          : {
              result: shotResult,
              shotType: shotType,
              shooter: shooter,
              assist: assistPlayer,
              shootRating: finalShootRating,
              gkRating: gkRating,
            },
    });
  }

  private resolveFoul() {
    const foulingTeam = Math.random() < 0.5 ? this.homeTeam : this.awayTeam;
    const victimTeam =
      foulingTeam === this.homeTeam ? this.awayTeam : this.homeTeam;
    const playerIdx = (Math.random() * foulingTeam.players.length) | 0;
    const player = foulingTeam.players[playerIdx];
    if (!player || player.isSentOff) return;

    const p = player.player as Player;
    const roll = Math.random();

    if (roll < 0.1) {
      // Direct Red Card - player leaves, no substitution (plays with 10 men)
      foulingTeam.sendOffPlayer(p.id);
      player.isSentOff = true;
      this.events.push({
        minute: this.time,
        type: 'red_card',
        teamName: foulingTeam.name,
        playerId: p.id,
      });
      foulingTeam.updateSnapshot(this.time);
    } else if (roll < 0.4) {
      // Yellow Card - check for second yellow
      const currentYellows = player.yellowCards || 0;
      player.yellowCards = currentYellows + 1;

      if (currentYellows >= 1) {
        // Second yellow = red card - player leaves, no substitution (plays with 10 men)
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

    // After resolving the foul, check if victim player gets injured
    this.checkAndGenerateInjury(victimTeam, 'collision');
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
      if (roll < 0.3) {
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

  /**
   * Check if a player gets injured and generate injury event
   */
  private checkAndGenerateInjury(
    team: Team,
    actionType: 'tackle' | 'sprint' | 'jump' | 'collision' | 'other',
  ): void {
    // Get a random player from the team
    const playerIdx = (Math.random() * team.players.length) | 0;
    const tacticalPlayer = team.players[playerIdx];
    if (!tacticalPlayer) return;

    const player = tacticalPlayer.player as Player;
    if (!player) return;

    // Get player age (use a default if not available)
    const playerAge = (player as any).age || 25;

    // Get player stamina (use player currentStamina or default)
    const playerStamina = (player as any).currentStamina || 4;

    // Get player's current injury state (minor injury doubles injury probability)
    const playerInjuryState = (player as any).injuryState as
      | 'minor'
      | 'severe'
      | null;

    // Generate injury
    const injuryResult = InjurySystem.generateInjury(
      actionType,
      playerAge,
      playerStamina,
      team === this.homeTeam,
      team.doctorLevel,
      playerInjuryState,
    );

    if (
      injuryResult.willInjure &&
      injuryResult.injuryType &&
      injuryResult.severity &&
      injuryResult.injuryValue
    ) {
      const injuryEventData: InjuryEventData = {
        playerId: player.id,
        injuryType: injuryResult.injuryType,
        severity: injuryResult.severity,
        injuryValue: injuryResult.injuryValue,
        estimatedRecoveryDays: {
          min: injuryResult.estimatedMinDays,
          max: injuryResult.estimatedMaxDays,
        },
        treatmentTime: InjurySystem.getTreatmentTime(injuryResult.severity),
      };

      // Push injury event
      this.events.push({
        minute: this.time,
        type: 'injury',
        teamName: team.name,
        playerId: player.id,
        data: {
          injuryData: injuryEventData,
          injuryValue: injuryResult.injuryValue,
          estimatedRecoveryDays: {
            min: injuryResult.estimatedMinDays,
            max: injuryResult.estimatedMaxDays,
          },
        },
      });

      // Severe injury: player must leave and be substituted
      if (injuryResult.severity === 'severe') {
        const benchConfig =
          team === this.homeTeam ? this.homeBenchConfig : this.awayBenchConfig;
        const subPlayer = this.getSubstituteForPosition(
          team,
          benchConfig,
          tacticalPlayer.positionKey,
        );

        if (subPlayer) {
          // Get player names for the event
          const playerOutName = player.name;
          const playerInName = (subPlayer.player as Player).name;

          // Track stats for player going out
          const playerOutId = player.id;
          const playerInId = (subPlayer.player as Player).id;
          const outStats = this.playerMatchStats.get(playerOutId);
          if (outStats) {
            outStats.minutesPlayed = this.time;
          }

          // Perform substitution
          team.substitutePlayer(playerOutId, subPlayer);
          subPlayer.entryMinute = this.time;

          // Add substitution event
          this.events.push({
            minute: this.time,
            type: 'substitution',
            teamName: team.name,
            playerId: playerInId,
            data: {
              playerInName,
              playerOutName,
              playerInId,
              playerOutId,
              reason: 'injury',
              injuryData: injuryEventData,
            },
          });

          // Update match stats for player coming in
          const inStats = this.playerMatchStats.get(playerInId);
          if (inStats) {
            inStats.appearances++;
          } else {
            this.playerMatchStats.set(playerInId, {
              goals: 0,
              assists: 0,
              tackles: 0,
              appearances: 1,
              minutesPlayed: 0,
              contributionSum: 0,
              contributionCount: 0,
              starsSum: 0,
            });
            this.playerContributionHistory.set(playerInId, []);
          }
        } else {
          // No substitute available - player must stay on (heavily limping)
          // This is a medical emergency situation handled by the referee
        }
      }

      // Update team snapshot
      team.updateSnapshot(this.time);
    }
  }

  private recordAttackSequence(sequence: {
    lane: Lane;
    attackType: AttackType;
    midfieldBattle: {
      homeStrength: number;
      awayStrength: number;
      winner: 'home' | 'away';
    };
    attackPush: { attackPower: number; defensePower: number; success: boolean };
    shot: {
      result: 'goal' | 'save' | 'blocked' | 'miss';
      shotType: ShotType;
      shooter: TacticalPlayer | null;
      assist: TacticalPlayer | null;
      shootRating: number;
      gkRating: number;
    } | null;
  }) {
    const { lane, attackType, midfieldBattle, attackPush, shot } = sequence;

    // Determine overall result
    let finalResult: 'goal' | 'save' | 'blocked' | 'miss' | 'defense_stopped';
    let eventType: MatchEvent['type'];

    if (shot) {
      finalResult = shot.result;
      eventType =
        shot.result === 'goal'
          ? 'goal'
          : shot.result === 'save'
            ? 'save'
            : 'miss';
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
        case ShotType.HEADER:
          return 'header';
        case ShotType.ONE_ON_ONE:
          return 'one-on-one';
        case ShotType.REBOUND:
          return 'rebound';
        case ShotType.LONG_SHOT:
          return 'long-range shot';
        default:
          return 'shot';
      }
    };

    const possessor =
      midfieldBattle.winner === 'home'
        ? this.homeTeam.name
        : this.awayTeam.name;
    const defender =
      midfieldBattle.winner === 'home'
        ? this.awayTeam.name
        : this.homeTeam.name;

    const scoreAfterEvent = {
      home:
        finalResult === 'goal' && midfieldBattle.winner === 'home'
          ? this.homeScore + 1
          : this.homeScore,
      away:
        finalResult === 'goal' && midfieldBattle.winner === 'away'
          ? this.awayScore + 1
          : this.awayScore,
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
          winner:
            midfieldBattle.winner === 'home'
              ? this.homeTeam.name
              : this.awayTeam.name,
        },
        attackPush: {
          attackingTeam: possessor,
          defendingTeam: defender,
          attackPower: parseFloat(attackPush.attackPower.toFixed(2)),
          defensePower: parseFloat(attackPush.defensePower.toFixed(2)),
          success: attackPush.success,
        },
        shot: shot
          ? {
              result: shot.result,
              shotType: ShotType[shot.shotType],
              shooter: shot.shooter
                ? (shot.shooter.player as Player).name
                : null,
              shooterId: shot.shooter
                ? (shot.shooter.player as Player).id
                : null,
              assist: shot.assist ? (shot.assist.player as Player).name : null,
              assistId: shot.assist ? (shot.assist.player as Player).id : null,
              shootRating: parseFloat(shot.shootRating.toFixed(2)),
              gkRating: parseFloat(shot.gkRating.toFixed(2)),
            }
          : null,
      },
      lane: lane,
      finalResult: finalResult,
      scoreAfterEvent: finalResult === 'goal' ? scoreAfterEvent : undefined,
    };

    // Track player stats: goals and assists
    if (shot?.shooter) {
      const shooterId = (shot.shooter.player as Player).id;
      const stats = this.playerMatchStats.get(shooterId);
      if (stats) {
        if (finalResult === 'goal') {
          stats.goals++;
        }
        if (shot.assist) {
          const assistId = (shot.assist.player as Player).id;
          const assistStats = this.playerMatchStats.get(assistId);
          if (assistStats) {
            assistStats.assists++;
          }
        }
      }
    }

    // Track tackles: defense_stopped means defensive player made a tackle
    if (finalResult === 'defense_stopped') {
      // Attributing tackle to defender (simplified: use random defender)
      const defendingTeam =
        midfieldBattle.winner === 'home' ? this.awayTeam : this.homeTeam;
      const defenderIdx = (Math.random() * defendingTeam.players.length) | 0;
      const defender = defendingTeam.players[defenderIdx];
      if (defender) {
        const defenderId = (defender.player as Player).id;
        const stats = this.playerMatchStats.get(defenderId);
        if (stats) {
          stats.tackles++;
        }
      }
    }

    // Create the event
    this.events.push({
      minute: this.time,
      type: eventType,
      teamName: possessor,
      playerId: shot?.shooter ? (shot.shooter.player as Player).id : undefined,
      relatedPlayerId: shot?.assist
        ? (shot.assist.player as Player).id
        : undefined,
      data: eventData,
    });

    // Trigger corner if shot was blocked
    if (finalResult === 'blocked' && shot?.shooter) {
      if (Math.random() < 0.87) {
        const cornerTeam =
          midfieldBattle.winner === 'home' ? this.homeTeam : this.awayTeam;
        const defendingTeam =
          midfieldBattle.winner === 'home' ? this.awayTeam : this.homeTeam;
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
    const possessionTeam =
      result === 'goal' ||
      result === 'save' ||
      result === 'blocked' ||
      result === 'miss'
        ? this.possessionTeam.name
        : this.defendingTeam.name;
    if (possessionTeam === this.homeTeam.name) {
      this.matchStats.possessionStats.home++;
    } else {
      this.matchStats.possessionStats.away++;
    }
  }

  private selectShooter(team: Team): TacticalPlayer {
    const candidates = team.players.filter((p) => !p.isSentOff);
    const len = candidates.length;

    // 射手权重：CF 40% | W 20% | AM 15% | 其他 25%
    const rand = Math.random();

    // 优先 CF（40%）
    const cfs = candidates.filter((p) => p.positionKey.includes('CF'));
    if (cfs.length > 0 && rand < 0.4) {
      return cfs[(Math.random() * cfs.length) | 0];
    }

    // 其次 W（20%）
    const ws = candidates.filter((p) => p.positionKey.includes('W'));
    if (ws.length > 0 && rand < 0.6) {
      // 0.40 + 0.20
      return ws[(Math.random() * ws.length) | 0];
    }

    // 再次 AM（15%）
    const ams = candidates.filter((p) => p.positionKey.includes('AM'));
    if (ams.length > 0 && rand < 0.75) {
      // 0.60 + 0.15
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
    const candidates = team.players.filter(
      (p) => !p.isSentOff && !p.positionKey.includes('GK'),
    );

    // 优先级1：AM（45%）
    const ams = candidates.filter((p) => p.positionKey.includes('AM'));
    if (ams.length > 0 && Math.random() < 0.45) {
      return ams[(Math.random() * ams.length) | 0];
    }

    // 优先级2：W（25%，在剩余55%中）
    const ws = candidates.filter((p) => p.positionKey.includes('W'));
    if (ws.length > 0 && Math.random() < 0.4545) {
      // 0.25 / 0.55
      return ws[(Math.random() * ws.length) | 0];
    }

    // 优先级3：CM（20%，在剩余30%中）
    const cms = candidates.filter((p) => p.positionKey.includes('CM'));
    if (cms.length > 0 && Math.random() < 0.6667) {
      // 0.20 / 0.30
      return cms[(Math.random() * cms.length) | 0];
    }

    // 优先级4：其他位置（剩余10%）
    const others = candidates.filter(
      (p) =>
        !p.positionKey.includes('AM') &&
        !p.positionKey.includes('W') &&
        !p.positionKey.includes('CM'),
    );
    if (others.length > 0) {
      return others[(Math.random() * others.length) | 0];
    }

    return candidates[(Math.random() * candidates.length) | 0];
  }

  private selectAssist(
    team: Team,
    shooter: TacticalPlayer,
    attackType: 'CROSS' | 'OTHER' = 'OTHER',
  ): TacticalPlayer | null {
    // Get all players except the shooter and GK
    const candidates = team.players.filter(
      (p) => !p.isSentOff && p !== shooter && !p.positionKey.includes('GK'),
    );

    if (candidates.length === 0) return null;

    // For CROSS (传中), the assister must be a wide player
    if (attackType === 'CROSS') {
      const widePlayers = candidates.filter(
        (p) =>
          p.positionKey.includes('LB') ||
          p.positionKey.includes('RB') ||
          p.positionKey.includes('WBL') ||
          p.positionKey.includes('WBR') ||
          p.positionKey.includes('LW') ||
          p.positionKey.includes('RW'),
      );
      if (widePlayers.length > 0) {
        return widePlayers[(Math.random() * widePlayers.length) | 0];
      }
      // Fallback: no wide player available, no assist
      return null;
    }

    // For other attack types, prioritize midfielders and wingers
    const preferredAssisters = candidates.filter(
      (p) =>
        p.positionKey.includes('AM') ||
        p.positionKey.includes('CM') ||
        p.positionKey.includes('W') ||
        p.positionKey.includes('M'),
    );

    if (preferredAssisters.length > 0 && Math.random() < 0.7) {
      return preferredAssisters[
        (Math.random() * preferredAssisters.length) | 0
      ];
    }

    return candidates[(Math.random() * candidates.length) | 0];
  }

  /**
   * 根据当前路（lane）选择进攻类型（受天气影响）
   * @param lane 当前攻击的路
   * @returns 进攻类型枚举
   */
  private selectAttackType(lane: Lane): AttackType {
    // 获取该路的进攻方式分布
    const distribution = LANE_ATTACK_DISTRIBUTION[lane];
    if (!distribution) {
      return AttackType.SHORT_PASS;
    }

    // 获取天气权重
    const weatherWeights =
      WEATHER_ATTACK_WEIGHTS[this.weather] || WEATHER_ATTACK_WEIGHTS['cloudy'];

    // 应用天气权重
    const weightedDistribution = distribution.map(
      (base, i) => base * weatherWeights[i],
    );

    // 归一化（保持总和为100）
    const sum = weightedDistribution.reduce((a, b) => a + b, 0);
    const normalized = weightedDistribution.map((w) => (w / sum) * 100);

    const rand = Math.random() * 100;
    let cumulative = 0;

    for (let i = 0; i < normalized.length; i++) {
      cumulative += normalized[i];
      if (rand < cumulative) {
        return i as AttackType;
      }
    }

    return AttackType.SHORT_PASS; // Fallback
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
   * 头球评分 = finishing×7 + composure×3
   * header_specialist: 头球射门评分 +8%
   */
  private calculateHeaderRating(player: Player): number {
    const attrs = player.attributes;
    const raw = (attrs.finishing ?? 10) * 7 + (attrs.composure ?? 10) * 3;
    // header_specialist: 头球射门评分 +8%
    return hasAbility(player, 'header_specialist') ? raw * 1.08 : raw;
  }

  /**
   * 计算抽射评分（禁区内常规射门）
   * 抽射评分 = finishing×7 + composure×3
   */
  private calculateShootRating(player: Player): number {
    const attrs = player.attributes;
    return (attrs.finishing ?? 10) * 7 + (attrs.composure ?? 10) * 3;
  }

  /**
   * 计算单刀球评分
   * 单刀评分 = finishing×7 + composure×3
   */
  private calculateOneOnOneRating(player: Player): number {
    const attrs = player.attributes;
    return (attrs.finishing ?? 10) * 7 + (attrs.composure ?? 10) * 3;
  }

  /**
   * 计算远射评分
   * 远射评分 = finishing×7 + composure×3
   * 距离因子（18-30米）会影响最终评分
   */
  private calculateLongShotRating(player: Player): number {
    const attrs = player.attributes;

    // 基础评分
    const baseRating =
      (attrs.finishing ?? 10) * 7 + (attrs.composure ?? 10) * 3;

    // 距离因子（越远越难）
    const minDistance = 18;
    const maxDistance = 30;
    const distance = minDistance + Math.random() * (maxDistance - minDistance);
    const distanceFactor = 1 - (distance - minDistance) / 50;

    return baseRating * distanceFactor;
  }

  private resolveDuel(
    valA: number,
    valB: number,
    k: number,
    offset: number,
  ): boolean {
    // 新公式：用比率 (valA / valB)
    // P = 1 / (1 + exp(-(ratio - 1 - offsetCoef) * k))
    // offsetCoef = offset / 100 (归一化到与ratio同一量级)
    const ratio = valB > 0 ? valA / valB : 1;
    const offsetCoef = offset / 100;
    const diff = ratio - 1 - offsetCoef;
    const probability = 1 / (1 + Math.exp(-diff * k));
    return Math.random() < probability;
  }

  private changeLane() {
    // 中路42%，左路29%，右路29%
    const rand = Math.random() * 100;
    if (rand < 42) {
      this.currentLane = 'center';
    } else if (rand < 71) {
      // 42 + 29 = 71
      this.currentLane = 'left';
    } else {
      this.currentLane = 'right';
    }
  }

  private generateSnapshotEvent(time: number) {
    const homeSnapshot = this.homeTeam.getSnapshot();
    const awaySnapshot = this.awayTeam.getSnapshot();

    // Record lane strength history for averaging
    if (homeSnapshot) {
      this.laneStrengthHistory.home.push({
        minute: time,
        laneStrengths: homeSnapshot.laneStrengths,
      });
    }
    if (awaySnapshot) {
      this.laneStrengthHistory.away.push({
        minute: time,
        laneStrengths: awaySnapshot.laneStrengths,
      });
    }

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
          player.experience,
        );

        const lAtk = AttributeCalculator.calculateContribution(
          player,
          tacticalPlayer.positionKey,
          'left',
          'attack',
        );
        const lDef = AttributeCalculator.calculateContribution(
          player,
          tacticalPlayer.positionKey,
          'left',
          'defense',
        );
        const lPos = AttributeCalculator.calculateContribution(
          player,
          tacticalPlayer.positionKey,
          'left',
          'possession',
        );

        const cAtk = AttributeCalculator.calculateContribution(
          player,
          tacticalPlayer.positionKey,
          'center',
          'attack',
        );
        const cDef = AttributeCalculator.calculateContribution(
          player,
          tacticalPlayer.positionKey,
          'center',
          'defense',
        );
        const cPos = AttributeCalculator.calculateContribution(
          player,
          tacticalPlayer.positionKey,
          'center',
          'possession',
        );

        const rAtk = AttributeCalculator.calculateContribution(
          player,
          tacticalPlayer.positionKey,
          'right',
          'attack',
        );
        const rDef = AttributeCalculator.calculateContribution(
          player,
          tacticalPlayer.positionKey,
          'right',
          'defense',
        );
        const rPos = AttributeCalculator.calculateContribution(
          player,
          tacticalPlayer.positionKey,
          'right',
          'possession',
        );

        const totalContribution =
          (lAtk + lDef + lPos + cAtk + cDef + cPos + rAtk + rDef + rPos) *
          multiplier;

        // Calculate stars based on position
        let stars = 0.5;
        let normalizedContribution = totalContribution; // For history tracking
        if (tacticalPlayer.positionKey === 'GK') {
          // GK: apply multiplier first, then normalize to 0-100 scale
          // gkRating range: ~100 (skill 10) to ~200 (skill 20)
          // With multiplier 1.2, raw range is ~120 to ~240
          // Divide by 2.4 to get 0-100 scale (240/2.4 = 100)
          const gkRating =
            AttributeCalculator.calculateAndCacheGKSaveRating(player);
          const rawContribution = gkRating * multiplier;
          // Normalize: divide by 2.4 to match 0-100 scale
          normalizedContribution = rawContribution / 2.4;
          stars = contributionToStars(normalizedContribution);
        } else {
          // Outfield: apply multiplier then normalize to 0-100 scale
          const positionFit = calculatePositionFit(
            player.attributes,
            tacticalPlayer.positionKey,
          );
          const rawContribution = positionFit * multiplier;
          // Normalize: divide by 1.2 (max multiplier) to get 0-100 scale
          normalizedContribution = rawContribution / 1.2;
          stars = contributionToStars(normalizedContribution);
        }

        // Note: GK normalization uses a different divisor (7.5) because gkRating
        // has a different scale (max ~625 for skills=100). Formula:
        // (gkRating * multiplier) / 7.5 ≈ (positionFit * multiplier) / 1.2
        // Both evaluate to ~100 at max quality with max multiplier

        // Track contribution and stars history for this player
        // Use normalizedContribution for consistent 0-100 scale across all positions
        const playerHistory = this.playerContributionHistory.get(player.id);
        if (playerHistory) {
          playerHistory.push({
            minute: time,
            contribution: normalizedContribution,
            stars,
          });
        }

        // A player needs full data if it's the global full snapshot (min 0) or if they just appeared (sub)
        const isNewPlayer = !this.knownPlayerIds.has(player.id);
        const needsFullData = isFullMatchSnapshot || isNewPlayer;

        const state: any = {
          id: player.id,
          p: tacticalPlayer.positionKey,
          st: parseFloat(fitness.toFixed(1)),
          f: player.form,
          cm: parseFloat(multiplier.toFixed(3)),
          pc: parseFloat(normalizedContribution.toFixed(1)), // Normalized to 0-100 scale
          sr: stars, // star rating
          em: tacticalPlayer.entryMinute || 0,
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
          pos: parseFloat(((phases as any).possession || 0).toFixed(1)),
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
          ps: mapPlayerStates(this.homeTeam, time === 0),
        },
        a: {
          n: time === 0 ? this.awayTeam.name : undefined,
          ls: formatLanes(awaySnapshot?.laneStrengths),
          gk: parseFloat((awaySnapshot?.gkRating || 0).toFixed(1)),
          ps: mapPlayerStates(this.awayTeam, time === 0),
        },
      },
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

    const attackScore =
      avgFK * 0.7 + (kicker.player as Player).attributes.freeKicks * 0.5;
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
        result: isGoal ? 'goal' : 'save',
      },
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
  private resolveIndirectFreeKick(
    attackingTeam: Team,
    defendingTeam: Team,
  ): void {
    const avgFK = attackingTeam.getAvgFreeKicks();
    const kicker = attackingTeam.getBestSetPieceTaker('free_kick');
    const opponentAvgFK = defendingTeam.getAvgFreeKicks();
    const gkRating = defendingTeam.getGoalkeeperSetPieceRating();

    if (!kicker) return;

    const attackScore =
      avgFK * 0.6 + (kicker.player as Player).attributes.freeKicks * 0.6;
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
        result: isGoal ? 'goal' : 'save',
      },
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
  private resolveDirectFreeKick(
    attackingTeam: Team,
    defendingTeam: Team,
  ): void {
    const kicker = attackingTeam.getBestSetPieceTaker('free_kick');
    const gk = defendingTeam.getGoalkeeper();

    if (!kicker || !gk) return;

    const kickerP = kicker.player as Player;
    const gkP = gk.player as Player;

    const attackScore =
      (kickerP.attributes.freeKicks ?? 10) * 1.0 +
      (kickerP.attributes.composure ?? 10) * 0.5;
    const defenseScore =
      (gkP.attributes.gk_reflexes ?? 10) * 0.6 +
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
        result: isGoal ? 'goal' : 'save',
      },
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

    const attackScore =
      (kickerP.attributes.penalties ?? 10) * 1.2 +
      (kickerP.attributes.composure ?? 10) * 0.5;
    let defenseScore =
      (gkP.attributes.gk_reflexes ?? 10) * 0.8 +
      (gkP.attributes.gk_handling ?? 10) * 0.6 +
      (gkP.attributes.composure ?? 10) * 0.4;
    // penalty_saver: 扑点球时扑救率 +10%
    if (hasAbility(gkP, 'penalty_saver')) {
      defenseScore *= 1.1;
    }
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
        result: isGoal ? 'goal' : 'save',
      },
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

  private setPieceStats: Map<
    string,
    {
      corners: number;
      freeKicks: number;
      indirectFreeKicks: number;
      penalties: number;
    }
  > = new Map();

  private updateSetPieceStats(
    teamId: string,
    type: 'corner' | 'direct_fk' | 'indirect_fk' | 'penalty',
  ): void {
    const stats = this.setPieceStats.get(teamId) || {
      corners: 0,
      freeKicks: 0,
      indirectFreeKicks: 0,
      penalties: 0,
    };
    switch (type) {
      case 'corner':
        stats.corners++;
        break;
      case 'direct_fk':
        stats.freeKicks++;
        break;
      case 'indirect_fk':
        stats.indirectFreeKicks++;
        break;
      case 'penalty':
        stats.penalties++;
        break;
    }
    this.setPieceStats.set(teamId, stats);
  }

  getSetPieceStats(): Map<
    string,
    {
      corners: number;
      freeKicks: number;
      indirectFreeKicks: number;
      penalties: number;
    }
  > {
    return this.setPieceStats;
  }
}
