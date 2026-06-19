export type Lane = 'left' | 'center' | 'right';
export type Phase = 'attack' | 'possession' | 'defense';

// 进攻类型枚举
export enum AttackType {
  CROSS = 0, // 传中
  SHORT_PASS = 1, // 短传配合
  THROUGH_PASS = 2, // 直塞
  DRIBBLE = 3, // 突破
  LONG_SHOT = 4, // 远射
}

// 射门类型枚举
export enum ShotType {
  HEADER = 0, // 头球
  ONE_ON_ONE = 1, // 单刀
  NORMAL = 2, // 抽射
  REBOUND = 3, // 补射
  LONG_SHOT = 4, // 远射
}

export interface WeightedAttributeResult {
  total: number;
  breakdown: Record<string, number>;
}

export type ScoreStatus = 'leading' | 'draw' | 'trailing';

/**
 * Trigger condition for a tactical event (sub or move). Mirrors the
 * frontend's `EventCondition` type. `always` fires unconditionally;
 * the others gate the event on the team's score state at the
 * scheduled minute.
 *
 *   always       — fire regardless of score
 *   leading      — only when the team is ahead
 *   trailing     — only when the team is behind
 *   tied         — only when the score is level (synonym of `draw`)
 *   notLeading   — only when NOT ahead (trailing or tied)
 *   notTrailing  — only when NOT behind (leading or tied)
 */
export type EventCondition =
  | 'always'
  | 'leading'
  | 'trailing'
  | 'tied'
  | 'notLeading'
  | 'notTrailing';

export interface TacticalInstruction {
  minute: number;
  type: 'move' | 'swap' | 'position_swap';
  condition?: EventCondition;
  playerId?: string; // For MOVE or SWAP-OUT
  newPlayerId?: string; // For SWAP-IN
  newPosition: string;
}

export interface TacticalPlayer {
  player: any;
  positionKey: string;
  entryMinute?: number;
  isSentOff?: boolean;
  yellowCards?: number;
  teamName?: string; // Set during Team construction for injury tracking
}

export interface TeamSnapshot {
  laneStrengths: {
    left: { attack: number; defense: number; possession: number };
    center: { attack: number; defense: number; possession: number };
    right: { attack: number; defense: number; possession: number };
  };
  gkRating: number;
}
