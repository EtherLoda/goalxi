export type Lane = 'left' | 'center' | 'right';
export type Phase = 'attack' | 'possession' | 'defense';

export interface WeightedAttributeResult {
    total: number;
    breakdown: Record<string, number>;
}

export interface TacticalPlayer {
    player: any; // Using any for now to avoid circular dependency or import Player type
    positionKey: string;
}

