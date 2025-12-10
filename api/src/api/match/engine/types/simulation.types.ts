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

export interface TeamSnapshot {
    laneStrengths: {
        left: { attack: number, defense: number, possession: number };
        center: { attack: number, defense: number, possession: number };
        right: { attack: number, defense: number, possession: number };
    };
    gkRating: number;
}
