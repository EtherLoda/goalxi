export type Lane = 'left' | 'center' | 'right';
export type Phase = 'attack' | 'possession' | 'defense';

export interface WeightedAttributeResult {
    total: number;
    breakdown: Record<string, number>;
}

export type ScoreStatus = 'leading' | 'draw' | 'trailing';

export interface TacticalInstruction {
    minute: number;
    type: 'move' | 'swap';
    condition?: ScoreStatus;
    playerId?: string; // For MOVE or SWAP-OUT
    newPlayerId?: string; // For SWAP-IN
    newPosition: string;
}

export interface TacticalPlayer {
    player: any; // Using any for now to avoid circular dependency or import Player type
    positionKey: string;
    isOriginal?: boolean; // To track if they were in the starting 11
    isSentOff?: boolean;
}

export interface TeamSnapshot {
    laneStrengths: {
        left: { attack: number, defense: number, possession: number };
        center: { attack: number, defense: number, possession: number };
        right: { attack: number, defense: number, possession: number };
    };
    gkRating: number;
}

