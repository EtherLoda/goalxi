import { Team } from './classes/Team';
import {
  Lane,
  TacticalPlayer,
  TacticalInstruction,
  ScoreStatus,
  EventCondition,
  AttackType,
  ShotType,
  TeamSnapshot,
} from './types/simulation.types';
// (Lane is already imported above)
import { AttributeCalculator } from './utils/attribute-calculator';
import { ConditionSystem } from './systems/condition.system';
import { InjurySystem, InjuryEventData } from './systems/injury.system';
import { Player } from '../types/player.types';
import { BenchConfig, calculatePositionFit, Uuid } from '@goalxi/database';
import {
  attackLaneMultiplier,
  defenseLaneMultiplier,
  foulRateMultiplier,
  getEventMultiplier,
  gkSaveMultiplier,
  injuryChanceMultiplier,
  midfieldControlMultiplier,
  pushDefenseMultiplier,
  pushOffenseMultiplier,
  selectAssistWeight,
  selectAttackTypeWeight,
  selectShooterCounterWeight,
  selectShooterCrossHeaderWeight,
  selectShooterReboundWeight,
  selectShooterWeight,
  selectShotTypeWeight,
  shotFkMultiplier,
  shotHeaderMultiplier,
  shotLongMultiplier,
  shotPenaltyMultiplier,
  shotOneOnOneMultiplier,
  shotReboundMultiplier,
  shotNormalMultiplier,
  teamProductEventMultiplier,
  teamSampledEventMultiplier,
} from './systems/specialty.system';
import { LoggerService } from '@nestjs/common';
import { resolveDuel as resolveDuelPure, duelProbability } from './duel';
import {
  generateWeatherAnnouncementEvent,
  generateAttendanceAnnouncementEvent,
  generatePlayerIntroductionEvent,
} from './event.generator';
import {
  TacticsConfig,
  Tempo,
  PitchWidth,
  DefensiveLine,
} from './types/tactics-config';
import {
  WIDTH_MODIFIERS,
  DEFENSIVE_LINE_MODIFIERS,
  TEMPO_MODIFIERS,
  DEFAULT_TACTICS,
} from './tactics/tactics-presets';

// ---------- Ability Helper ----------
// The v1 `hasAbility(player, 'XXX')` helper has been removed. All
// v2 specialty lookups go through `getEventMultiplier` and the
// named helpers in `./systems/specialty.system` — see
// `docs/specialty-v2-design.md` for the event-keyed hook table.

// Team-level team-max-style helper was replaced in v2.4 by two
// decision/strength-class helpers in `specialty.system.ts`:
//   - `teamSampledEventMultiplier` (decision class: weighted pick 1)
//   - `teamProductEventMultiplier` (strength class: capped product)
// The previous `teamMaxEventMultiplier` (max-of-per-player) and
// `teamMaxEventCached` (per-keyMoment memoized wrapper) are gone;
// their call sites have been migrated to the new helpers above.

