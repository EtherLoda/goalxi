export enum MatchEventType {
    KICKOFF = 1,
    GOAL = 2,
    SHOT_ON_TARGET = 3,
    SHOT_OFF_TARGET = 4,
    PASS = 5,
    TACKLE = 6,
    INTERCEPTION = 7,
    SAVE = 8,
    FOUL = 9,
    YELLOW_CARD = 10,
    RED_CARD = 11,
    SUBSTITUTION = 12,
    HALF_TIME = 13,
    FULL_TIME = 14,
    INJURY = 15,
    OFFSIDE = 16,
    CORNER = 17,
    FREE_KICK = 18,
    PENALTY = 19,
    FORFEIT = 20,
    SNAPSHOT = 21,
}

export type Zone = 'Defense' | 'Midfield' | 'Attack';

export interface TeamMatchStats {
    possessionTime: number; // Minutes or ticks
    shots: number;
    shotsOnTarget: number;
    passes: number;
    passesCompleted: number;
    tackles: number;
    fouls: number;
    corners: number;
    offsides: number;
    yellowCards: number;
    redCards: number;
}

export interface MatchState {
    matchId: string;
    currentTime: number; // Minutes
    currentSecond: number; // Seconds (0-59)
    homeScore: number;
    awayScore: number;
    possessionTeamId: string | null;
    ballZone: Zone;
    isBallInPlay: boolean;
    events: any[]; // Will be typed as MatchEventEntity or similar DTO
    stats: {
        home: TeamMatchStats;
        away: TeamMatchStats;
    };
}

export interface SimulationConfig {
    tickDuration: number; // Seconds per tick (e.g., 60 for 1 minute)
    matchDuration: number; // Minutes (e.g., 90)
}
