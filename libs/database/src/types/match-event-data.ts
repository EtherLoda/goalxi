// JSONB data field types for match events.
// Each event type has its own strongly-typed data payload.

export interface Position {
    x: number;
    y: number;
}

export interface ShotEventData {
    shotType: 'normal' | 'header' | 'long_shot' | 'one_on_one' | 'penalty' | 'free_kick' | 'rebounded';
    bodyPart: 'head' | 'left_foot' | 'right_foot' | 'other';
    position: Position;
    quality: number;
    gkRating: number;
    wasBlocked: boolean;
    blockPlayerId?: string;
    isOneOnOne: boolean;
}

export interface GoalEventData extends ShotEventData {
    goalFrom: 'close_range' | 'long_range';
    defendingRating: number;
    shotNumber: number;
}

export interface CardEventData {
    cardType: 'yellow' | 'second_yellow' | 'red';
    reason: string;
    foulMinute?: number;
}

export interface SubstitutionEventData {
    position: string;
    formation: string;
    tacticalReason: 'attacking' | 'defensive' | 'injury' | 'tired' | 'tactical';
    substitutePlayerId: string;
}

export interface InjuryEventData {
    injuryType: string;
    bodyPart: string;
    severity: 'mild' | 'moderate' | 'severe';
    treatmentSeconds: number;
    missedGames: number;
    recoveryDays: number;
}

export interface PenaltyEventData {
    outcome: 'goal' | 'miss' | 'saved';
    shotType: 'normal' | 'long_shot' | 'one_on_one';
    penaltyTakerId: string;
    gkId: string;
    gkRating: number;
    quality: number;
}

export interface SetPieceEventData {
    delivery: 'short' | 'long' | 'inswinging' | 'outswinging';
    outcome: 'goal' | 'shot' | 'clearance' | 'possession';
}

export interface PeriodEventData {
    homeTeam: string;
    awayTeam: string;
    period: string;
}

export interface ForfeitEventData {
    forfeitingTeam: string;
    winner: string;
}

export interface LineupEventData {
    players: Array<{
        playerId: string;
        playerName: string;
        position: string;
        number: number;
    }>;
}

export interface VarEventData {
    decision: 'goal' | 'no_goal' | 'penalty' | 'red_card' | 'cancellation';
    reason: string;
    originalMinute: number;
}

export type MatchEventData =
    | GoalEventData
    | ShotEventData
    | CardEventData
    | SubstitutionEventData
    | InjuryEventData
    | PenaltyEventData
    | SetPieceEventData
    | PeriodEventData
    | ForfeitEventData
    | LineupEventData
    | VarEventData
    | Record<string, never>;