// 三条路的进攻方式分布配置（平均值 ≈ 1.0）
// 索引顺序: 0=传中, 1=短传, 2=直塞, 3=突破, 4=远射
const WEATHER_ATTACK_WEIGHTS: Record<string, number[]> = {
  sunny: [1.05, 0.95, 1.0, 1.1, 1.1],
  cloudy: [1.0, 1.0, 1.0, 1.0, 1.0],
  rainy: [0.9, 0.95, 0.85, 1.15, 0.8],
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
// baseline 是对等双方射门时进球概率（GK 评分与射门员相当时）
// 不同射门类型有显著差异，反映真实足球规律
const SHOT_TYPE_CONFIG: Record<ShotType, { baseline: number }> = {
  [ShotType.ONE_ON_ONE]: { baseline: 0.65 }, // 1v1 面对门将
  [ShotType.HEADER]: { baseline: 0.45 }, // 头球靠位置争顶
  [ShotType.NORMAL]: { baseline: 0.4 }, // 禁区内常规抽射
  [ShotType.REBOUND]: { baseline: 0.5 }, // 补射（门前近距离）
  [ShotType.LONG_SHOT]: { baseline: 0.3 }, // 远射
};

/**
 * Map position keys to bench config keys
 * FB = Fullback (covers LB/RB/WBL/WBR/LWB/RWB)
 * W = Winger (covers LW/RW/LM/RM)
 * CM = Central Midfield (covers AM/CM/DM all left/center/right variants)
 */
const POSITION_TO_BENCH_KEY: Record<string, keyof BenchConfig> = {
  // Goalkeeper
  GK: 'goalkeeper',
  // Center Back (3-slot family)
  CBL: 'centerBack',
  CB: 'centerBack',
  CBR: 'centerBack',
  // Legacy CD/CDL/CDR aliases — kept for historical data;
  // `attribute-calculator`'s SLOT_KEY_NORMALIZER folds them to
  // `CB` upstream, so this row is defence-in-depth only.
  CDL: 'centerBack',
  CD: 'centerBack',
  CDR: 'centerBack',
  // Fullback family (LB/RB/WBL/WBR/LWB/RWB).
  // `LWB`/`RWB` are the modern 1-slot wing-back names; `WBL`/`WBR`
  // are the legacy 3-slot left/right variants — both fold to the
  // same fullback bucket.
  LB: 'fullback',
  RB: 'fullback',
  WBL: 'fullback',
  WBR: 'fullback',
  LWB: 'fullback',
  RWB: 'fullback',
  // Winger (4 positions: LW, RW, LM, RM)
  LW: 'winger',
  RW: 'winger',
  LM: 'winger',
  RM: 'winger',
  // Central Midfield — 3-slot AM/CM/DM families (9 keys).
  // The legacy 3-slot CAM/CAML/CAMR and DMF/DMFL/DMFR/CDM keys are
  // kept here for symmetry; the normalizer folds them upstream.
  AML: 'centralMidfield',
  AM: 'centralMidfield',
  AMR: 'centralMidfield',
  CML: 'centralMidfield',
  CM: 'centralMidfield',
  CMR: 'centralMidfield',
  DML: 'centralMidfield',
  DM: 'centralMidfield',
  DMR: 'centralMidfield',
  CAML: 'centralMidfield',
  CAM: 'centralMidfield',
  CAMR: 'centralMidfield',
  DMF: 'centralMidfield',
  DMFL: 'centralMidfield',
  DMFR: 'centralMidfield',
  CDM: 'centralMidfield',
  // Forward (3 positions)
  CFL: 'forward',
  CF: 'forward',
  CFR: 'forward',
};

// ==================== POWER RATING HELPERS ====================
// Thresholds for all players (0-100 contribution). Output values
// are 0-20 power ratings on a 0.5-step ladder (40 rungs:
// 0, 0.5, 1, ..., 19.5, 20) so the snapshot's  field carries a
// smooth, evenly-spaced 0-20 number end-to-end. The FE just reads
// and displays - no rescaling.
//
// The threshold ladder is a linear mapping: rung `i` has
// `threshold = i * 2.5` and `power = i * 0.5`. So
// `contributionToStars(c)` is just `floor(c / 2.5) * 0.5`, with
// the index clamped to [0, 40] so out-of-range inputs still
// produce a valid 0–20 power rating (matches the legacy
// `Math.min(20, stars)` cap). No table needed at runtime — the
// legacy `STAR_THRESHOLDS` array allocated 41 objects at module
// load just to feed a 41-iteration linear scan inside
// `generateSnapshotEvent`, which fired ~22 times per snapshot ×
// ~18 snapshots = ~400 times per match. The closed form runs
// the same math in O(1) with no allocation.
function contributionToStars(contribution: number): number {
  const i = Math.floor(contribution / 2.5);
  if (i <= 0) return 0;
  if (i >= 40) return 20;
  return i * 0.5;
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
  playerId?: number;
  relatedPlayerId?: number; // For assists, second yellow cards, etc.
  phase?: string;
  lane?: string;
  data?: Record<string, any>;
  eventScheduledTime?: Date; // Real-world time when this event should be revealed (calculated by processor)
}

// ============================================================================
// Push-phase player duel weights
// ============================================================================
//
// `simulateKeyMoment` picks one attacker (from the possession team) and one
// defender (from the defending team) for each push duel, using these
// integer weights per slot. Slots not in the table get weight 0, which
// makes the picker skip them — so a 3-5-2 formation with no RB naturally
// falls back to RWB / CBR / DMFR without any formation-specific branching.
//
// `attackingLane` is the lane the possession team is pushing down, in
// their own half: 'left' / 'center' / 'right'. The defending side picks
// from the **mirror** lane, so `attackingLane = 'left'` ⇒ defender comes
// from the right (RB region). This matches real football: a left-side
// winger's primary opponent is the right-back.
//
// GK is intentionally absent from all tables — goalkeepers don't take
// part in the open-field push duel. (Corner-kick / cross / set-piece
// saves happen in a separate code path; this picker only fires in
// `recordAttackSequence`'s push phase.)
//
// To re-tune, change weights here; the picker is unit-tested against
// these exact values. The defensive side's GK row is left as 0
// explicitly so future code that wants to add a "GK rushes out" branch
// can flip a single number without touching the picker.

const PUSH_ATTACKER_WEIGHT: Record<Lane, Record<string, number>> = {
  left: {
    // Winger-led run, supported by the fullback / wingback / left-side mids
    LW: 10,
    LM: 6,
    LB: 4,
    LWB: 4,
    CML: 4,
    CAML: 3,
    DMFL: 2,
    CFL: 2,
  },
  center: {
    // Striker drops short, central mids drive through the middle
    CF: 10,
    CFL: 8,
    CFR: 8,
    CM: 7,
    CML: 6,
    CMR: 6,
    CAM: 5,
    CAML: 4,
    CAMR: 4,
    DMF: 4,
    DMFL: 2,
    DMFR: 2,
    CB: 2,
    CBL: 1,
    CBR: 1,
  },
  right: {
    // Mirror of `left`
    RW: 10,
    RM: 6,
    RB: 4,
    RWB: 4,
    CMR: 4,
    CAMR: 3,
    DMFR: 2,
    CFR: 2,
  },
};

const PUSH_DEFENDER_WEIGHT: Record<Lane, Record<string, number>> = {
  left: {
    // Attacker coming from their left ⇒ defender on the right side
    RB: 10,
    RWB: 7,
    CBR: 6,
    DMFR: 5,
    CMR: 3,
    CAMR: 2,
    CFR: 1,
  },
  center: {
    // Central defender + defensive mid screen the middle
    CB: 10,
    CBL: 8,
    CBR: 8,
    DMF: 8,
    DMFL: 6,
    DMFR: 6,
    CM: 4,
    CML: 3,
    CMR: 3,
    CAM: 2,
    CAML: 1,
    CAMR: 1,
  },
  right: {
    // Mirror of `left` defender
    LB: 10,
    LWB: 7,
    CBL: 6,
    DMFL: 5,
    CML: 3,
    CAML: 2,
    CFL: 1,
  },
};

export class MatchEngine {
  private time: number = 0;
  private events: MatchEvent[] = [];

  /**
   * Engine phase guard. Tracks which segment of the match has
   * been simulated. Each engine instance is single-use — the
   * simulator worker creates a fresh MatchEngine per match run,
   * and the simulate* methods reject out-of-order calls.
   *
   * Why a state machine: the old code allowed
   *   engine.simulateMatch();
   *   engine.simulateExtraTime();
   *   engine.simulateExtraTime();   // <- silently appends AGAIN
   *
   * The third call would push another batch of ET events onto
   * `this.events`, which the persistence layer would then
   * double-insert into `match_event` if the worker retried.
   * A test in `match.engine.spec.ts` already acknowledged this
   * as footgun ("might define 'weird' behavior"). The guard
   * makes the failure mode loud.
   */
  private phase: 'idle' | 'match' | 'extra' | 'penalties' = 'idle';
  public homeScore: number = 0;
  public awayScore: number = 0;

  /**
   * Per-half injury time actually simulated. Populated by
   * `simulateMatch()` and `simulateExtraTime()` after each
   * half's stoppage calculation. The processor reads these
   * instead of rolling its own 1-5 random — the engine is now
   * the single source of truth for "how much stoppage was
   * played in this match".
   *
   * Range: 0-5 inclusive (user-specified minimum is 0 — a
   * clean half can still end on the dot of 45/90/105/120).
   */
  public firstHalfInjuryTime: number = 0;
  public secondHalfInjuryTime: number = 0;
  public extraTimeFirstHalfInjury: number = 0;
  public extraTimeSecondHalfInjury: number = 0;

  /**
   * Per-half stoppage-causing event counters. Reset by
   * `resetHalfStats()` at the top of each half (regular
   * 1st/2nd, ET 1st/2nd) and read by `computeInjuryTime()`
   * to derive the stoppage minutes. Counters are bumped from
   * the actual event-emit paths (`resolveFoul`,
   * `checkAndGenerateInjury`) so the same value can be used
   * both for stats and for the calculation.
   */
  private halfStats: {
    fouls: number;
    yellowCards: number;
    redCards: number;
    injuries: number;
  } = { fouls: 0, yellowCards: 0, redCards: 0, injuries: 0 };

  /**
   * Which in-game period the current minute belongs to. Set
   * by `simulateMinute()` so the per-half wrap-up code can
   * emit the right `period` field on events pushed after
   * `simulateKeyMoment` / `resolveFoul` (e.g. the half-time
   * event itself carries `period: 'half_time'`).
   *
   * The `injury` variants are used for minutes 45+1..45+N
   * (first-half stoppage) and 90+1..90+M (second-half
   * stoppage) so the FE can render them as a distinct band
   * on the match timeline.
   */
  private currentPeriod:
    | 'first_half'
    | 'first_half_injury'
    | 'second_half'
    | 'second_half_injury'
    | 'extra_time_first_half'
    | 'extra_time_first_half_injury'
    | 'extra_time_second_half'
    | 'extra_time_second_half_injury' = 'first_half';

  /**
   * Pre-baked set of "key moment" minutes for the half being
   * simulated. `simulateMatch()` / `simulateExtraTime()` set
   * this before each half's minute loop, then clear it after
   * the half ends so the per-minute helper can look it up
   * without juggling local closures. `null` means "no key
   * moments this minute" — used during injury time, where
   * we suppress attacks entirely.
   */
  private currentMomentTimes: Set<number> | null = null;

  /**
   * Compute stoppage minutes for the just-finished half.
   *
   * Per design (2026-08-18, simpler formula requested by
   * `Sw1Ng`): each significant stoppage-causing event adds a
   * fixed weight, then the total is capped at 5. There is no
   * floor — a half with zero injuries/cards/fouls ends on
   * the dot of 45/90/105/120. Weights are tuned to real
   * football practice:
   *
   *   - 1 injury   ≈ 1 min  (a serious injury needs treatment)
   *   - 1 red card ≈ 1 min  (dismissal + paperwork)
   *   - 2 yellows  ≈ 1 min  (a 2nd-yellow dismissal)
   *   - 6 fouls    ≈ 1 min  (the average foul "costs" ~10s)
   *
   * Why `Math.floor(fouls/6)` and not a linear weight: foul
   * volume is high (~15/half) and we don't want every
   * mediocre foul to bloat stoppage. The integer division
   * keeps the per-foul contribution to a sixth and rounds
   * down so 5 fouls still gives 0 — matching the "lots of
   * fouls but no real stoppages" feel of a typical half.
   */
  private static computeInjuryTime(s: {
    fouls: number;
    yellowCards: number;
    redCards: number;
    injuries: number;
  }): number {
    const total =
      s.injuries +
      s.redCards +
      Math.floor(s.yellowCards / 2) +
      Math.floor(s.fouls / 6);
    return Math.min(5, total);
  }

  private resetHalfStats(): void {
    this.halfStats = {
      fouls: 0,
      yellowCards: 0,
      redCards: 0,
      injuries: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Per-minute simulation body. Pulled out of the previous inline loop so all
  // four halves (1H, 2H, ET1, ET2) and their four injury-time stretches can
  // share the same code path. `period` and `isInjuryTime` are plumbed into
  // every event the helpers (`simulateKeyMoment`, `resolveFoul`,
  // `checkAndGenerateInjury`) push so the wire format carries a meaningful
  // `period` for FE rendering, not just a "phase === 'match'" boolean.
  // ---------------------------------------------------------------------------
  private simulateMinute(
    t: number,
    period:
      | 'first_half'
      | 'first_half_injury'
      | 'second_half'
      | 'second_half_injury'
      | 'extra_time_first_half'
      | 'extra_time_first_half_injury'
      | 'extra_time_second_half'
      | 'extra_time_second_half_injury',
    isInjuryTime: boolean,
  ): void {
    this.time = t;
    this.currentPeriod = period;

    // 1. Process tactical instructions (no-op for the wrapping half-end
    //    transition minutes, but harmless to call).
    this.processTacticalInstructions(t);

    // 2. Update condition (stamina decay & recovery). Treat the first
    //    minute of a new regulation/ET half as a "period start" so the
    //    break-recovery kicks in (15min HT, 5min ET break).
    const isPeriodStart =
      (period === 'second_half' && t === 46) ||
      (period === 'extra_time_second_half' && t === 106);
    this.homeTeam.updateCondition(1, isPeriodStart);
    this.awayTeam.updateCondition(1, isPeriodStart);

    // 3. Generate snapshot on the legacy cadence. We keep the existing
    //    special-cased minutes (45/46/90 for regulation, 105/120 for ET)
    //    so downstream snapshot consumers don't see a new pattern.
    const isSnapshotMinute =
      t % 5 === 0 ||
      t === 45 ||
      t === 46 ||
      t === 90 ||
      t === 91 ||
      t === 105 ||
      t === 106 ||
      t === 120;
    if (isSnapshotMinute) {
      this.homeTeam.updateSnapshot(t, this.homeTactics.pitchWidth);
      this.awayTeam.updateSnapshot(t, this.awayTactics.pitchWidth);
      this.generateSnapshotEvent(t);
    }

    // 4. Key moments — only on the engine's pre-baked `momentTimes` set,
    //    and **never** during injury time. Real football's stoppage is
    //    a couple of minutes of set pieces + cards; burning a 5-minute
    //    attack sequence on `simulateKeyMoment` would flood the event
    //    log with fabricated drama.
    //
    // 5. Per-minute independent foul (step 5 below). Real football:
    //    ~10-15 fouls per team per 90. We retain 12% per minute for
    //    regulation halves, 4% in injury time.
    //
    // [Bug fix 2026-08-19] Both step 4 (open-play goals inside
    // `simulateKeyMoment`) and step 5 (set-piece goals from
    // `resolveFoul` → `resolveSetPieceFromFoul` → `resolvePenalty` /
    // `resolveIndirectFreeKick` / `resolveDirectFreeKick` / `resolveCorner`)
    // can push a goal event in the same minute. The score scan must
    // cover BOTH paths, not just step 4 — otherwise set-piece goals
    // land in `match_event` but never increment `homeScore` /
    // `awayScore`, so `half_time` / `full_time` data, the match row,
    // and `match_team_stats.currentScore` all diverge from the event
    // log. The first version of this fix lived in the previous
    // `simulateMatch` minute loop (commit 30099d5); it got accidentally
    // re-inlined inside the `if (momentTimes.has(t))` block when
    // `simulateMinute` was extracted in 603b5b2. Putting the scan
    // back at the minute level is the same idea, just adapted to
    // the helper-method shape.
    const momentTimes = this.currentMomentTimes;
    const startOfMinute = this.events.length;
    if (momentTimes && momentTimes.has(t)) {
      this.simulateKeyMoment();
    }

    // Per-minute independent foul. Damped in injury time.
    const foulProb = isInjuryTime ? 0.04 : 0.12;
    if (t > 0 && Math.random() < foulProb) {
      this.resolveFoul();
    }

    // One canonical score scan per minute. Count every goal event
    // pushed during this minute — open-play from the key-moment path
    // AND set-piece from the foul path. Exactly once per goal,
    // regardless of which entry point emitted it.
    for (const event of this.events.slice(startOfMinute)) {
      if (event.type === 'goal') {
        if (event.teamName === this.homeTeam.name) this.homeScore++;
        else this.awayScore++;
      }
    }
  }

  private possessionTeam: Team;
  private defendingTeam: Team;
  private freshPossession: boolean = false; // 刚获得球权，第一次进攻享受反击加成

  private currentLane: Lane = 'center';
  private knownPlayerIds: Set<number> = new Set();

  // ------------------------------------------------------------------
  // Push-phase player duel state — populated by `simulateKeyMoment`'s
  // push block (or the LONG_SHOT branch), read by `recordAttackSequence`.
  // Reset at the top of each `simulateKeyMoment` call so a previous
  // sequence can't leak into the current one.
  // ------------------------------------------------------------------
  private pushDuelAttacker: TacticalPlayer | null = null;
  private pushDuelDefender: TacticalPlayer | null = null;
  private pushDuelMarginal: {
    attackerComposite: number | null;
    defenderComposite: number | null;
    marginal: number;
  } = { attackerComposite: null, defenderComposite: null, marginal: 0 };

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
    /**
     * Total fouls committed per team, counted once per `resolveFoul`
     * call regardless of card outcome (yellow / red / plain). Plain
     * fouls no longer emit a `foul` event (see `resolveFoul`), so this
     * counter is the only way the team-level foul count survives into
     * the persisted `MatchTeamStatsEntity.fouls` column.
     */
    foulStats: { home: number; away: number };
  };

  // 球员比赛数据统计
  private playerMatchStats: Map<
    number,
    {
      goals: number;
      assists: number;
      tackles: number; // 抢断成功次数
      shots: number; // 射门尝试次数 (goal/miss/save/blocked)
      saves: number; // 门将扑救次数
      appearances: number; // 出场次数（用于判断是否上场）
      minutesPlayed: number;
      contributionSum: number; // 累计贡献值（用于计算平均值）
      contributionCount: number; // 贡献值记录次数
      starsSum: number; // 累计星级
    }
  > = new Map();

  // 球员贡献历史（用于计算平均值）
  private playerContributionHistory: Map<
    number,
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

  /**
   * Running lane counters per team — used by the FE to render
   * per-snapshot panel rates that mirror the simulator exactly.
   *
   * - `attempts` / `pushSuccess`: empirical counts (kept for debugging and
   *   future use; not surfaced to the FE anymore).
   * - `pushProbabilitySum` / `midfieldProbabilitySum`: cumulative
   *   `duelProbability(...)` values from every push / midfield duel in
   *   this lane for this team. Snapshot emission divides by `attempts`
   *   to get the *expected* push success rate (probability) and by
   *   `attempts` (push) / `midfieldBattles` (midfield) to get the
   *   *expected* possession win rate. The FE reads these averages
   *   directly — no client-side division, no "1/1 = 100%" noise.
   *
   * Reset in the constructor so each engine instance starts fresh.
   */
  private laneCounters: {
    home: Record<
      Lane,
      {
        attempts: number;
        pushSuccess: number;
        pushProbabilitySum: number;
        midfieldProbabilitySum: number;
        midfieldBattles: number;
      }
    >;
    away: Record<
      Lane,
      {
        attempts: number;
        pushSuccess: number;
        pushProbabilitySum: number;
        midfieldProbabilitySum: number;
        midfieldBattles: number;
      }
    >;
  } = {
    home: {
      left: {
        attempts: 0,
        pushSuccess: 0,
        pushProbabilitySum: 0,
        midfieldProbabilitySum: 0,
        midfieldBattles: 0,
      },
      center: {
        attempts: 0,
        pushSuccess: 0,
        pushProbabilitySum: 0,
        midfieldProbabilitySum: 0,
        midfieldBattles: 0,
      },
      right: {
        attempts: 0,
        pushSuccess: 0,
        pushProbabilitySum: 0,
        midfieldProbabilitySum: 0,
        midfieldBattles: 0,
      },
    },
    away: {
      left: {
        attempts: 0,
        pushSuccess: 0,
        pushProbabilitySum: 0,
        midfieldProbabilitySum: 0,
        midfieldBattles: 0,
      },
      center: {
        attempts: 0,
        pushSuccess: 0,
        pushProbabilitySum: 0,
        midfieldProbabilitySum: 0,
        midfieldBattles: 0,
      },
      right: {
        attempts: 0,
        pushSuccess: 0,
        pushProbabilitySum: 0,
        midfieldProbabilitySum: 0,
        midfieldBattles: 0,
      },
    },
  };

  // 待记录的帽子戏法列表
  private pendingHatTricks: Array<{
    playerId: number;
    playerName: string;
    goals: number;
    minute: number;
  }> = [];

  constructor(
    public homeTeam: Team,
    public awayTeam: Team,
    private homeInstructions: TacticalInstruction[] = [],
    private awayInstructions: TacticalInstruction[] = [],
    private substitutePlayers: Map<number, TacticalPlayer> = new Map(), // All potential subs mapped by ID
    private homeBenchConfig: BenchConfig | null = null,
    private awayBenchConfig: BenchConfig | null = null,
    private weather: string = 'cloudy', // Default weather
    private homeTactics: TacticsConfig = DEFAULT_TACTICS,
    private awayTactics: TacticsConfig = DEFAULT_TACTICS,
    private logger?: LoggerService, // Optional Nest logger — passed from SimulationProcessor
    // Pre-computed crowd size from `match.attendance`. Sourced from the
    // pre-sim scheduler and emitted as an `attendance_announcement`
    // event at minute 0. Kept at the tail of the parameter list so the
    // legacy positional call sites in the spec (which never set
    // `attendance`) continue to compile — the field defaults to 0 and
    // the FE treats 0 as "no crowd context".
    private attendance: number = 0,
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
        shots: 0,
        saves: 0,
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
      foulStats: { home: 0, away: 0 },
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

  // ==========================================================================
  // Push-phase player duel helpers
  // ==========================================================================

  /**
   * Pick a non-sent-off player from `team` whose `positionKey` has a
   * positive weight in `weightTable`, weighted-random. Returns `null`
   * only if every candidate maps to weight 0 (a fully filtered pool
   * — the caller falls back to the existing pre-push attacker in that
   * case rather than aborting the simulation).
   *
   * Filters out:
   *   - Sent-off players (already on the sideline)
   *   - Substitutes whose `entryMinute` is in the future relative to
   *     `this.time` (a player can't push the ball if they haven't
   *     come on yet)
   *
   * The candidate pool is built first, then a single `Math.random()`
   * draw walks the cumulative-weight array. The `pool.length - 1`
   * fallback at the end is defensive against floating-point drift on
   * the final subtraction — without it an extreme `r` value
   * (Math.random() * totalWeight returning exactly totalWeight due
   * to rounding) would leave the function returning undefined.
   */
  private pickPlayerBySlotWeight(
    team: Team,
    weightTable: Record<string, number>,
  ): TacticalPlayer | null {
    // Single-pass weighted pick. The legacy code did three
    // separate walks of the team:
    //   1. `filter` (eligibility + lookup #1 of weightTable[pos])
    //   2. `reduce` (lookup #2 of weightTable[pos])
    //   3. `for` loop (lookup #3 of weightTable[pos])
    // Each call cost 3N lookups + 2 array allocations. Here we do
    // it in one pass: filter into `candidates`, then walk
    // `candidates` once to compute totalWeight and once more to
    // pick. The weight is cached on a parallel array so the
    // `weightTable` lookup fires exactly once per player.
    const candidates: TacticalPlayer[] = [];
    const weights: number[] = [];
    for (const p of team.players) {
      if (p.isSentOff) continue;
      if (p.entryMinute !== undefined && p.entryMinute > this.time) continue;
      const w = weightTable[p.positionKey] ?? 0;
      if (w <= 0) continue;
      candidates.push(p);
      weights.push(w);
    }
    if (candidates.length === 0) return null;

    let totalWeight = 0;
    for (let i = 0; i < weights.length; i++) totalWeight += weights[i];
    if (totalWeight <= 0) return null;

    let r = Math.random() * totalWeight;
    for (let i = 0; i < candidates.length; i++) {
      r -= weights[i];
      if (r <= 0) return candidates[i];
    }
    return candidates[candidates.length - 1];
  }

  /**
   * Composite score for a player on the **attacking** side of a push
   * duel. `dribbling` is the primary attribute (carry / beat-the-man);
   * `passing` and `pace` are secondary. Primary gets weight 2 so it
   * dominates 50% of the composite — the rest of the offensive skill
   * profile still matters, but the 1-v-1 is fundamentally about
   * whether the attacker can wriggle past his marker.
   *
   * Each attribute falls back to 50 when missing, so legacy test
   * fixtures (which only set a subset of attributes) and the
   * `coreSpecialty`-less synthetic players in the spec don't crash
   * the engine with NaN.
   */
  private getOffensiveComposite(p: Player): number {
    const a = p.attributes as unknown as Record<string, number | undefined>;
    const dribbling = a.dribbling ?? 50;
    const passing = a.passing ?? 50;
    const pace = a.pace ?? 50;
    return (dribbling * 2 + passing + pace) / 4;
  }

  /**
   * Composite score for a player on the **defending** side of a push
   * duel. `defending` is the primary attribute (tackle / intercept);
   * `positioning` and `composure` are secondary. Mirrors the
   * offensive formula so the two scores are on the same 0-100 scale
   * and the marginal comparison (see `computePlayerMarginal`) is
   * symmetric.
   */
  private getDefensiveComposite(p: Player): number {
    const a = p.attributes as unknown as Record<string, number | undefined>;
    const defending = a.defending ?? 50;
    const positioning = a.positioning ?? 50;
    const composure = a.composure ?? 50;
    return (defending * 2 + positioning + composure) / 4;
  }

  /**
   * Per-side `[-0.1, 0.1]` marginal: how much better (or worse) this
   * player is than the average of his own slot on the same team. The
   * baseline is the **rest of the team** in the same slot — including
   * the player himself would anchor the comparison to himself and
   * collapse the marginal to 0.
   *
   * The 100-point divisor maps a 10-OVR gap to a ±0.1 marginal
   * (matches the hard cap), so a 30-OVR swing (worst-in-slot vs
   * best-in-slot) saturates the cap. The clamp guarantees we stay
   * inside `[-0.1, 0.1]` even if attribute values are out-of-range
   * (e.g. legacy test fixtures with `0` defaults).
   */
  private computePlayerMarginal(
    player: TacticalPlayer,
    team: Team,
    scoreOf: (p: Player) => number,
  ): { marginal: number; playerComposite: number } {
    // Scan the team once for same-slot peers instead of allocating
    // a filtered array. We need the average composite of the
    // player's own slot — excluding the player himself (otherwise
    // the baseline anchors to himself and the marginal collapses
    // to 0).
    let baselineSum = 0;
    let baselineCount = 0;
    for (const p of team.players) {
      if (p === player) continue;
      if (p.positionKey !== player.positionKey) continue;
      baselineSum += scoreOf(p.player as Player);
      baselineCount++;
    }
    const playerScore = scoreOf(player.player as Player);
    const baseline =
      baselineCount > 0 ? baselineSum / baselineCount : playerScore;
    const raw = (playerScore - baseline) / 100;
    return {
      marginal: Math.max(-0.1, Math.min(0.1, raw)),
      // Surface the player's own composite so the caller (push
      // marginal) can reuse it without recomputing
      // `getOffensiveComposite(attacker.player)` /
      // `getDefensiveComposite(defender.player)` a second time.
      playerComposite: playerScore,
    };
  }

  /**
   * Final push-phase marginal. The attacker being above his slot
   * average pushes the marginal **up** (he wins more); the defender
   * being above his slot average pushes the marginal **down** (he
   * shuts down more attacks). Dividing by 2 keeps the combined
   * marginal inside `[-0.1, 0.1]` — the worst case is
   * "+0.1 - (-0.1) = 0.2" before the divide, "0.1" after.
   *
   * Either side being `null` (picker returned no candidate, e.g. an
   * exotic formation) yields a 0 marginal from that side, so the
   * remaining side's signal still flows through.
   */
  private computePushMarginal(
    attacker: TacticalPlayer | null,
    defender: TacticalPlayer | null,
  ): { attackerComposite: number | null; defenderComposite: number | null; marginal: number } {
    if (!attacker || !defender) {
      return { attackerComposite: null, defenderComposite: null, marginal: 0 };
    }
    const att = this.computePlayerMarginal(
      attacker,
      this.possessionTeam,
      this.getOffensiveComposite,
    );
    const def = this.computePlayerMarginal(
      defender,
      this.defendingTeam,
      this.getDefensiveComposite,
    );
    return {
      // Reuse the composites computed inside `computePlayerMarginal`
      // — saves one `getOffensiveComposite` + one
      // `getDefensiveComposite` call per push (each composes
      // 3 attribute lookups + 4 arithmetic ops).
      attackerComposite: att.playerComposite,
      defenderComposite: def.playerComposite,
      // att better ⇒ + ; def better ⇒ −
      marginal: (att.marginal - def.marginal) / 2,
    };
  }

  /**
   * Get tactics config for a team
   */
  private getTacticsForTeam(team: Team): TacticsConfig {
    return team === this.homeTeam ? this.homeTactics : this.awayTactics;
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
    if (this.phase !== 'idle') {
      throw new Error(
        `MatchEngine.simulateMatch() called in phase '${this.phase}' — ` +
          `each engine instance is single-use; create a new MatchEngine to re-simulate`,
      );
    }
    this.phase = 'match';

    // 清除属性计算缓存，确保每次模拟从零开始
    AttributeCalculator.clearCache();

    // Pre-cache per-player contributions for both lineups so the
    // first `updateSnapshot` (minute 0) and every later one hit the
    // `contributionCache` instead of triggering a `calculateContributionRaw`
    // per dimension on each read. Without this, the first snapshot
    // does 22 players × 9 (lane, phase) combinations = 198 cache-miss
    // computations; with it, the loop body is pure Map lookups. Late
    // substitutions / position swaps also call
    // `preCachePlayerContributions` on their own, so this only
    // needs to cover the starting XI + bench.
    for (const tp of this.homeTeam.players) {
      AttributeCalculator.preCachePlayerContributions(
        tp.player as Player,
        tp.positionKey,
      );
    }
    for (const tp of this.awayTeam.players) {
      AttributeCalculator.preCachePlayerContributions(
        tp.player as Player,
        tp.positionKey,
      );
    }
    // Bench substitutes (positionKey = 'SUB' on entry — `preCache`
    // gracefully no-ops for unknown keys since
    // `normalizePositionKey('SUB')` returns 'SUB' which isn't in
    // POSITION_WEIGHTS, but we still want them cached at their
    // eventual position). Defer to `substitutePlayer` (which
    // pre-caches under the new position when a sub actually comes
    // on) — bench players on entry have no contribution to compute
    // yet.

    this.events = [];
    this.time = 0;
    this.freshPossession = false;

    // KICKOFF Event — single emission. Previously three `kickoff` events were
    // pushed (data-only, home, away); the FE had no way to dedupe them and
    // "And we're off!" rendered three times at minute 0.
    this.events.push({
      minute: 0,
      type: 'kickoff',
      data: {
        homeTeam: this.homeTeam.name,
        awayTeam: this.awayTeam.name,
        period: 'first_half',
      },
    });

    // Weather Announcement Event
    this.events.push(
      generateWeatherAnnouncementEvent(
        0,
        this.weather,
        this.homeTeam.name,
        this.awayTeam.name,
      ),
    );

    // Attendance Announcement Event — separate neutral event so the FE
    // can render the crowd line independently of the weather one. The
    // value is read-only here; the upstream scheduler is responsible
    // for writing `match.attendance` before kicking off the engine.
    // A value of 0 (no upstream data) is preserved as-is so legacy
    // matches and tests still produce a syntactically valid event.
    this.events.push(
      generateAttendanceAnnouncementEvent(
        0,
        this.attendance,
        this.homeTeam.name,
        this.awayTeam.name,
      ),
    );

    // Player Introduction Event
    const getPlayerInfo = (p: TacticalPlayer) => ({
      name: (p.player as Player).name,
      // Canonical slot the editor stored (e.g. `CBL` not `CB`) so a
      // future FE blurb that renders "GK / CM" sees the same shape
      // the snapshot's `p` field emits. Falls back to the family
      // key for sub entrants who just swapped on.
      position: p.lineupSlotKey ?? p.positionKey,
    });

    // Get starting 11 (players with entryMinute === 0 or undefined)
    const homeStartingPlayers = this.homeTeam.players
      .filter((p) => !p.entryMinute || p.entryMinute === 0)
      .map(getPlayerInfo);
    const awayStartingPlayers = this.awayTeam.players
      .filter((p) => !p.entryMinute || p.entryMinute === 0)
      .map(getPlayerInfo);

    this.events.push(
      generatePlayerIntroductionEvent(
        0,
        this.homeTeam.name,
        this.awayTeam.name,
        homeStartingPlayers,
        awayStartingPlayers,
      ),
    );

    const MOMENTS_COUNT = 20;

    // Initial Snapshot
    this.homeTeam.updateSnapshot(0, this.homeTactics.pitchWidth);
    this.awayTeam.updateSnapshot(0, this.awayTactics.pitchWidth);
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

    // [RFC injury-time-2026] Per-half phased loop. Replaces the
    // legacy single `for (let t = 1; t <= 90; t++)` that emitted
    // `half_time` retroactively at t=46 and never simulated any
    // stoppage. The new structure is:
    //
    //   1. First half           1..45
    //   2. First-half injury    46..45+N
    //   3. <half_time whistle>
    //   4. Second half          46..90
    //   5. Second-half injury   91..90+M
    //   6. <full_time whistle>
    //
    // Each phase runs the same `simulateMinute` body — only the
    // `period` label, the moment-time set, and the per-minute
    // foul probability change. `currentMomentTimes` is set on
    // each regulation half and cleared during injury time so
    // no fabricated key-moment attacks land in stoppage.
    // ---------------------------------------------------------------------

    // First half — pre-bake 20 key moments across 1-90 (the
    // legacy "evenly distributed" schedule). We keep the
    // 1-90 range here so that the moment density is the same
    // regardless of how much injury time each half ends up
    // with; the second half will get its own 1-90 set so the
    // two halves feel symmetric.
    this.resetHalfStats();
    this.currentMomentTimes = this.bakeMomentTimes(MOMENTS_COUNT, 1, 90);
    for (let t = 1; t <= 45; t++) {
      this.simulateMinute(t, 'first_half', false);
    }

    // First-half injury time. Compute the stoppage from the
    // half's accumulated foul/card/injury counts, then loop
    // 45+1..45+N with no key moments and a dampened foul
    // probability. `momentTimes` is cleared so the helper
    // short-circuits the `simulateKeyMoment` branch.
    this.firstHalfInjuryTime = MatchEngine.computeInjuryTime(this.halfStats);
    this.currentMomentTimes = null;
    for (let i = 1; i <= this.firstHalfInjuryTime; i++) {
      this.simulateMinute(45 + i, 'first_half_injury', true);
    }

    // Half-time whistle. The `minute` field reflects the
    // actual in-game clock at the moment the ref blows
    // (i.e. 45 + N, not always 45), and `injuryTime` is
    // surfaced in the data so the FE / processor can read
    // the stoppage without re-running `computeInjuryTime`.
    this.events.push({
      minute: 45 + this.firstHalfInjuryTime,
      type: 'half_time',
      data: {
        period: 'half_time',
        homeScore: this.homeScore,
        awayScore: this.awayScore,
        injuryTime: this.firstHalfInjuryTime,
      },
    });

    // Second-half kickoff. We preserve the legacy wire shape
    // (`type: 'second_half'`, `minute: 46`, `data.period:
    // 'second_half'`) so downstream consumers keyed on
    // `type === 'second_half'` keep working. This is emitted
    // *after* the injury-time loop, so it lands at minute 46
    // even if N > 0 — a 1-minute "kickoff after extra time"
    // gap is realistic (ref signals players back, second-half
    // begins on the dot of 46).
    this.events.push({
      minute: 46,
      type: 'second_half',
      data: {
        period: 'second_half',
        homeScore: this.homeScore,
        awayScore: this.awayScore,
      },
    });

    // Second half — fresh counter set, same shape.
    this.resetHalfStats();
    this.currentMomentTimes = this.bakeMomentTimes(MOMENTS_COUNT, 1, 90);
    for (let t = 46; t <= 90; t++) {
      this.simulateMinute(t, 'second_half', false);
    }

    // Second-half injury time.
    this.secondHalfInjuryTime = MatchEngine.computeInjuryTime(this.halfStats);
    this.currentMomentTimes = null;
    for (let i = 1; i <= this.secondHalfInjuryTime; i++) {
      this.simulateMinute(90 + i, 'second_half_injury', true);
    }

    // FULL_TIME Event — the `minute` field follows the same
    // convention as `half_time` (actual stoppage-inclusive
    // clock), and `injuryTime` is included for symmetry so a
    // future FE can render "FT, +M stoppage" without reaching
    // back into `MatchEntity.firstHalfInjuryTime`.
    this.events.push({
      minute: 90 + this.secondHalfInjuryTime,
      type: 'full_time',
      data: {
        homeScore: this.homeScore,
        awayScore: this.awayScore,
        injuryTime: this.secondHalfInjuryTime,
      },
    });

    // Finalize player minutes played — accounts for the stoppage
    // stretches so a player who came on at minute 60 gets 30+N
    // minutes played when N=secondHalfInjuryTime.
    this.finalizePlayerMinutes(90 + this.secondHalfInjuryTime);

    // Clear the per-half moment set so a subsequent call to
    // `simulateExtraTime()` (which sets its own) doesn't see
    // stale minutes.
    this.currentMomentTimes = null;

    return this.events;
  }

  /**
   * Pre-bake a "key moment" minute set. The legacy engine
   * baked ~20 evenly-jittered moments across 1-90 (or ~7
   * across 90-120 for ET) to keep the per-minute attack
   * density roughly constant. We pull this out of
   * `simulateMatch` / `simulateExtraTime` so both halves
   * can call it without duplicating the loop. The output
   * is clamped to `[minMinute, maxMinute]` — the ET path
   * uses [91, 120], the regular path uses [1, 90].
   */
  private bakeMomentTimes(count: number, minMinute: number, maxMinute: number): Set<number> {
    const span = maxMinute - minMinute + 1;
    const result = new Set<number>();
    for (let i = 0; i < count; i++) {
      let nextTime =
        (minMinute - 1 + ((i * span) / count + (Math.random() * span) / count)) | 0;
      if (nextTime < minMinute) nextTime = minMinute;
      if (nextTime > maxMinute) nextTime = maxMinute;
      result.add(nextTime);
    }
    return result;
  }

  public simulateExtraTime(): MatchEvent[] {
    if (this.phase !== 'match') {
      throw new Error(
        `MatchEngine.simulateExtraTime() called in phase '${this.phase}' — ` +
          `must call simulateMatch() first`,
      );
    }
    this.phase = 'extra';

    // Extra Time Setup (30 mins = ~7 moments)
    const MOMENTS_COUNT = 7;

    // Update Snapshot for start of ET
    this.homeTeam.updateSnapshot(90, this.homeTactics.pitchWidth);
    this.awayTeam.updateSnapshot(90, this.awayTactics.pitchWidth);
    this.generateSnapshotEvent(90);

    // [RFC injury-time-2026] ET follows the same phased structure as
    // regular time: each ET half bakes its own moment set, runs
    // its 15 regulation minutes, then plays its 0-5 stoppage
    // minutes. The legacy code baked 7 moments across 91-120 and
    // never split the kickoffs into separate half loops, so the
    // second-half kickoff had to be retroactively emitted at t=106
    // — same anti-pattern as the regular second-half kickoff at
    // t=46. With the new structure, each half is its own clean
    // phase with the kickoff pushed *before* the per-minute loop.

    // ET 1st half: kickoff, then 91-105.
    this.events.push({
      minute: 90,
      type: 'kickoff',
      data: {
        period: 'extra_time',
        homeScore: this.homeScore,
        awayScore: this.awayScore,
      },
    });

    this.resetHalfStats();
    this.currentMomentTimes = this.bakeMomentTimes(MOMENTS_COUNT, 91, 105);
    for (let t = 91; t <= 105; t++) {
      this.simulateMinute(t, 'extra_time_first_half', false);
    }

    // ET 1st-half injury time.
    this.extraTimeFirstHalfInjury = MatchEngine.computeInjuryTime(
      this.halfStats,
    );
    this.currentMomentTimes = null;
    for (let i = 1; i <= this.extraTimeFirstHalfInjury; i++) {
      this.simulateMinute(105 + i, 'extra_time_first_half_injury', true);
    }

    // ET 2nd-half kickoff — pushed between the two halves so
    // the wire order is "1H whistle → 2H kickoff → 2H play".
    this.events.push({
      minute: 105 + this.extraTimeFirstHalfInjury,
      type: 'half_time',
      data: {
        period: 'extra_time_half_time',
        homeScore: this.homeScore,
        awayScore: this.awayScore,
        injuryTime: this.extraTimeFirstHalfInjury,
      },
    });
    this.events.push({
      minute: 105,
      type: 'kickoff',
      data: {
        period: 'extra_time_second_half',
        homeScore: this.homeScore,
        awayScore: this.awayScore,
      },
    });

    // ET 2nd half: 106-120.
    this.resetHalfStats();
    this.currentMomentTimes = this.bakeMomentTimes(MOMENTS_COUNT, 106, 120);
    for (let t = 106; t <= 120; t++) {
      this.simulateMinute(t, 'extra_time_second_half', false);
    }

    // ET 2nd-half injury time.
    this.extraTimeSecondHalfInjury = MatchEngine.computeInjuryTime(
      this.halfStats,
    );
    this.currentMomentTimes = null;
    for (let i = 1; i <= this.extraTimeSecondHalfInjury; i++) {
      this.simulateMinute(120 + i, 'extra_time_second_half_injury', true);
    }

    // FULL_TIME Event for ET — `minute` carries the stoppage-inclusive
    // clock and `injuryTime` is the sum of both ET halves' stoppage.
    // `simulatePenaltyShootout` (when invoked after) emits a *second*
    // `full_time` event at minute 120 with `isPenalty: true` to mark
    // the shootout result; we deliberately keep that behavior so the
    // FE's "match ended in penalties" path still triggers.
    this.events.push({
      minute: 120 + this.extraTimeSecondHalfInjury,
      type: 'full_time',
      data: {
        homeScore: this.homeScore,
        awayScore: this.awayScore,
        injuryTime:
          this.extraTimeFirstHalfInjury + this.extraTimeSecondHalfInjury,
      },
    });

    // Finalize player minutes played — accounts for both ET halves'
    // stoppage. Note: if `simulatePenaltyShootout` runs after this,
    // it does not touch player minutes (penalty kicks aren't "play
    // time" for the purposes of `minutesPlayed`).
    this.finalizePlayerMinutes(120 + this.extraTimeSecondHalfInjury);

    this.currentMomentTimes = null;

    return this.events;
  }

  public simulatePenaltyShootout(): MatchEvent[] {
    if (this.phase !== 'extra') {
      throw new Error(
        `MatchEngine.simulatePenaltyShootout() called in phase '${this.phase}' — ` +
          `must call simulateExtraTime() first`,
      );
    }
    this.phase = 'penalties';

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

      // v2 SAVING_MASTER — multiplies the penalty-save multiplier
      // (1.0 baseline, so 1.10 / 1.07 / 1.143 for Silver/Bronze/Gold).
      gMultiplier *= gkSaveMultiplier(gPlayer);

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
      this.recordPenaltyEvent(hKicker, hGoal, homePKScore, awayPKScore, this.homeTeam);

      // Check if decided
      if (this.isShootoutDecided(homePKScore, awayPKScore, 5, round, true))
        break;

      // Away team kicks
      const aKicker = awayKickers[(round - 1) % awayKickers.length];
      const aGoal = resolvePenalty(aKicker, homeGK);
      if (aGoal) awayPKScore++;
      this.recordPenaltyEvent(aKicker, aGoal, homePKScore, awayPKScore, this.awayTeam);

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
        this.recordPenaltyEvent(hKicker, hGoal, homePKScore, awayPKScore, this.homeTeam);

        if (aGoal) awayPKScore++;
        this.recordPenaltyEvent(aKicker, aGoal, homePKScore, awayPKScore, this.awayTeam);

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
      // Per-team foul count. Counts every foul call regardless of
      // card outcome. The processor reads this to populate
      // `MatchTeamStatsEntity.fouls` now that plain fouls no longer
      // emit a `foul` event.
      foulStats: { ...this.matchStats.foulStats },
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
    // Build a playerId -> send-off-minute map from the event
    // stream. The engine emits a `red_card` event at the
    // dismissal minute (match.engine.ts:2814-2855 - covers
    // both direct reds and second-yellow reds) but
    // `sendOffPlayer` doesn't store the minute on the player
    // object. Re-derive here so a red-carded player gets
    // credited up to the dismissal minute, not the full 90.
    // The pre-fix behaviour was a starter with red card, no
    // sub event, gets credited with the full 90 minutes
    // which broke starts/sub classification (a 30-min
    // red-carded starter was counted as a full-match start)
    // and skewed the season-level minutes aggregate in
    // PlayerCompetitionStatsEntity.
    const sentOffMinute = new Map<number, number>();
    for (const e of this.events) {
      if (e.type === 'red_card' && e.playerId) {
        // A player can only be sent off once per match, so a
        // plain `set` is correct (no need to min with prior value).
        sentOffMinute.set(e.playerId, e.minute);
      }
    }

    // Update all players who were on the field
    for (const [playerId, stats] of this.playerMatchStats.entries()) {
      if (stats.appearances > 0 && stats.minutesPlayed === 0) {
        // Player was on field but no minutes tracked yet (substituted in)
        // This is handled at substitution time, but handle edge case
        const player = this.findPlayerById(playerId);
        if (player) {
          const entryMinute = player.entryMinute || 0;
          // If the player was sent off, cap at the
          // dismissal minute (otherwise they get full 90
          // even though they left the pitch at minute 30).
          const exitMinute = sentOffMinute.has(playerId)
            ? sentOffMinute.get(playerId)!
            : finalMinute;
          stats.minutesPlayed = exitMinute - entryMinute;
        }
      }
    }

    // Update starting players who played full match.
    // We must SKIP any starter who was sent off (minute 0
    // red card, no sub event) because the earlier loop
    // above already credited them up to the dismissal
    // minute. Without the explicit !sentOffMinute.has
    // check, the second loop would re-set their
    // minutesPlayed to finalMinute (90) and silently
    // overwrite the dismissal-minute cap. The check is on
    // sentOffMinute (not on stats.minutesPlayed) because
    // for a starter sent off at minute 0 the entryMinute-
    // aware loop sets minutesPlayed to 0 - 0 = 0 which
    // still satisfies the outer minutesPlayed === 0 guard
    // - so we'd re-enter this branch and clobber the 0
    // with 90. (The pre-fix code did exactly that, see the
    // test this fix unblocks.)
    for (const team of [this.homeTeam, this.awayTeam]) {
      for (const tp of team.players) {
        const playerId = (tp.player as Player).id;
        const stats = this.playerMatchStats.get(playerId);
        if (
          stats &&
          stats.appearances > 0 &&
          stats.minutesPlayed === 0 &&
          !sentOffMinute.has(playerId)
        ) {
          // True full-match starter (no sub, no send-off):
          // credit the full finalMinute (90+injury, or
          // 120+ET injury).
          stats.minutesPlayed = finalMinute;
        }
      }
    }
  }

  /**
   * Find player by ID across all teams
   */
  private findPlayerById(playerId: number): TacticalPlayer | undefined {
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
    playerId: number;
    playerName: string;
    teamName: string;
    position: string;
    goals: number;
    assists: number;
    tackles: number;
    shots: number;
    saves: number;
    appearances: number;
    minutesPlayed: number;
    avgContribution: number;
    avgStars: number;
  }> {
    const result: Array<{
      playerId: number;
      playerName: string;
      teamName: string;
      position: string;
      goals: number;
      assists: number;
      tackles: number;
      shots: number;
      saves: number;
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
            stats.shots > 0 ||
            stats.saves > 0 ||
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
            avgContribution =
              Math.round((totalContribution / history.length) * 10) / 10;
            avgStars = Math.round(((totalStars / history.length)) * 100) / 100;
          }

          result.push({
            playerId: player.id,
            playerName: player.name,
            teamName: team.name,
            position: tp.positionKey,
            goals: stats.goals,
            assists: stats.assists,
            tackles: stats.tackles,
            shots: stats.shots,
            saves: stats.saves,
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
      // Same `/100` fold as `formatLanes` above (see header on that
      // helper). Keeping both emit sites on the same 0–10 magnitude
      // means the FE never has to do display math on these numbers.
      return {
        left: {
          attack: Math.round(((totals.left.attack / count / 100)) * 100) / 100,
          defense: Math.round(((totals.left.defense / count / 100)) * 100) / 100,
          possession:
            Math.round((totals.left.possession / count / 100) * 100) / 100,
        },
        center: {
          attack: Math.round(((totals.center.attack / count / 100)) * 100) / 100,
          defense: Math.round(((totals.center.defense / count / 100)) * 100) / 100,
          possession:
            Math.round((totals.center.possession / count / 100) * 100) / 100,
        },
        right: {
          attack: Math.round(((totals.right.attack / count / 100)) * 100) / 100,
          defense: Math.round(((totals.right.defense / count / 100)) * 100) / 100,
          possession:
            Math.round((totals.right.possession / count / 100) * 100) / 100,
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
    hatTricks: Array<{
      playerId: number;
      playerName: string;
      goals: number;
      minute: number;
    }>;
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
      hatTricks: this.pendingHatTricks,
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
    team: Team,
  ) {
    // `team` is the kicker's team (passed by the caller — the
    // shootout loop already knows which side is kicking). Was
    // previously derived by `this.homeTeam.players.some(...)` on
    // every call, which is an 11-element linear scan per kick
    // (up to ~20 kicks per shootout — small absolute cost, but
    // zero reason to keep it).
    const p = kicker.player as Player;
    this.events.push({
      minute: 120,
      type: goal ? 'penalty_goal' : 'penalty_miss',
      teamName: team.name,
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

  /**
   * Decide whether a tactical instruction fires given the team's
   * current score status. Mirrors the frontend's `EventCondition`
   * values: `always` / `leading` / `trailing` / `tied` /
   * `notLeading` / `notTrailing`. `tied` is treated as a synonym of
   * `draw` (the simulator's internal `ScoreStatus`).
   */
  private shouldFire(
    condition: EventCondition | undefined,
    status: ScoreStatus,
  ): boolean {
    if (!condition || condition === 'always') return true;
    if (condition === 'leading') return status === 'leading';
    if (condition === 'trailing') return status === 'trailing';
    if (condition === 'tied') return status === 'draw';
    if (condition === 'notLeading') return status !== 'leading';
    if (condition === 'notTrailing') return status !== 'trailing';
    return true;
  }

  private applyInstructionsForTeam(
    team: Team,
    instructions: TacticalInstruction[],
    minute: number,
    scoreStatus: ScoreStatus,
  ) {
    // Walk the team's instructions directly (was an `Array.filter`
    // allocation). 90 minutes × 2 teams = 180 calls per match, so
    // even with 0-5 instructions per team the throwaway array
    // churned the GC. For-loop walks in place — `pending` is only
    // referenced inside this function so there's no behavior
    // change.
    const pending: TacticalInstruction[] = [];
    for (let i = 0; i < instructions.length; i++) {
      const ins = instructions[i];
      if (ins.minute !== minute) continue;
      if (!this.shouldFire(ins.condition, scoreStatus)) continue;
      pending.push(ins);
    }

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
              shots: 0,
              saves: 0,
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
        team.updateSnapshot(this.time, this.getTacticsForTeam(team).pitchWidth); // Immediate re-calculation
        // Emit a snapshot event only for player swaps — `move` /
        // `position_swap` are re-shuffles, not lineup changes, and
        // don't carry the kind of "this is a moment to land on"
        // signal the user asked for. We still keep the pre-existing
        // updateSnapshot above for downstream consumers that read
        // team state directly.
        if (ins.type === 'swap') {
          this.generateSnapshotEvent(this.time);
        }
      }
    }
  }

  private getPlayerById(team: Team, id: number): Player | undefined {
    return team.players.find((p) => (p.player as Player).id === id)?.player;
  }

  private getPlayerAtPos(team: Team, pos: string): Player | undefined {
    return team.players.find((p) => p.positionKey === pos)?.player;
  }

  private simulateKeyMoment() {
    this.changeLane();

    // Reset the push-duel state at the start of each sequence. A
    // previous `simulateKeyMoment` (from the same or previous match
    // — engines are single-use but the caller may chain several
    // methods) must not bleed its selection into this one.
    this.pushDuelAttacker = null;
    this.pushDuelDefender = null;
    this.pushDuelMarginal = {
      attackerComposite: null,
      defenderComposite: null,
      marginal: 0,
    };

    // The previous `teamMaxEventCached` memoization wrapper was used
    // by the v2.0 team-max single-pick helper. The new decision-class
    // helper `teamSampledEventMultiplier` (in `specialty.system.ts`)
    // consumes a random draw on every call, so it can't share a
    // cache the same way — caching would make the engine
    // deterministic and break the weighted-pick semantics. We
    // accept the per-call O(N) walk over ~11 players as the
    // steady-state cost. The strength-class
    // `teamProductEventMultiplier` is already deterministic per
    // (players, event) and could be memoized here if profiling
    // shows it matters; for now it's a per-call walk too.

    // Step 1: Foul Check (提高频率,配合 90 分钟独立 foul event 让总犯规 ~14-16/场,
    // 接近真实足球 20-26 但不至于过密)
    if (Math.random() < 0.3) {
      this.resolveFoul();
      return; // Foul interrupts the play
    }

    // Step 1b: General injury check - represents muscle strain/joint issues during play
    // Check both teams (random player from each team)
    this.checkAndGenerateInjury(this.homeTeam, 'other');
    this.checkAndGenerateInjury(this.awayTeam, 'other');

    // Step 2: Midfield Battle (Possession)
    // 双方都用 'possession' phase 才能形成有效 ratio
    // 之前用 home='possession' vs away='defense' 是交叉 phase，
    // 不同 phase 数量级不同，ratio ≈ 1，P ≈ 0.5，导致控球永远 50/50
    const homeControl = this.homeTeam.calculateLaneStrength(
      this.currentLane,
      'possession',
    );
    const awayControl = this.awayTeam.calculateLaneStrength(
      this.currentLane,
      'possession',
    );

    // v2 TACKLER — team's midfield control is boosted by a
    // decision-class team multiplier. Picks one TACKLER on the pitch
    // weighted by their per-player multiplier (1.0 / 1.20 / 1.40
    // for Bronze/Silver/Gold). Replaces the v1 "0.08 per TACKL
    // player" additive model and the v2.0 team-max single-pick
    // model. The weighted pick gives lineup diversity real
    // numerical meaning — a Gold + Silver mix produces a different
    // number from a Gold-only lineup, even though both have a "best
    // TACKLER on the pitch" candidate.
    const homeTackleBonus = teamSampledEventMultiplier(
      this.homeTeam.players,
      'midfield_control',
    );
    const awayTackleBonus = teamSampledEventMultiplier(
      this.awayTeam.players,
      'midfield_control',
    );

    const homeControlWithBonus = homeControl * homeTackleBonus;
    const awayControlWithBonus = awayControl * awayTackleBonus;

    // 拼抢：amplification=1.7（中场对抗温和放大，比主推更平）
    // anchorProbability=0.6(比 push 0.55 略高,让弱队中场被压制更明显)
    // 同时累加 home 视角的预期控球概率——FE 的 Possession Share 面板
    // 读 lc.mpr（=sum(midfieldProbability) / midfieldBattles），不再是
    // ls.pos 的强度比，而是 engine 用 duelProbability 算出来的真实预期。
    const midfieldProbability = duelProbability(
      homeControlWithBonus,
      awayControlWithBonus,
      {
        amplification: 1.7,
        baseline: 0.5,
        anchorRatio: 2.0,
        anchorProbability: 0.6,
      },
    );
    const homeWinsPossession = Math.random() < midfieldProbability;

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

    // v2 SPEEDSTER — counter attack boost. Decision-class — pick
    // one SPEEDSTER weighted by per-player multiplier (1.0 / 1.14 /
    // 1.20 / 1.28 for no-spec / B / S / G). Replaces the v1 "0.05
    // per CNTR player" additive model and the v2.0 team-max single
    // pick. The engine's selectShooter also weights SPEEDSTERs
    // more heavily during counter phases — see
    // `selectShooter(..., { phase: 'counter' })`.
    if (this.freshPossession) {
      const counterBonus = teamSampledEventMultiplier(
        this.possessionTeam.players,
        'select_shooter_counter',
      );
      // counterBonus is 1.0 when no SPEEDSTER; otherwise the team
      // gets a multiplicative boost on the counter attack.
      if (counterBonus > 1.0) {
        attPower *= counterBonus;
      }
      this.freshPossession = false; // 重置标志
    }

    // Step 4: Attack Push (Attack vs Defense)
    // 远射跳过推进阶段
    let pushSuccess = false;
    // Attacker-perspective expected push success probability (0..1) from
    // duelProbability(attPower, defPower, ...). Defaults to 0 when the
    // sequence skips the push phase (intercept-then-shot, long_shot), so
    // the accumulator never sees a fabricated probability.
    let pushProbability = 0;
    let preSelectedShooter: TacticalPlayer | null = null;
    let preSelectedPasser: TacticalPlayer | null = null;
    let interceptTriggered = false;
    let effectiveAttPower: number;
    let effectiveDefPower: number;
    if (attackType !== AttackType.LONG_SHOT) {
      preSelectedShooter = this.selectShooter(this.possessionTeam, {
        phase: this.freshPossession ? 'counter' : 'normal',
        attackType,
      });
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

      // v2.5 pass-type specialty hooks — single call with attackType.
      // Replaces the v2.0 three-branch `if` chain that missed
      // SHORT_PASS (the most common pass type, ~80% of NORMAL
      // shots end up short-pass-built). Now:
      //   DRIBBLER (1.15) fires only on DRIBBLE
      //   PLAYMAKER (1.10) fires on any pass type (THROUGH_PASS /
      //                     SHORT_PASS / CROSS)
      //   CROSSER (1.12) fires only on CROSS
      //   PHYSICAL_BEAST (1.15) fires on any pushDuel (body contact
      //                        semantic, not delivery-specific)
      // The gate lives in `pushOffenseMultiplier`; the engine
      // always passes `attackType` so DRIBBLER / CROSSER don't
      // accidentally fire on wrong attack types.
      if (passerPlayer) {
        effectiveAttPower *= pushOffenseMultiplier(
          passerPlayer,
          AttackType[attackType] as Parameters<typeof pushOffenseMultiplier>[1],
        );
      }

      // v2 AERIAL_THREAT (formerly HEADER): team gets a multiplicative
      // boost on CROSS attacks. Decision-class — pick one AERIAL_THREAT
      // (or PHYSICAL_BEAST, which shares the shot_header hook row)
      // weighted by their per-player multiplier (1.0 / 1.10 / 1.40).
      // Replaces v2.0 team-max single pick so lineup diversity (Gold +
      // Silver mix vs Gold-only) has a different outcome. See
      // §2.1 + §2.10 in the design doc.
      if (attackType === AttackType.CROSS) {
        const attackerHeaderBonus = teamSampledEventMultiplier(
          this.possessionTeam.players,
          'shot_header',
        );
        if (attackerHeaderBonus > 1.0) {
          effectiveAttPower *= attackerHeaderBonus;
        }
      }

      // v2 AERIAL_THREAT on the defending side — boosts defPower
      // during CROSS attacks. Same decision-class pattern as the
      // attacker side.
      let effectiveDefPower = defPower;
      if (attackType === AttackType.CROSS) {
        const defenderHeaderBonus = teamSampledEventMultiplier(
          this.defendingTeam.players,
          'shot_header',
        );
        if (defenderHeaderBonus > 1.0) {
          effectiveDefPower *= defenderHeaderBonus;
        }
      }

      // v2 TACKLER (1.0 / 1.105 / 1.15 / 1.21) + WALL (1.0 / 1.126 /
      // 1.18 / 1.252) on the defending side — boosts defPower during
      // the push duel. Strength-class — every eligible defender
      // contributes multiplicatively, capped at 1.80 so a deep
      // defender lineup doesn't over-scale (5+ TACKLERs would
      // otherwise push defPower past 2.0). Applies to all attack
      // types (not just CROSS) because a TACKLER's tackle chance
      // matters whenever the defender is contesting the push.
      const defenderPushBonus = teamProductEventMultiplier(
        this.defendingTeam.players,
        'push_defense',
        /* cap */ 1.80,
      );
      if (defenderPushBonus > 1.0) {
        effectiveDefPower *= defenderPushBonus;
      }

      // ==========================================
      // 战术维度加成：防线高度 → 攻守强度修正
      // ==========================================
      const attDefConfig = this.getTacticsForTeam(this.possessionTeam);
      const defDefConfig = this.getTacticsForTeam(this.defendingTeam);

      // 进攻方受防线高度影响（进攻加成）
      const attDefMult =
        DEFENSIVE_LINE_MODIFIERS[attDefConfig.defensiveLine].attackMult;
      // 防守方受防线高度影响（防守加成）
      const defDefMult =
        DEFENSIVE_LINE_MODIFIERS[defDefConfig.defensiveLine].defenseMult;

      effectiveAttPower *= attDefMult;
      effectiveDefPower *= defDefMult;

      // ==========================================
      // 反击机制：当防守强度远高于进攻时，增加断球概率和反击加成
      // ==========================================
      const DEF_THRESHOLD = 1.3; // defRatio 阈值
      const MAX_INTERCEPT_CHANCE = 0.25; // 最高25%断球率
      const MAX_COUNTER_BONUS = 0.3; // 最高30%反击加成

      interceptTriggered = false;
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

          // 先保存原始进攻方用于反击加成计算
          const originalAttackingTeam = this.possessionTeam;

          // 角色互换： possessionTeam 变成 defendingTeam，defendingTeam 变成 possessionTeam
          const temp = this.possessionTeam;
          this.possessionTeam = this.defendingTeam;
          this.defendingTeam = temp;

          // 重新计算新进攻方的effectiveAttPower（换了队）
          const newAttPower = this.possessionTeam.calculateLaneStrength(
            this.currentLane,
            'attack',
          );
          const newDefConfig = this.getTacticsForTeam(this.defendingTeam);
          const newAttDefConfig = this.getTacticsForTeam(this.possessionTeam);
          const newAttDefMult =
            DEFENSIVE_LINE_MODIFIERS[newAttDefConfig.defensiveLine].attackMult;
          const newDefDefMult =
            DEFENSIVE_LINE_MODIFIERS[newDefConfig.defensiveLine].defenseMult;

          effectiveAttPower = newAttPower * newAttDefMult;
          const newDefPower =
            this.defendingTeam.calculateLaneStrength(
              this.currentLane,
              'defense',
            ) * newDefDefMult;

          // 反击加成，受tempo counterVulnerability影响
          // 快节奏队反击更危险（counterVulnerability低→反击加成高）
          const counterVuln =
            TEMPO_MODIFIERS[
              (originalAttackingTeam === this.homeTeam
                ? this.awayTactics
                : this.homeTactics
              ).tempo
            ].counterVulnerability;
          const counterBonus = Math.min(
            MAX_COUNTER_BONUS,
            (defRatio - DEF_THRESHOLD) * 0.15 * (1 / counterVuln),
          );
          effectiveAttPower *= 1 + counterBonus;

          // 拦截成功后直接射门（不需要再走推进流程）
          pushSuccess = true;
        }
      }

      // v2 SPEEDSTER counter attack boost (second application — this
      // path runs after the pre-passing-block freshPossession check
      // above; v2 re-applies it here for the same reason v1 did:
      // the second block guards the pushDuel computation
      // specifically). The decision-class helper means the boost is
      // deterministic per call (modulo the random draw) and
      // identical-shape on both application points.
      if (!interceptTriggered && this.freshPossession) {
        const counterBonus = teamSampledEventMultiplier(
          this.possessionTeam.players,
          'select_shooter_counter',
        );
        if (counterBonus > 1.0) {
          effectiveAttPower *= counterBonus;
        }
      }

      // ==========================================
      // 战术维度加成：tempo → 推进k值修正
      // SLOW更稳定（k低），FAST更冒险（k高）
      // ==========================================
      const attTempo = TEMPO_MODIFIERS[attDefConfig.tempo];
      const effectiveK = attackConfig.pushK * (attTempo.duelK / 0.5);

      // Push-phase player duel — pick one attacker + one defender
      // (per the slot-weight tables at the top of the file), then
      // fold their composite-skill differential into the team-level
      // push probability as a `[-0.1, 0.1]` marginal. The team-level
      // number is still the dominant signal — the marginal is a
      // "small adjustment" that makes the FE's "X was dispossessed
      // by Y" narrative land on a believable 1-v-1 every time.
      //
      // For `interceptTriggered` (midfield steal → instant shot) we
      // skip the duel — there is no push to win or lose, so no
      // marginal is appropriate. `pushDuelAttacker/Defender/Marginal`
      // stay at the `null / 0` reset values from the top of
      // `simulateKeyMoment`.
      if (!interceptTriggered) {
        this.pushDuelAttacker = this.pickPlayerBySlotWeight(
          this.possessionTeam,
          PUSH_ATTACKER_WEIGHT[this.currentLane],
        );
        this.pushDuelDefender = this.pickPlayerBySlotWeight(
          this.defendingTeam,
          PUSH_DEFENDER_WEIGHT[this.currentLane],
        );
        this.pushDuelMarginal = this.computePushMarginal(
          this.pushDuelAttacker,
          this.pushDuelDefender,
        );
      }

      // 推进判定（正常流程）
      if (!interceptTriggered) {
        // 主推进参数：
        // - amplification=1.5（弱凸性，避免强队推进率过度碾压）
        // - baseline=0.55(对等双方 push 成功率 ~50%,真实足球控球方推进到前场
        //   的概率在 50-60% 区间)
        // - anchorProbability=0.6(跟 baseline 0.55 拉开,k 不为 0,曲线随 OVR 变化)
        // 同时计算 attacker 视角的预期推进概率（0..1），通过 recordAttackSequence
        // 累加到 laneCounters.pushProbabilitySum，给 FE 的 Push Success Rate 面板
        // 提供模型输出而不是 empirical 命中率。
        const pushDuelOptions = {
          amplification: 1.5,
          baseline: 0.55,
          anchorRatio: 2.0,
          anchorProbability: 0.6,
        };
        const teamP = duelProbability(
          effectiveAttPower,
          effectiveDefPower,
          pushDuelOptions,
        );
        // Apply the player-duel marginal and clamp to keep a single
        // Bernoulli draw within sane bounds. The clamp guards against
        // a future OVR gap that might push teamP to 0.95 and a +0.1
        // marginal to 1.05, which would make every push succeed.
        pushProbability = Math.max(
          0.01,
          Math.min(0.99, teamP * (1 + this.pushDuelMarginal.marginal)),
        );
        pushSuccess = Math.random() < pushProbability;
        // 如果进攻失败，防守方获得球权并发动反击。
        // Mirror the `interceptTriggered` path below: swap
        // `possessionTeam` / `defendingTeam` so the upcoming
        // counter-attack sees the right "new attacker" / "new
        // defender" pair. Without this swap, `freshPossession =
        // true` would still fire on the next `simulateKeyMoment`
        // (the flag is read at line ~1849 to apply a counter-attack
        // boost), but the boost would land on whichever side
        // happened to win the *next* midfield duel — i.e. it
        // would be applied to the wrong team about half the time.
        // Swapping here keeps the possession flag and the team
        // identity in lockstep, so the counter-attack bonus
        // correctly rewards the side that actually won the ball.
        if (!pushSuccess) {
          const temp = this.possessionTeam;
          this.possessionTeam = this.defendingTeam;
          this.defendingTeam = temp;
          this.freshPossession = true;
        } else {
          // 推进成功：进攻方冲刺过人受伤检核
          this.checkAndGenerateInjury(this.possessionTeam, 'sprint');
        }
      } else {
        // 反击触发后，重置标志（反击加成已应用）
        this.freshPossession = false;
        // 拦截成功后直接射门（不需要再走推进流程）——push 阶段被跳过，
        // pushProbability 保持 0，accumulator 不会计入假数据。
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
    // shotVariance is set inside the `if (shooter)` block but read
    // outside it (in the wire payload). Hoisted so the post-scope
    // payload writer can see it. Stays 0 when there's no shooter,
    // in which case the wire payload is `shot: null` anyway.
    let shotVariance = 0;

    // 远射：直接起脚，不经过推进
    if (attackType === AttackType.LONG_SHOT) {
      shooter = this.selectLongShotShooter(this.possessionTeam);
      // Long shots skip the push duel entirely, so the
      // `pushDuelAttacker` / `pushDuelDefender` slot still needs a
      // sensible value for the event payload. We credit the shooter
      // as the duel "attacker" so the FE can name him; the
      // `defender` slot stays null (no marker was beaten) and the
      // marginal is 0 (no 1-v-1 happened).
      this.pushDuelAttacker = shooter;
      this.pushDuelDefender = null;
      this.pushDuelMarginal = {
        attackerComposite: shooter
          ? this.getOffensiveComposite(shooter.player as Player)
          : null,
        defenderComposite: null,
        marginal: 0,
      };
      if (shooter) {
        const player = shooter.player as Player;
        shotType = ShotType.LONG_SHOT;
        finalShootRating = this.calculateLongShotRating(player);
        // long_shooter: 远射评分 +10%
        // v2: no active "long shot" specialty (LONG_SHOT is deprecated
        // → mapped to COMPOSED). The shotLongMultiplier hook is in
        // the table but no specialty currently has an entry for it,
        // so this is a no-op baseline call kept for forward-compat
        // (a future "LONG_SHOT v3" could populate it without touching
        // this line).
        finalShootRating *= shotLongMultiplier(player);

        const gk = this.defendingTeam.getGoalkeeper();
        gkRating = gk ? this.defendingTeam.getSnapshot()?.gkRating || 100 : 100;

        const shotConfig = SHOT_TYPE_CONFIG[shotType];
        // 直接从 shotConfig 读取 baseline（不再从 k+offset 反推）
        const isGoal = resolveDuelPure(finalShootRating, gkRating, {
          amplification: 2.0,
          baseline: shotConfig.baseline,
          anchorRatio: 2.0,
          anchorProbability: 0.55,
        });

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
      // 常规进攻：推进成功后选择射门类型
      shotType = this.selectShotType(attackType);
      // 如果是反击（interceptTriggered），进攻方已换，需要重新选射手
      // 否则复用预选的射手
      if (interceptTriggered) {
        shooter = this.selectShooter(this.possessionTeam, {
          phase: this.freshPossession ? 'counter' : 'normal',
          shotType: shotType,
          attackType,
        });
      } else {
        shooter = preSelectedShooter;
      }

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
            // v2: rebound bonuses are now handled by POACHER's
            // `select_shooter_rebound` weight at shooter-selection
            // time. The shoot-rating multiplier is 1.0 unless a future
            // specialty populates the `shot_rebound` event row.
            finalShootRating *= shotReboundMultiplier(player);
            break;
          case ShotType.NORMAL:
            finalShootRating = this.calculateShootRating(player);
            break;
          default:
            finalShootRating = this.calculateShootRating(player);
        }

        // 随机波动因子 — 这个 random 同时驱动两件事:
        //   1. finalShootRating 的噪声,决定 goal 概率 (玩家真实"准头")
        //   2. shotQuality 0-100 评分,描述"这脚本身怎么样"
        // 必须用同一个 random draw,这样 wire 上看到的 shotQuality 跟
        // 实际决定是否进球的扰动是同一次,UI 跟 game logic 自洽。
        shotVariance = Math.random();
        finalShootRating *= 0.6 + shotVariance * 0.5;

        const gk = this.defendingTeam.getGoalkeeper();
        gkRating = gk ? this.defendingTeam.getSnapshot()?.gkRating || 100 : 100;

        // 根据射门类型计算成功率
        const shotConfig = SHOT_TYPE_CONFIG[shotType];
        // 直接从 shotConfig 读取 baseline（不再从 k+offset 反推）
        const isGoal = resolveDuelPure(finalShootRating, gkRating, {
          amplification: 2.0,
          baseline: shotConfig.baseline,
          anchorRatio: 2.0,
          anchorProbability: 0.55,
        });

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
    // Attacker used as the event actor for turnover / miss-without-shot cases
    // (shot?.shooter is null when the push fails, so without this the event
    // would have no playerId).
    //
    // Both `attacker` and `defender` are now sourced from the
    // push-phase picker (`this.pushDuelAttacker` / `this.pushDuelDefender`),
    // which the engine populated earlier in this same
    // `simulateKeyMoment` call. The two cases are:
    //   - normal push duel: attacker = the slot-weighted pusher;
    //     defender = the slot-weighted marker;
    //   - LONG_SHOT:        attacker = the long-shot shooter (still
    //                        credited as the player who initiated);
    //                        defender = null (no 1-v-1 to win);
    //   - interceptTriggered: same LONG_SHOT shape — the pickers were
    //                        skipped, both stay null.
    // Using the same source for both the event payload and the
    // `tackles` counter below keeps the two perfectly aligned
    // (previously the defender here was an independent uniform-random
    // pick, so the credit could disagree with the event's named
    // tackler).
    const attacker: TacticalPlayer | null =
      this.pushDuelAttacker ?? shooter ?? preSelectedShooter;
    const defender: TacticalPlayer | null = this.pushDuelDefender;

    this.recordAttackSequence({
      lane: this.currentLane,
      attackType: attackType,
      midfieldBattle: {
        homeStrength: homeControl,
        awayStrength: awayControl,
        winner: homeWinsPossession ? 'home' : 'away',
        // home-perspective probability (0..1) — accumulated into the
        // attacker's laneCounters.midfieldProbabilitySum by
        // processAttackSequence so the FE's Possession Share panel can
        // read the engine's expected rate instead of empirical counts.
        probability: midfieldProbability,
      },
      attackPush: {
        attackPower: attPower,
        defensePower: defPower,
        success: pushSuccess,
        attackingPlayer: attacker,
        defendingPlayer: defender,
        // attacker-perspective probability (0..1) — accumulated into
        // laneCounters.pushProbabilitySum for the FE's Push Success Rate
        // panel. Distinct from `success` (the sampled boolean) so the
        // panel rate stays stable across small samples.
        probability: pushProbability,
        // Push-duel marginal triple. The marginal folds the
        // attacker-vs-defender composite skill differential into the
        // team-level push probability (capped at ±0.1). `null` on
        // either composite means the picker couldn't find a
        // candidate for that side (e.g. an exotic formation with
        // no eligible slot in the table) — FE should treat both
        // nulls as "no duel happened" and skip the marginal display.
        attackerComposite: this.pushDuelMarginal.attackerComposite,
        defenderComposite: this.pushDuelMarginal.defenderComposite,
        playerMarginal: this.pushDuelMarginal.marginal,
      },
      shot:
        shotResult === 'no_shot'
          ? null
          : {
              result: shotResult,
              shotType: shotType,
              shooter: shooter,
              assist: assistPlayer,
              // shotQuality is the per-shot perturbation on a 0-100
              // scale (derived from the same noise the goal-probability
              // duel saw). It is NOT the same as finalShootRating,
              // which is the player-skill-dominated 0-300+ input to
              // duel.ts. The pre-fix wire value `shootRating` carried
              // finalShootRating, which made the FE quality thresholds
              // (>= 60 / >= 80) trigger on virtually every real shot
              // and made the EventBubble show numbers like 160 that
              // read like player attributes, not shot quality.
              shotQuality: Math.round(shotVariance * 100),
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

    // v2 specialty: foul_rate hook (TACKLER 0.80, DRIBBLER 0.90,
    // COMPOSED 0.50 — see BASE_EFFECTS in specialty.system).
    // Applied at the "is this player actually going to foul?"
    // gate: COMPOSED players halve the chance of being the
    // fouler when randomly picked. On a skip the entire
    // resolveFoul call is a no-op — the team foul counter is
    // not bumped, no card is drawn, and no set-piece fires.
    // (Re-rolling to a different player would preserve the
    // team-level foul-count invariant but for a 50% buff on
    // typically 1-2 COMPOSED players in an 11-player team
    // it's a 4-9% shift to other players — invisible. The
    // skip semantics match the design-doc wording "less
    // likely to foul" and also fix the v1→v2 dead-code bug
    // where TACKLER / DRIBBLER's foul_rate hook was defined
    // in the table but never consumed.)
    const foulRate = foulRateMultiplier(player.player as Player);
    if (foulRate < 1.0 && Math.random() > foulRate) {
      return;
    }

    // Bump the per-team foul counter. Counts every foul call regardless
    // of card outcome — the team-level stat fans compare. Plain fouls
    // no longer emit a `foul` event (see the else branch below), so this
    // is the only path that updates `MatchTeamStatsEntity.fouls`.
    if (foulingTeam === this.homeTeam) {
      this.matchStats.foulStats.home += 1;
    } else {
      this.matchStats.foulStats.away += 1;
    }
    // [RFC injury-time-2026] Also bump the per-half stoppage counter.
    // Every foul call — yellow, red, or plain — adds to the half's
    // stoppage calculation, since plain fouls still consume referee
    // time (set-piece restart + measurement).
    this.halfStats.fouls += 1;

    const p = player.player as Player;
    const roll = Math.random();

    // 红黄牌分布(参考真实足球,目标每场黄牌~2,红牌~0.15):
    //   - 直接红牌(暴力犯规/严重犯规):0.2% (原 10%, 真实 < 1%)
    //   - 黄牌(可累积两黄变红):18% (原 30%, 真实 8-12%)
    //   - 普通犯规(无牌,产生定位球):81.8% (原 60%)
    if (roll < 0.002) {
      // Direct Red Card - player leaves, no substitution (plays with 10 men)
      foulingTeam.sendOffPlayer(p.id);
      player.isSentOff = true;
      this.events.push({
        minute: this.time,
        type: 'red_card',
        teamName: foulingTeam.name,
        playerId: p.id,
      });
      this.halfStats.redCards += 1;
      foulingTeam.updateSnapshot(
        this.time,
        this.getTacticsForTeam(foulingTeam).pitchWidth,
      );
      // Emit a snapshot event so the FE timeline can land on the
      // post-red-card lineup (10 men) instead of a stale 5-min
      // snapshot taken before the dismissal.
      this.generateSnapshotEvent(this.time);
    } else if (roll < 0.2) {
      // Yellow Card - check for second yellow
      const currentYellows = player.yellowCards || 0;
      player.yellowCards = currentYellows + 1;

      if (currentYellows >= 1) {
        // Second yellow = red card - player leaves, no substitution (plays with 10 men)
        foulingTeam.sendOffPlayer(p.id);
        player.isSentOff = true;
        this.events.push({
          minute: this.time,
          type: 'red_card',
          teamName: foulingTeam.name,
          playerId: p.id,
        });
        this.halfStats.redCards += 1;
        foulingTeam.updateSnapshot(
          this.time,
          this.getTacticsForTeam(foulingTeam).pitchWidth,
        );
        // See direct-red-card branch above for rationale.
        this.generateSnapshotEvent(this.time);
      } else {
        // First yellow - also determine set piece
        this.events.push({
          minute: this.time,
          type: 'yellow_card',
          teamName: foulingTeam.name,
          playerId: p.id,
        });
        this.halfStats.yellowCards += 1;
        // Trigger set piece
        this.resolveSetPieceFromFoul(foulingTeam, victimTeam);
      }
    } else {
      // Plain foul — no card, no event emitted. The match-level foul
      // count is still tracked via `matchStats.foulStats` (see
      // `getMatchStats` and the processor's `calculateStats`), and
      // set pieces / injury checks below still run. We deliberately
      // don't push a 'foul' event here because:
      //   1. at ~12/min * 90min * 81.8% ≈ 8.8 events/team, they
      //      dominate the commentary feed with low-information rows;
      //   2. the foul *count* is what fans actually want to compare
      //      (cards are already their own event), and that's preserved
      //      on the team stats.
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
      // 8% penalty (per-match target ~0.5/场) + 14% indirect FK
      // (target ~1.0/场) → 剩下 78% 是简单犯规
      if (roll < 0.08) {
        // 8% chance to be a penalty in the box
        this.resolvePenalty(foulingTeam, victimTeam);
      } else if (roll < 0.22) {
        // 14% chance to be an indirect free kick
        this.resolveIndirectFreeKick(victimTeam, foulingTeam);
      }
      // 78% chance nothing happens (simple foul)
    } else {
      // Not in attacking zone - 11% chance to be direct free kick
      // (target ~1.0/场,大约 7.5 non-center fouls × 11% ≈ 0.83)
      if (roll < 0.11) {
        this.resolveDirectFreeKick(victimTeam, foulingTeam);
      }
      // 89% chance nothing happens (simple foul)
    }
  }

  /**
   * Check if a player gets injured and generate injury event
   */
  private checkAndGenerateInjury(
    team: Team,
    actionType: 'tackle' | 'sprint' | 'jump' | 'collision' | 'other',
  ): void {
    // Pick the candidate pool in a single for-loop (no filter
    // allocation). We skip sent-off players (out of the game) AND
    // players already injured earlier in this match (P2-#10 —
    // without this, the same player could be picked twice and
    // stack two injury events in one match). If the entire team
    // is filtered out, the call is a no-op.
    let candidateIdx = -1;
    let candidateCount = 0;
    for (let i = 0; i < team.players.length; i++) {
      const p = team.players[i];
      if (p.isSentOff) continue;
      if (team.injuredThisMatch.has(p.player.id)) continue;
      // Reservoir-style random pick: each eligible player is
      // equally likely to end up as `candidateIdx` after the
      // loop, equivalent to `candidates[(Math.random() * candidates.length) | 0]`
      // but with zero array allocation.
      if (Math.random() * (candidateCount + 1) < 1) {
        candidateIdx = i;
      }
      candidateCount++;
    }
    if (candidateIdx === -1) return;

    const tacticalPlayer = team.players[candidateIdx];
    const player = tacticalPlayer.player as Player;
    if (!player) return;

    // Mark this player as already injured so later
    // `checkAndGenerateInjury` calls in the same match skip them.
    team.injuredThisMatch.add(player.id);

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
    // v2 PHYSICAL_BEAST (any actionType) + AERIAL_THREAT (jump only) —
    // both reduce injury chance via the `injury_chance` event. The
    // helper internally gates AERIAL_THREAT on jump, so passing
    // `actionType` through is enough — no need to inspect the
    // player's specialty code here.
    const injuryMult = injuryChanceMultiplier(player, actionType);
    const injuryResult = InjurySystem.generateInjury(
      actionType,
      playerAge,
      playerStamina,
      team === this.homeTeam,
      team.doctorLevel,
      playerInjuryState,
      injuryMult,
      this.logger
        ? (result, ctx) => {
            this.logger?.debug(
              `[MatchEngine] injury triggered player=${player.id} (${player.name}) team=${team.name} type=${result.injuryType} severity=${result.severity} value=${result.injuryValue} days=${result.estimatedDays} actionType=${ctx.actionType} age=${ctx.playerAge.toFixed(2)} doctorLevel=${ctx.doctorLevel}`,
            );
          }
        : undefined,
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
        estimatedRecoveryDays: injuryResult.estimatedDays ?? 1,
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
          estimatedRecoveryDays: injuryResult.estimatedDays ?? 1,
        },
      });
      // [RFC injury-time-2026] Bump the per-half stoppage counter.
      // Every injury that forces a treatment + (usually) a sub
      // adds ~1 min to the half's stoppage. `mild` injuries
      // that don't take the player off also count, since the
      // ref still pauses play briefly.
      this.halfStats.injuries += 1;

      // Player must leave the pitch: only `mild` lets the player
      // continue. `severe` (which absorbed the old `moderate` tier on
      // 2026-08-06) forces the player off. The engine tries a
      // same-position sub first; if none is available, the injured
      // player is sent off (10 men) — that is the realistic outcome
      // of, e.g., using all 3 subs earlier or the bench having no fit
      // option for that spot.
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
          // Emit a snapshot event so the FE timeline can land on the
          // post-sub lineup (injured player out, sub in). Same
          // rationale as the explicit `substitution` branch in
          // `applyInstructionsForTeam`.
          this.generateSnapshotEvent(this.time);

          // Update match stats for player coming in
          const inStats = this.playerMatchStats.get(playerInId);
          if (inStats) {
            inStats.appearances++;
          } else {
            this.playerMatchStats.set(playerInId, {
              goals: 0,
              assists: 0,
              tackles: 0,
              shots: 0,
              saves: 0,
              appearances: 1,
              minutesPlayed: 0,
              contributionSum: 0,
              contributionCount: 0,
              starsSum: 0,
            });
            this.playerContributionHistory.set(playerInId, []);
          }
        } else {
          // No substitute available — player must leave the pitch anyway.
          // Treat as a forced send-off (team plays the rest with 10 men),
          // which mirrors real football when a club has used all subs or
          // has no fit option on that position.
          team.sendOffPlayer(player.id);
          this.events.push({
            minute: this.time,
            type: 'red_card',
            teamName: team.name,
            playerId: player.id,
            data: {
              playerName: player.name,
              reason: 'injury_no_sub',
              injuryData: injuryEventData,
            },
          });
          // See injury-with-sub branch below for rationale.
          this.generateSnapshotEvent(this.time);
        }
      }

      // Update team snapshot
      team.updateSnapshot(this.time, this.getTacticsForTeam(team).pitchWidth);
    }
  }

  private recordAttackSequence(sequence: {
    lane: Lane;
    attackType: AttackType;
    midfieldBattle: {
      homeStrength: number;
      awayStrength: number;
      winner: 'home' | 'away';
      /** Home-perspective expected win probability (0..1) from
       *  `duelProbability(homeControl, awayControl, ...)`. */
      probability: number;
    };
    attackPush: {
      attackPower: number;
      defensePower: number;
      success: boolean;
      attackingPlayer: TacticalPlayer | null;
      /** Defender credited with stopping the attack. Picked at the
       *  top of the push phase from `PUSH_DEFENDER_WEIGHT[lane]`
       *  (slot-weighted, mirror of the attacker's side) and reused
       *  for the `tackles` counter and surfaced on the event so
       *  turnover / blocked / save entries can name the player who
       *  made the play. `null` for the `interceptTriggered` (midfield
       *  steal → instant shot) and the `LONG_SHOT` paths — neither
       *  has a 1-v-1 marker. */
      defendingPlayer: TacticalPlayer | null;
      /** Attacker-perspective expected push success probability (0..1)
       *  from `duelProbability(attPower, defPower, ...)`. 0 when the
       *  sequence skipped the push phase (e.g. intercept-then-shoot). */
      probability: number;
      /** Composite offensive skill of the picked attacker
       *  (mean of dribbling×2, passing, pace). `null` if no
       *  candidate was found. */
      attackerComposite: number | null;
      /** Composite defensive skill of the picked defender
       *  (mean of defending×2, positioning, composure). `null`
       *  if no candidate was found. */
      defenderComposite: number | null;
      /** The `[-0.1, 0.1]` marginal folded into the team-level push
       *  probability. Positive ⇒ attacker was above his slot
       *  average (P nudged up). Negative ⇒ defender was above
       *  his slot average (P nudged down). 0 when the sequence
       *  skipped the push phase (intercept / LONG_SHOT) or when
       *  one side had no eligible candidate. */
      playerMarginal: number;
    };
    shot: {
      result: 'goal' | 'save' | 'blocked' | 'miss';
      shotType: ShotType;
      shooter: TacticalPlayer | null;
      assist: TacticalPlayer | null;
      shotQuality: number;
      gkRating: number;
    } | null;
  }) {
    const { lane, attackType, midfieldBattle, attackPush, shot } = sequence;

    // Running lane counters for the FE snapshot panel. The `winner` of the
    // midfield battle is the attacking team for this sequence — increment
    // THEIR lane's counters (not the defender's). `attempts` always ticks;
    // `pushSuccess` only ticks when the push duel resolved successfully.
    // `pushProbabilitySum` / `midfieldProbabilitySum` accumulate the
    // engine-computed expected probabilities so the FE can read
    // stable rate values via `lc.pr` and `lc.mpr` (no "1/1 = 100%"
    // small-sample noise — the probability is the model output, not
    // the empirical hit rate).
    const attackerSide = midfieldBattle.winner;
    const attackerCounters = this.laneCounters[attackerSide][lane];
    attackerCounters.attempts += 1;
    attackerCounters.pushProbabilitySum += attackPush.probability;
    attackerCounters.midfieldProbabilitySum += midfieldBattle.probability;
    attackerCounters.midfieldBattles += 1;
    if (attackPush.success) {
      attackerCounters.pushSuccess += 1;
    }

    // Determine overall result
    let ffinalResult: 'goal' | 'save' | 'blocked' | 'miss' | 'defense_stopped';
    let eventType: MatchEvent['type'];

    if (shot) {
      ffinalResult = shot.result;
      eventType =
        shot.result === 'goal'
          ? 'goal'
          : shot.result === 'save'
            ? 'save'
            : 'miss';
    } else if (attackPush.success) {
      ffinalResult = 'blocked';
      eventType = 'miss';
    } else {
      ffinalResult = 'defense_stopped';
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
        ffinalResult === 'goal' && midfieldBattle.winner === 'home'
          ? this.homeScore + 1
          : this.homeScore,
      away:
        ffinalResult === 'goal' && midfieldBattle.winner === 'away'
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
          homeStrength: Math.round((midfieldBattle.homeStrength) * 100) / 100,
          awayStrength: Math.round((midfieldBattle.awayStrength) * 100) / 100,
          winner:
            midfieldBattle.winner === 'home'
              ? this.homeTeam.name
              : this.awayTeam.name,
        },
        attackPush: {
          attackingTeam: possessor,
          attackingPlayer: attackPush.attackingPlayer
            ? (attackPush.attackingPlayer.player as Player).name
            : undefined,
          // Name of the defender credited with stopping the play (the
          // tackler on turnovers, the blocker on blocked shots, etc.).
          // Used by the FE `turnover` commentary template as `{tackler}`.
          defendingPlayer: attackPush.defendingPlayer
            ? (attackPush.defendingPlayer.player as Player).name
            : undefined,
          defendingTeam: defender,
          attackPower: Math.round((attackPush.attackPower) * 100) / 100,
          defensePower: Math.round((attackPush.defensePower) * 100) / 100,
          success: attackPush.success,
          // Push-duel skill profile — surfaces the player-vs-player
          // breakdown the engine applied. `null` for either composite
          // (or 0 for `playerMarginal`) means the push was skipped
          // (LONG_SHOT / intercept). FE can render "{tackler} dispossesses
          // {attacker} (marginal {playerMarginal})" with these.
          attackerComposite: attackPush.attackerComposite ?? null,
          defenderComposite: attackPush.defenderComposite ?? null,
          playerMarginal: attackPush.playerMarginal,
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
              shotQuality: shot.shotQuality,
              gkRating: Math.round((shot.gkRating) * 100) / 100,
            }
          : null,
      },
      lane: lane,
      ffinalResult: ffinalResult,
      scoreAfterEvent: ffinalResult === 'goal' ? scoreAfterEvent : undefined,
    };

    // Track player stats: goals and assists
    if (shot?.shooter) {
      const shooterId = (shot.shooter.player as Player).id;
      const shooterName = (shot.shooter.player as Player).name;
      const stats = this.playerMatchStats.get(shooterId);
      if (stats) {
        if (ffinalResult === 'goal') {
          stats.goals++;
          // Check for hat-trick (3 goals)
          if (stats.goals === 3) {
            this.pendingHatTricks.push({
              playerId: shooterId,
              playerName: shooterName,
              goals: stats.goals,
              minute: this.time,
            });
          }
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

    // Track player shots + GK saves (per-player, not team-level).
    // shots counts every shot attempt by the shooter (goal,
    // miss, save by GK, block by defender); saves counts only
    // save outcomes and credits the defending team's GK.
    // Penalty shootout kicks (penalty_goal / penalty_miss at
    // minute=120) are NOT counted - they're a separate stat
    // from open-play shots and handleShot doesn't run for
    // them (they go through  resolvePenaltyShootout instead).
    if (shot) {
      // Shooter side: every shot attempt counts as 1 shot.
      // The engine's  finalResult for a shot outcome is one
      // of {goal, miss, save, blocked} - all four are shot
      // attempts. defense_stopped is a non-shot turnover
      // and is intentionally excluded.
      if (shot.shooter) {
        const shooterStats = this.playerMatchStats.get(
          (shot.shooter.player as Player).id,
        );
        if (shooterStats) shooterStats.shots++;
      }
      // GK side: only save outcomes credit the defending
      // team's GK. defendingTeam.getGoalkeeper() resolves
      // to whoever is between the posts this minute (which
      // can change if the starter was sent off and a
      // outfield player had to fill in).
      if (ffinalResult === 'save') {
        const gk = this.defendingTeam.getGoalkeeper();
        if (gk) {
          const gkStats = this.playerMatchStats.get(
            (gk.player as Player).id,
          );
          if (gkStats) gkStats.saves++;
        }
      }
    }

    // Track tackles: defense_stopped means defensive player made a tackle.
    // We re-use the defender already picked in `simulateKeyMoment`
    // (`attackPush.defendingPlayer`) so the tackle counter and the
    // event's named tackler line up.
    if (ffinalResult === 'defense_stopped' && attackPush.defendingPlayer) {
      const defenderId = (attackPush.defendingPlayer.player as Player).id;
      const stats = this.playerMatchStats.get(defenderId);
      if (stats) {
        stats.tackles++;
      }
    }

    // Create the event
    const eventPlayer =
      shot?.shooter ??
      (eventType === 'turnover' || eventType === 'miss'
        ? attackPush.attackingPlayer
        : null);

    this.events.push({
      minute: this.time,
      type: eventType,
      teamName: possessor,
      playerId: eventPlayer ? (eventPlayer.player as Player).id : undefined,
      // `relatedPlayerId` carries the assist for shot outcomes, OR the
      // tackler for turnover. The two share one slot because the FE
      // comment template only ever reads one of them at a time (it
      // branches on `eventType` first).
      relatedPlayerId: shot?.assist
        ? (shot.assist.player as Player).id
        : eventType === 'turnover' && attackPush.defendingPlayer
          ? (attackPush.defendingPlayer.player as Player).id
          : undefined,
      data: eventData,
    });

    if (eventType === 'goal') {
      // Emit a snapshot event right after the goal so the FE timeline
      // can land on the post-goal lineup / state instead of a stale
      // 5-min snapshot taken before the goal was scored. Without
      // this, clicking the goal marker snaps to the prior 5-min
      // snapshot and the score / lineup read as if nothing
      // happened.
      this.generateSnapshotEvent(this.time);
      this.logger?.debug(
        `[MatchEngine] goal minute=${this.time} scorer=${
          shot?.shooter ? (shot.shooter.player as Player).name : 'unknown'
        } assist=${
          shot?.assist ? (shot.assist.player as Player).name : 'none'
        } score=${scoreAfterEvent.home}-${scoreAfterEvent.away}`,
      );
    }

    // Trigger corner when ball goes out behind the goal line off a defender / keeper.
    // Both blocked shots and saves can produce a corner:
    //   - blocked (后卫/防守球员挡出): 高概率 → 角球 (87%)
    //   - save    (门将扑出):       中概率 → 角球 (28%)
    // 综合目标 ~1.5 角球/场: block 0.45 × 0.87 + save 4.0 × 0.28 ≈ 1.51
    // 用户 2026-08-05 决定,之前只看 blocked 太少所以加 save。
    if (shot?.shooter) {
      let cornerChance = 0;
      if (ffinalResult === 'blocked') cornerChance = 0.87;
      else if (ffinalResult === 'save') cornerChance = 0.28;
      if (cornerChance > 0 && Math.random() < cornerChance) {
        const cornerTeam =
          midfieldBattle.winner === 'home' ? this.homeTeam : this.awayTeam;
        const defendingTeam =
          midfieldBattle.winner === 'home' ? this.awayTeam : this.homeTeam;
        this.resolveCorner(cornerTeam, defendingTeam);
      }
    }

    // 更新统计数据
    this.updateStats(attackType, shot, ffinalResult);
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

    // 更新控球统计:按 mid 胜方算,跟 push 结果无关
    // 真实足球控球率反映的是"持球时间"占比,本质上 = mid 胜率(push 失败的
    // turnover 球权归 mid 败方,跟"mid 胜方持球"是同一件事)。
    // 之前按 push 结果算会被 push 50% 拉向 50/50,跟真实偏离。
    const possessionTeam = this.possessionTeam.name;
    if (possessionTeam === this.homeTeam.name) {
      this.matchStats.possessionStats.home++;
    } else {
      this.matchStats.possessionStats.away++;
    }
  }

  private selectShooter(
    team: Team,
    options: {
      phase?: 'counter' | 'normal';
      shotType?: ShotType;
      attackType?: AttackType;
    } = {},
  ): TacticalPlayer {
    // Single-pass position bucketing. The legacy code did four
    // `Array.filter` passes (candidates / cfs / ws / ams) which
    // allocated four arrays per call. With ~25-30 `selectShooter`
    // calls per match, that's ~100-120 throwaway arrays / match
    // churning the young-generation GC. This single loop writes
    // straight into the four target buckets.
    const cfs: TacticalPlayer[] = [];
    const ws: TacticalPlayer[] = [];
    const ams: TacticalPlayer[] = [];
    const all: TacticalPlayer[] = [];
    for (const p of team.players) {
      if (p.isSentOff) continue;
      all.push(p);
      const k = p.positionKey;
      // The bucket predicates are mutually exclusive at the
      // position-key level for any well-formed 4-4-2 (CF / LM/RM
      // / AM* / CM* / etc. share no common prefixes), so the
      // if/else chain below matches the old `filter` semantics
      // exactly. Exotic position keys fall through to `all`.
      if (k.includes('CF')) cfs.push(p);
      else if (k.includes('W')) ws.push(p);
      else if (k.includes('AM')) ams.push(p);
    }
    const len = all.length;
    if (len === 0) {
      // Defensive fallback — should be unreachable because
      // every team has at least 11 players on the pitch, but
      // TypeScript needs the early return for the
      // noUncheckedIndexedAccess.
      return all[0];
    }

    // v2 specialty weight — applied AFTER the position-bucket pick so
    // the bucket's "CF 40% / W 20% / AM 15% / other 25%" distribution
    // is preserved, but within a bucket the picker favors specialty
    // holders. See `selectShooterWeight` for the underlying values.
    const phase = options.phase ?? 'normal';
    const shotType = options.shotType;
    // v2.5: AERIAL_THREAT gets a 1.20 weight bump (Silver) when the
    // attackType is CROSS — the "传中 → 空霸头球" mental model
    // that the v2.0 design doc §2.1 Hook 2 promised but the
    // v2.0 selectShooter never wired (it only keyed on shotType
    // and phase). Default `undefined` means "not on a cross" so
    // callers that don't pass attackType see no behavior change.
    const attackType = options.attackType;
    const isCrossAttack =
      attackType !== undefined && attackType === AttackType.CROSS;
    const pickInBucket = (bucket: TacticalPlayer[]): TacticalPlayer => {
      // Weighted pick: each candidate's weight is
      //   baseWeight (= 1.0) × specialtyMultiplier(event)
      // The multiplier is the engine's central source of truth.
      // Single-pass weight+total: avoid the legacy
      // `bucket.map().reduce()` double walk.
      let totalWeight = 0;
      const weights = new Array<number>(bucket.length);
      for (let i = 0; i < bucket.length; i++) {
        const p = bucket[i];
        const player = p.player as Player;
        let w = 1.0;
        if (shotType === ShotType.REBOUND) {
          w *= selectShooterReboundWeight(player);
        } else {
          w *= selectShooterWeight(player);
        }
        if (phase === 'counter') {
          w *= selectShooterCounterWeight(player);
        }
        if (isCrossAttack) {
          // v2.5: AERIAL_THREAT weight bump on CROSS attacks.
          // Multiplicative with the per-player × phase weights
          // above so a 3-way AERIAL+POACHER+SPEEDSTER Silver
          // combo on a cross (very rare) would be 1.20 × 1.25 ×
          // 1.20 = 1.80. The base weight of 1.0 for non-holders
          // is preserved.
          w *= selectShooterCrossHeaderWeight(player);
        }
        weights[i] = w;
        totalWeight += w;
      }
      if (totalWeight <= 0) {
        return bucket[(Math.random() * bucket.length) | 0];
      }
      let r = Math.random() * totalWeight;
      for (let i = 0; i < bucket.length; i++) {
        r -= weights[i];
        if (r <= 0) return bucket[i];
      }
      return bucket[bucket.length - 1]; // numeric drift fallback
    };

    // 射手权重：CF 40% | W 20% | AM 15% | 其他 25%
    const rand = Math.random();

    // 优先 CF（40%）
    if (cfs.length > 0 && rand < 0.4) {
      return pickInBucket(cfs);
    }

    // 其次 W（20%）
    if (ws.length > 0 && rand < 0.6) {
      // 0.40 + 0.20
      return pickInBucket(ws);
    }

    // 再次 AM（15%）
    if (ams.length > 0 && rand < 0.75) {
      // 0.60 + 0.15
      return pickInBucket(ams);
    }

    // 其他位置随机（剩余 25%）— pick from the full bucket so a
    // CFs/Ws/AMs player can still be picked in this branch.
    return pickInBucket(all);
  }

  /**
   * 远射射手选择：按位置权重，不看属性
   * AM(45%) > W(25%) > CM(20%) > 其他(10%)
   */
  private selectLongShotShooter(team: Team): TacticalPlayer {
    // Single-pass bucketing (was 4 filter allocations). `outfield`
    // mirrors the legacy "no sent off, no GK" candidates pool;
    // `ams` / `ws` / `cms` are the position-bucket picks; `others`
    // is what falls through.
    const outfield: TacticalPlayer[] = [];
    const ams: TacticalPlayer[] = [];
    const ws: TacticalPlayer[] = [];
    const cms: TacticalPlayer[] = [];
    const others: TacticalPlayer[] = [];
    for (const p of team.players) {
      if (p.isSentOff) continue;
      if (p.positionKey.includes('GK')) continue;
      outfield.push(p);
      const k = p.positionKey;
      if (k.includes('AM')) ams.push(p);
      else if (k.includes('W')) ws.push(p);
      else if (k.includes('CM')) cms.push(p);
      else others.push(p);
    }
    if (outfield.length === 0) {
      // Should never happen — team has at least 11 players and
      // only 1 is GK. Fall through to a uniform-random pick on
      // whatever non-sent-off players are left.
      const fallback: TacticalPlayer[] = [];
      for (const p of team.players) {
        if (!p.isSentOff) fallback.push(p);
      }
      if (fallback.length === 0) return team.players[0];
      return fallback[(Math.random() * fallback.length) | 0];
    }

    // 优先级1：AM（45%）
    if (ams.length > 0 && Math.random() < 0.45) {
      return ams[(Math.random() * ams.length) | 0];
    }

    // 优先级2：W（25%，在剩余55%中）
    if (ws.length > 0 && Math.random() < 0.4545) {
      // 0.25 / 0.55
      return ws[(Math.random() * ws.length) | 0];
    }

    // 优先级3：CM（20%，在剩余30%中）
    if (cms.length > 0 && Math.random() < 0.6667) {
      // 0.20 / 0.30
      return cms[(Math.random() * cms.length) | 0];
    }

    // 优先级4：其他位置（剩余10%）
    if (others.length > 0) {
      return others[(Math.random() * others.length) | 0];
    }

    return outfield[(Math.random() * outfield.length) | 0];
  }

  private selectAssist(
    team: Team,
    shooter: TacticalPlayer,
    attackType: 'CROSS' | 'OTHER' = 'OTHER',
  ): TacticalPlayer | null {
    // Single-pass bucketing (was 3 filter allocations: candidates /
    // widePlayers / preferredAssisters). Build all three buckets in
    // one loop. `widePlayers` and `preferredAssisters` are
    // *disjoint* (the wide predicates use LB/RB/WBL/WBR/LW/RW; the
    // preferred predicates use AM/CM/W), so the bucket predicates
    // below are mutually exclusive at the position-key level and
    // cover the same set as the legacy filters.
    const candidates: TacticalPlayer[] = [];
    const widePlayers: TacticalPlayer[] = [];
    const preferredAssisters: TacticalPlayer[] = [];
    for (const p of team.players) {
      if (p.isSentOff) continue;
      if (p === shooter) continue;
      if (p.positionKey.includes('GK')) continue;
      candidates.push(p);
      const k = p.positionKey;
      if (
        k.includes('LB') ||
        k.includes('RB') ||
        k.includes('WBL') ||
        k.includes('WBR') ||
        k.includes('LW') ||
        k.includes('RW')
      ) {
        widePlayers.push(p);
      }
      if (
        k.includes('AM') ||
        k.includes('CM') ||
        k.includes('W')
      ) {
        preferredAssisters.push(p);
      }
    }

    if (candidates.length === 0) return null;

    // Per-bucket weighted pick. v2 PLAYMAKER (1.0 / 1.175 / 1.25 /
    // 1.35 for no-spec / B / S / G) and v2 CROSSER (1.0 / 1.14 / 1.20
    // / 1.28) bias the assister pick inside whichever bucket we
    // landed in. Specialty holders become likelier without changing
    // the bucket-level position distribution. Falls back to uniform
    // random when the bucket has no specialty holder (the common case
    // for ~50% of teams).
    const pickWeighted = (bucket: TacticalPlayer[]): TacticalPlayer => {
      const weights: number[] = new Array(bucket.length);
      let total = 0;
      for (let i = 0; i < bucket.length; i++) {
        const w = selectAssistWeight(bucket[i].player as Player);
        weights[i] = w;
        total += w;
      }
      if (total <= 0) {
        return bucket[(Math.random() * bucket.length) | 0];
      }
      let r = Math.random() * total;
      for (let i = 0; i < bucket.length; i++) {
        r -= weights[i];
        if (r <= 0) return bucket[i];
      }
      return bucket[bucket.length - 1];
    };

    // For CROSS (传中), the assister must be a wide player
    if (attackType === 'CROSS') {
      if (widePlayers.length > 0) {
        return pickWeighted(widePlayers);
      }
      // Fallback: no wide player available, no assist
      return null;
    }

    // For other attack types, prioritize midfielders and wingers
    if (preferredAssisters.length > 0 && Math.random() < 0.7) {
      return pickWeighted(preferredAssisters);
    }

    return pickWeighted(candidates);
  }

  /**
   * 根据当前路（lane）选择进攻类型（受天气+tempo影响）
   * @param lane 当前攻击的路
   * @returns 进攻类型枚举
   */
  private selectAttackType(lane: Lane): AttackType {
    const distribution = LANE_ATTACK_DISTRIBUTION[lane];
    if (!distribution) {
      return AttackType.SHORT_PASS;
    }

    // Get tempo weights for attacking team
    const attConfig = this.getTacticsForTeam(this.possessionTeam);
    const tempoWeights = TEMPO_MODIFIERS[attConfig.tempo].attackTypeWeights;

    // Get weather weights
    const weatherWeights =
      WEATHER_ATTACK_WEIGHTS[this.weather] || WEATHER_ATTACK_WEIGHTS['cloudy'];

    // Fold all three passes (weight × tempo × weather → sum →
    // normalize → cumulative draw) into one. Legacy allocated
    // two intermediate 5-element arrays and walked the
    // distribution 3 times (`.map` + `.reduce` + final draw
    // loop). Distribution is always 5 elements (AttackType enum),
    // so unrolling is both readable and allocation-free.
    const w0 = distribution[0] * weatherWeights[0] * tempoWeights[AttackType[0]];
    const w1 = distribution[1] * weatherWeights[1] * tempoWeights[AttackType[1]];
    const w2 = distribution[2] * weatherWeights[2] * tempoWeights[AttackType[2]];
    // v2 DRIBBLER — when a DRIBBLER is on the pitch, the team is
    // more likely to pick DRIBBLE. Decision-class — pick one
    // DRIBBLER weighted by per-player multiplier (1.0 / 1.14 / 1.20
    // / 1.28 for no-spec / B / S / G). Replaces the v2.0 team-max
    // single pick so lineup diversity (Gold + Silver mix vs
    // Gold-only) has a different outcome.
    const dribbleBonus = teamSampledEventMultiplier(
      this.possessionTeam.players,
      'select_attack_type',
    );
    const w3 =
      distribution[3] *
      weatherWeights[3] *
      tempoWeights[AttackType[3]] *
      (dribbleBonus > 1.0 ? dribbleBonus : 1.0);
    const w4 = distribution[4] * weatherWeights[4] * tempoWeights[AttackType[4]];

    const sum = w0 + w1 + w2 + w3 + w4;
    // 归一化（保持总和为100）— equivalent to the legacy
    // `(w / sum) * 100`. Pre-multiply the 100/sum into each weight
    // so the draw loop just walks the cumulative sum.
    const scale = 100 / sum;
    const rand = Math.random() * 100;
    let cumulative = w0 * scale;
    if (rand < cumulative) return AttackType.CROSS;
    cumulative += w1 * scale;
    if (rand < cumulative) return AttackType.SHORT_PASS;
    cumulative += w2 * scale;
    if (rand < cumulative) return AttackType.THROUGH_PASS;
    cumulative += w3 * scale;
    if (rand < cumulative) return AttackType.DRIBBLE;
    cumulative += w4 * scale;
    if (rand < cumulative) return AttackType.LONG_SHOT;

    return AttackType.SHORT_PASS; // Fallback (numeric drift)
  }

  /**
   * 根据进攻类型选择射门类型
   * @param attackType 进攻类型
   * @returns 射门类型
   */
  private selectShotType(attackType: AttackType): ShotType {
    const rand = Math.random() * 100;

    switch (attackType) {
      case AttackType.CROSS: {
        // 传中：头球 50%，抽射 30%，补射 20%
        // v2 CROSSER — when a CROSSER is on the pitch, the team is
        // more likely to pick HEADER off a cross (the "CROSSER picks
        // the cross → header target" mental model). Decision-class
        // — pick one CROSSER weighted by per-player multiplier
        // (1.0 / 1.14 / 1.20 / 1.28 for no-spec / B / S / G).
        // Renormalize the three cross-shot weights so the
        // distribution still sums to 100% — otherwise a Gold CROSSER
        // would push HEADER past 64% and break the 30/20 split.
        const headerBase = 50;
        const normalBase = 30;
        const reboundBase = 20;
        const crossBonus = teamSampledEventMultiplier(
          this.possessionTeam.players,
          'select_shot_type',
        );
        const headerW = headerBase * (crossBonus > 1.0 ? crossBonus : 1.0);
        const normalW = normalBase;
        const reboundW = reboundBase;
        const sum = headerW + normalW + reboundW;
        const headerP = (headerW / sum) * 100;
        const normalP = headerP + (normalW / sum) * 100;
        if (rand < headerP) return ShotType.HEADER;
        if (rand < normalP) return ShotType.NORMAL;
        return ShotType.REBOUND;
      }

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
   * 头球靠位置争顶和空中能力：finishing×5 + composure×3 + positioning×2
   * header_specialist: 头球射门评分 +8%
   */
  private calculateHeaderRating(player: Player): number {
    const attrs = player.attributes;
    const raw =
      (attrs.finishing ?? 10) * 5 +
      (attrs.composure ?? 10) * 3 +
      (attrs.positioning ?? 10) * 2;
    // v2.6: PHYSICAL_BEAST moved off `shot_header` (repositioned
    // to `shot_normal` in `calculateShootRating` — see below).
    // The header shot hook is now AERIAL_THREAT-only; "野兽"
    // semantic fits body contact in the box, not aerial duels.
    // Team-max (now `teamSampledEventMultiplier`) handles
    // multiple AERIAL_THREATs in the cross-attack snapshot path.
    return raw * shotHeaderMultiplier(player);
  }

  /**
   * 计算抽射评分（禁区内常规射门）
   * 抽射靠终结和冷静：finishing×7 + composure×3
   *
   * v2.6: PHYSICAL_BEAST (1.10 base) wired here. Previously
   * `shotNormalMultiplier` was a forward-compat helper defined but
   * never consumed at any call site — see commit de96c3f for the
   * tripwire fix that surfaced this dead hook. v2.6 fixes it as
   * part of the AERIAL_THREAT vs PHYSICAL_BEAST differentiation
   * (PHYSICAL_BEAST moves from `shot_header` to `shot_normal` so
   * the "野兽" semantic — body contact in the box — matches a
   * NORMAL shot rather than a header). PHYSICAL_BEAST Silver
   * on a NORMAL shot: raw × 1.10.
   */
  private calculateShootRating(player: Player): number {
    const attrs = player.attributes;
    const raw = (attrs.finishing ?? 10) * 7 + (attrs.composure ?? 10) * 3;
    return raw * shotNormalMultiplier(player);
  }

  /**
   * 计算单刀球评分
   * 单刀 1v1 面对门将：终结能力最重要，冷静次之
   * finishing×8 + composure×2 + dribbling×1
   */
  private calculateOneOnOneRating(player: Player): number {
    const attrs = player.attributes;
    return (
      (attrs.finishing ?? 10) * 8 +
      (attrs.composure ?? 10) * 2 +
      (attrs.dribbling ?? 10) * 1
    );
  }

  /**
   * 计算远射评分
   * 远射靠终结和力量：finishing×7 + composure×3 × 距离因子
   * 距离因子（18-30米）会显著降低评分
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
    // 阶段 2 兼容层：保留旧 (k, offset) 四参签名，内部委托给 duel.ts。
    //
    // 旧公式语义：
    //   ratio = valA / valB
    //   P = sigmoid(-(ratio - 1 - offset/100) * k)
    //
    // 当 valA == valB（ratio=1）时，旧公式 P = sigmoid(offset * k / 100)
    // 即负 offset → sigmoid 负数 → 低 P；正 offset → sigmoid 正数 → 高 P
    // 注意：offset 的方向是"让 A 更难赢"为正（对应公式里的 -(ratio-1) 平移）
    //
    // 把这个值作为新公式的 baseline，让"对等点 P"与旧行为一致：
    //   baseline = sigmoid(offset * k / 100)
    //
    // 注：旧公式在 ratio 上线性（ratio - 1），新公式在 log(ratio) 上线性。
    // 对等点附近两种曲线接近相同，但 ratio > 2 时会有微小差异。
    // 后续阶段会按场景引入 amplification > 1.0 以匹配业务直觉。
    const baseline = 1 / (1 + Math.exp((offset * k) / 100));
    return resolveDuelPure(valA, valB, {
      amplification: 1.0,
      baseline,
      anchorRatio: 2.0,
      anchorProbability: 0.55,
    });
  }

  private changeLane() {
    // Lane is determined neutrally — opportunities appear regardless of which team will get possession.
    // Base distribution: left=29, center=42, right=29. Hard-coded
    // values (sum = 100) so the normalization and cumulative draw
    // are constant-time arithmetic with no array allocation. Called
    // once per `simulateKeyMoment` (~20×/match).
    const rand = Math.random() * 100;
    if (rand < 29) {
      this.currentLane = 'left';
    } else if (rand < 71) {
      // 29 + 42 = 71
      this.currentLane = 'center';
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
        // Compute multiplier + fitnessFactor together — the legacy
        // pair of `getFitnessFactor` + `calculateMultiplier` re-ran
        // the same `consumed / buffer / exp(-F_LAMBDA *
        // overdraftRatio)` branch twice per player per snapshot
        // (~22 × 18 = ~400 calls / match). The combined method folds
        // the fitness factor into the multiplier in a single pass.
        const { multiplier, fitnessFactor } =
          ConditionSystem.getMultiplierWithFitnessFactor(
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
          // Emit the canonical slot key the editor stored (`CBL`,
          // `CMR`, ...) so the FE renders 3 distinct markers for a
          // 3-CB team. Falls back to the family-folded `positionKey`
          // for sub entrants who just swapped on (no `lineupSlotKey`
          // of their own — the swap path keeps the out-player's
          // `positionKey` on the in-player until the next snapshot).
          p: tacticalPlayer.lineupSlotKey ?? tacticalPlayer.positionKey,
          st: Math.round((fitness) * 10) / 10,
          f: player.form,
          ff: Math.round((fitnessFactor) * 1000) / 1000,
          pc: Math.round((normalizedContribution) * 10) / 10, // Normalized to 0-100 scale
          // Power rating 0–20 in 2-point steps (0.5-step × 4 = the
          // 5-star max → 20 mapping). Emitted directly on the
          // 0–20 scale so the FE just reads and displays.
          sr: stars,
          em: tacticalPlayer.entryMinute || 0,
        };

        if (needsFullData) {
          state.n = player.name;
          state.o = player.overall || 50;
          state.ex = player.experience || 0;
          state.age = player.exactAge[0] || 0;
          state.ad = player.exactAge[1] || 0;
          // state.ap (appearance) removed: the underlying `player.appearance` field
          // was dropped in commit 952c812. Keep this comment as a marker in case a
          // replacement visual attribute is introduced later.

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
        // The internal `Team.updateSnapshot()` accumulator produces
        // values in a 0–1000 magnitude (each player's
        // `att*multiplier*attackLaneMultiplier` summed across 11
        // starters). The FE previously divided by 100 at two
        // display sites to make the numbers UI-readable (880 → 8.8).
        // Folding that `/100` into the engine means the SNAPSHOT
        // payload already carries the display magnitude, so the FE
        // becomes a thin renderer. Divide-then-round is correct: a
        // raw 880.55 → 8.8055 → "8.8" (1-decimal as before).
        res[lane] = {
          atk: Math.round(((((phases as any).attack || 0) / 100)) * 10) / 10,
          def: Math.round(((((phases as any).defense || 0) / 100)) * 10) / 10,
          pos: Math.round(((((phases as any).possession || 0) / 100)) * 10) / 10,
        };
      }
      return res;
    };

    // Lane counters as they stand at this snapshot — running totals since
    // engine start. Two rates live here:
    //   - `pr`  = pushProbabilitySum / attempts   (engine-computed
    //             expected push success probability; 0 when no pushes yet)
    //   - `mpr` = midfieldProbabilitySum / midfieldBattles  (engine-computed
    //             expected possession win probability; 0 when no battles yet)
    // The FE's Push Success Rate and Possession Share panels read these
    // directly — no client-side division, no "1/1 = 100%" small-sample
    // noise. `att` is kept for debugging / future use.
    const formatCounters = (
      counters: Record<
        Lane,
        {
          attempts: number;
          pushSuccess: number;
          pushProbabilitySum: number;
          midfieldProbabilitySum: number;
          midfieldBattles: number;
        }
      >,
    ) => {
      const out: any = {};
      for (const lane of ['left', 'center', 'right'] as const) {
        const cell = counters[lane];
        out[lane] = {
          att: cell.attempts,
          ps_: cell.pushSuccess,
          pr: cell.attempts > 0 ? cell.pushProbabilitySum / cell.attempts : 0,
          mpr:
            cell.midfieldBattles > 0
              ? cell.midfieldProbabilitySum / cell.midfieldBattles
              : 0,
        };
      }
      return out;
    };

    this.events.push({
      minute: time,
      type: 'snapshot',
      data: {
        h: {
          n: time === 0 ? this.homeTeam.name : undefined,
          ls: formatLanes(homeSnapshot?.laneStrengths),
          lc: formatCounters(this.laneCounters.home),
          gk: Math.round(((homeSnapshot?.gkRating || 0)) * 10) / 10,
          ps: mapPlayerStates(this.homeTeam, time === 0),
        },
        a: {
          n: time === 0 ? this.awayTeam.name : undefined,
          ls: formatLanes(awaySnapshot?.laneStrengths),
          lc: formatCounters(this.laneCounters.away),
          gk: Math.round(((awaySnapshot?.gkRating || 0)) * 10) / 10,
          ps: mapPlayerStates(this.awayTeam, time === 0),
        },
      },
    });
  }

  // ==================== SET PIECE METHODS ====================

  /**
   * Resolve a corner kick.
   *
   * 公式：duelProbability(attackScore, defenseScore, { amplification: 2.0, baseline: 0.10 })
   * - Attack = avgFK×0.7 + kickerFK×0.5
   * - Defense = opponentAvgFK×0.6 + GKRating×0.2
   * - 对等双方时 P ≈ baseline = 0.10（角球转化率低）
   * - attackScore 2 倍于 defenseScore 时 P = 0.80（锚点）
   * - 大差距放大（amplification=2.0 让 ratio=3 接近 0.97）
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
    // baseline 0.10 → 0.20:把现实多次机会合成到游戏一次机会,
    // 对等双方角球转化率翻倍(用户 2026-08-05 决定)
    const probability = duelProbability(attackScore, defenseScore, {
      amplification: 2.0,
      baseline: 0.2,
      anchorRatio: 2.0,
      anchorProbability: 0.55,
    });
    const isGoal = Math.random() < probability;

    const kickerPlayer = kicker.player as Player;

    this.events.push({
      minute: this.time,
      type: isGoal ? 'goal' : 'corner',
      teamName: attackingTeam.name,
      playerId: kickerPlayer.id,
      data: {
        setPieceType: 'corner',
        attackScore: Math.round((attackScore) * 100) / 100,
        defenseScore: Math.round((defenseScore) * 100) / 100,
        probability: Math.round((probability) * 100) / 100,
        result: isGoal ? 'goal' : 'save',
      },
    });

    // Corner-driven goal also triggers a snapshot (the open-play
    // goal emit in `recordAttackSequence` doesn't cover set-piece
    // goals). See that block for the FE rationale.
    if (isGoal) {
      this.generateSnapshotEvent(this.time);
    }

    // Score is updated by the main minute loop (it scans newEvents for
    // type === 'goal'). Do NOT increment homeScore/awayScore here —
    // doing both was double-counting set-piece goals (e.g. 5 goal events
    // but match.awayScore = 7 because corners and free kicks scored
    // twice each).

    // Update stats (use team name as ID for now, should use teamId)
    const teamId = attackingTeam.name; // TODO: Use actual team ID
    this.updateSetPieceStats(teamId, 'corner');
  }

  /**
   * Resolve an indirect free kick (free kick that requires a touch).
   *
   * 公式：duelProbability(attackScore, defenseScore, { amplification: 2.0, baseline: 0.12 })
   * - Attack = avgFK×0.6 + kickerFK×0.6
   * - Defense = opponentAvgFK×0.6 + GKRating×0.2
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
    // baseline 0.12 → 0.24:合成多次机会 → 一次,转化率翻倍
    const probability = duelProbability(attackScore, defenseScore, {
      amplification: 2.0,
      baseline: 0.24,
      anchorRatio: 2.0,
      anchorProbability: 0.55,
    });

    const isGoal = Math.random() < probability;

    const kickerPlayer = kicker.player as Player;

    this.events.push({
      minute: this.time,
      type: isGoal ? 'goal' : 'free_kick',
      teamName: attackingTeam.name,
      playerId: kickerPlayer.id,
      data: {
        setPieceType: 'indirect_free_kick',
        attackScore: Math.round((attackScore) * 100) / 100,
        defenseScore: Math.round((defenseScore) * 100) / 100,
        probability: Math.round((probability) * 100) / 100,
        result: isGoal ? 'goal' : 'save',
      },
    });

    // See the corner-driven goal branch above for the rationale.
    if (isGoal) {
      this.generateSnapshotEvent(this.time);
    }

    // Score is updated by the main minute loop (it scans newEvents for
    // type === 'goal'). Do NOT increment homeScore/awayScore here —
    // doing both was double-counting set-piece goals (see handleCorner
    // comment for the original bug write-up).

    // Update stats
    const teamId = attackingTeam.name;
    this.updateSetPieceStats(teamId, 'indirect_fk');
  }

  /**
   * Resolve a direct free kick (shoot directly on goal).
   *
   * 公式：duelProbability(attackScore, defenseScore, { amplification: 2.0, baseline: 0.18 })
   * - Attack = kickerFK×1.0 + kickerComp×0.5
   * - Defense = GKref×0.6 + GKhand×0.4 + GKcomp×0.4
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
    // v2.5: COMPOSED "冷静 in the clutch" buff on direct free
    // kicks. Silver base 1.10 (Gold 1.14, Bronze 1.07) — see
    // `docs/specialty-v2-design.md` §2.9 Hook 3. Previously the
    // BASE_EFFECTS row was never added and this call site didn't
    // exist; v2.0 was effectively promising a buff that was
    // silently a no-op. Same wiring as `resolvePenalty` below.
    const fkShotMult = shotFkMultiplier(kickerP);
    const fkAttackScore = attackScore * fkShotMult;
    const defenseScore =
      (gkP.attributes.gk_reflexes ?? 10) * 0.6 +
      (gkP.attributes.gk_handling ?? 10) * 0.4 +
      (gkP.attributes.composure ?? 10) * 0.4;
    const probability = duelProbability(fkAttackScore, defenseScore, {
      amplification: 2.0,
      // baseline 0.18 → 0.36:合成多次机会 → 一次,转化率翻倍
      baseline: 0.36,
      anchorRatio: 2.0,
      anchorProbability: 0.55,
    });
    const isGoal = Math.random() < probability;

    this.events.push({
      minute: this.time,
      type: isGoal ? 'goal' : 'free_kick',
      teamName: attackingTeam.name,
      playerId: kickerP.id,
      data: {
        setPieceType: 'direct_free_kick',
        // v2.5: report the post-COMPOSED multiplier attack score so
        // a debug replay shows the actual number that fed the duel.
        attackScore: Math.round((fkAttackScore) * 100) / 100,
        defenseScore: Math.round((defenseScore) * 100) / 100,
        probability: Math.round((probability) * 100) / 100,
        result: isGoal ? 'goal' : 'save',
      },
    });

    // See the corner-driven goal branch above for the rationale.
    if (isGoal) {
      this.generateSnapshotEvent(this.time);
    }

    // Score is updated by the main minute loop (it scans newEvents for
    // type === 'goal'). Do NOT increment homeScore/awayScore here —
    // doing both was double-counting set-piece goals (see handleCorner
    // comment for the original bug write-up).

    // Update stats
    const teamId = attackingTeam.name;
    this.updateSetPieceStats(teamId, 'direct_fk');
  }

  /**
   * Resolve a penalty kick.
   *
   * 公式：duelProbability(attackScore, defenseScore, { amplification: 1.0, baseline: 0.75 })
   * - amplification=1.0 保持线性（点球是单挑对决，不需要凸性放大）
   * - baseline=0.75 表示对等点球 P=75%（真实点球命中率）
   * - Attack = kickerPen×1.2 + kickerComp×0.5
   * - Defense = GKref×0.8 + GKhand×0.6 + GKcomp×0.4（penalty_saver 能力 +10%）
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
    // v2.5: COMPOSED "冷静 in the clutch" buff on penalties.
    // Silver base 1.15 (Gold 1.21, Bronze 1.105) — see
    // `docs/specialty-v2-design.md` §2.9 Hook 1. Previously the
    // BASE_EFFECTS row was never added and this call site ignored
    // the specialty; v2.0 was effectively promising a buff that
    // was silently a no-op. The pre-v2.5 comment ("composure-gated
    // by the base formula") was wrong — composure feeds the base
    // score, but COMPOSED the *specialty* is what should be applied
    // multiplicatively on top. Apply at the end of the attacker
    // computation so the buff is independent of how the base score
    // happened to be assembled.
    const penaltyShotMult = shotPenaltyMultiplier(kickerP);
    const finalAttackScore = attackScore * penaltyShotMult;
    let defenseScore =
      (gkP.attributes.gk_reflexes ?? 10) * 0.8 +
      (gkP.attributes.gk_handling ?? 10) * 0.6 +
      (gkP.attributes.composure ?? 10) * 0.4;
    // v2 SAVING_MASTER — penalty save boost (replaces v1 PSAVE +10%).
    // The kicker's penalty composure boost (COMPOSED) lives in the
    // kickerP.attributes.composure term above; the system doesn't
    // add a multiplier there because penalties are already
    // composure-gated by the base formula.
    defenseScore *= gkSaveMultiplier(gkP);
    const probability = duelProbability(finalAttackScore, defenseScore, {
      amplification: 1.0,
      baseline: 0.75,
      anchorRatio: 2.0,
      anchorProbability: 0.55,
    });
    const isGoal = Math.random() < probability;

    this.events.push({
      minute: this.time,
      type: isGoal ? 'goal' : 'penalty_miss',
      teamName: attackingTeam.name,
      playerId: kickerP.id,
      data: {
        setPieceType: 'penalty',
        // v2.5: report the post-COMPOSED multiplier attack score so
        // a debug replay shows the actual number that fed the duel.
        attackScore: Math.round((finalAttackScore) * 100) / 100,
        defenseScore: Math.round((defenseScore) * 100) / 100,
        probability: Math.round((probability) * 100) / 100,
        result: isGoal ? 'goal' : 'save',
      },
    });

    // See the corner-driven goal branch above for the rationale.
    if (isGoal) {
      this.generateSnapshotEvent(this.time);
    }

    // Score is updated by the main minute loop (it scans newEvents for
    // type === 'goal'). Do NOT increment homeScore/awayScore here —
    // doing both was double-counting set-piece goals (see handleCorner
    // comment for the original bug write-up).

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
