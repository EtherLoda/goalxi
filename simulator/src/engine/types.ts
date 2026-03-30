import { MatchEventType } from '@goalxi/database';

export { MatchEventType };

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
    homeTeamId: string;
    awayTeamId: string;
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
