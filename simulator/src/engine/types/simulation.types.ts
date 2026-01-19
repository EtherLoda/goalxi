export type Lane = 'left' | 'center' | 'right';
export type Phase = 'attack' | 'possession' | 'defense';

// 进攻类型枚举
export enum AttackType {
    CROSS = 0,        // 传中
    SHORT_PASS = 1,   // 短传配合
    THROUGH_PASS = 2, // 直塞
    DRIBBLE = 3,      // 突破
    LONG_SHOT = 4,    // 远射
}

// 射门类型枚举
export enum ShotType {
    HEADER = 0,      // 头球
    ONE_ON_ONE = 1,  // 单刀
    NORMAL = 2,      // 抽射
    REBOUND = 3,     // 补射
    LONG_SHOT = 4    // 远射
}

export interface WeightedAttributeResult {
    total: number;
    breakdown: Record<string, number>;
}

export type ScoreStatus = 'leading' | 'draw' | 'trailing';

export interface TacticalInstruction {
    minute: number;
    type: 'move' | 'swap' | 'position_swap';
    condition?: ScoreStatus;
    playerId?: string; // For MOVE or SWAP-OUT
    newPlayerId?: string; // For SWAP-IN
    newPosition: string;
}

export interface TacticalPlayer {
    player: any; // Using any for now to avoid circular dependency or import Player type
    positionKey: string;
    entryMinute?: number; // Minute they entered the pitch (0 if starter)
    isSentOff?: boolean;
    yellowCards?: number; // Track yellow cards (2 = send off)
}

export interface TeamSnapshot {
    laneStrengths: {
        left: { attack: number, defense: number, possession: number };
        center: { attack: number, defense: number, possession: number };
        right: { attack: number, defense: number, possession: number };
    };
    gkRating: number;
}

