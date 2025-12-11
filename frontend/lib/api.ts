export interface League {
    id: string;
    name: string;
    tier: number;
    division: number;
    status: string;
}

export interface Team {
    id: string;
    name: string;
    logoUrl?: string;
}

export interface Player {
    id: string;
    teamId: string;
    name: string;
    isGoalkeeper: boolean;
    age: number;
    stamina: number;
    form: number;
    isYouth: boolean;
    currentSkills?: any;
    potentialSkills?: any;
    potentialTier?: string;
    experience?: number;
    appearance?: any;
}

export interface Match {
    id: string;
    leagueId: string;
    season: number;
    week: number;
    homeTeamId: string;
    awayTeamId: string;
    homeTeam?: Team;
    awayTeam?: Team;
    homeScore?: number;
    awayScore?: number;
    scheduledAt: string;
    status: 'scheduled' | 'tactics_locked' | 'in_progress' | 'completed' | 'cancelled';
    type: string;
}

export interface LeagueStanding {
    position: number;
    teamId: string;
    teamName: string;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goalsFor: number;
    goalsAgainst: number;
    goalDifference: number;
    points: number;
}
const API_BASE_URL = 'http://localhost:3000/api/v1';

async function fetchJson<T>(endpoint: string): Promise<T> {
    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        cache: 'no-store', // Always fetch fresh data for now
    });

    if (!res.ok) {
        throw new Error(`API Error: ${res.status} ${res.statusText}`);
    }

    return res.json();
}

// ... (interfaces)

export interface MatchEvent {
    id: string;
    matchId: string;
    minute: number;
    second: number;
    type: string;
    typeName: string;
    teamId?: string;
    playerId?: string;
    data?: any;
}

export interface MatchTeamStats {
    id: string;
    matchId: string;
    teamId: string;
    possession: number;
    shots: number;
    shotsOnTarget: number;
    corners: number;
    fouls: number;
    offsides: number;
    yellowCards: number;
    redCards: number;
    passes: number;
    score: number;
}

export interface MatchStatsRes {
    home: MatchTeamStats;
    away: MatchTeamStats;
}

// ... (api object)

export interface MatchEventsResponse {
    matchId: string;
    currentMinute: number;
    totalMinutes: number;
    isComplete: boolean;
    events: MatchEvent[];
    currentScore: {
        home: number;
        away: number;
    };
    stats: {
        home: MatchTeamStats;
        away: MatchTeamStats;
    } | null;
}

export const api = {
    getLeague: (id: string) => fetchJson<League>(`/leagues/${id}`),

    getStandings: (leagueId: string, season: number = 1) =>
        fetchJson<LeagueStanding[]>(`/leagues/${leagueId}/standings?season=${season}`),

    getMatches: (leagueId: string, season: number = 1) =>
        fetchJson<{ data: Match[] }>(`/matches?leagueId=${leagueId}&season=${season}&limit=100`).then(res => res.data),

    getTeam: (id: string) => fetchJson<Team>(`/teams/${id}`),

    getPlayer: (id: string) => fetchJson<Player>(`/players/${id}`),

    getPlayers: (teamId: string) => fetchJson<{ data: Player[], meta: any }>(`/players?teamId=${teamId}`),

    getMatch: (id: string) => fetchJson<Match>(`/matches/${id}`),

    getMatchEvents: (matchId: string) => fetchJson<MatchEventsResponse>(`/matches/${matchId}/events`),

    getMatchStats: (matchId: string) => fetchJson<MatchStatsRes>(`/stats/matches/${matchId}`),
};

