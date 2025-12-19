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
    position: string;
    overall: number;
    isGoalkeeper: boolean;
    age: number;
    ageDays: number;
    stamina: number;
    form: number;
    isYouth: boolean;
    onTransfer: boolean;
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
    homeTacticsSet?: boolean;
    awayTacticsSet?: boolean;
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

export interface Transaction {
    id: string;
    season: number;
    amount: number;
    type: 'MATCH_INCOME' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'WAGES' | 'SPONSORSHIP' | 'FACILITY_UPGRADE';
    description?: string;
    createdAt: string;
}

export interface FinanceState {
    balance: number;
}

export interface Auction {
    id: string;
    player: Player;
    team: Team;
    startPrice: number;
    buyoutPrice: number;
    currentPrice: number;
    currentBidder?: Team;
    startedAt: string;
    expiresAt: string;
    endsAt?: string;
    status: 'ACTIVE' | 'SOLD' | 'EXPIRED' | 'CANCELLED';
    bidHistory: any[];
}
const API_BASE_URL = 'http://127.0.0.1:3000/api/v1';

async function fetchJson<T>(endpoint: string, options?: RequestInit): Promise<T> {
    // Get token from localStorage if in browser environment
    const token = typeof window !== 'undefined' ? localStorage.getItem('goalxi_token') : null;

    // Merge headers
    const headers = new Headers(options?.headers);
    if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    console.log(`[API] Fetching: ${API_BASE_URL}${endpoint}`);
    try {
        const res = await fetch(`${API_BASE_URL}${endpoint}`, {
            cache: 'no-store', // Always fetch fresh data for now
            ...options,
            headers,
        });

        if (!res.ok) {
            console.error(`[API] Error ${res.status}: ${res.statusText}`);
            // Try to extract error message from response body
            try {
                const errorData = await res.json();
                console.error('[API] Error Body:', errorData);
                const message = errorData.message || errorData.error || `API Error: ${res.status} ${res.statusText}`;
                throw new Error(Array.isArray(message) ? message.join(', ') : message);
            } catch (parseError) {
                // If parsing fails, throw generic error
                throw new Error(`API Error: ${res.status} ${res.statusText}`);
            }
        }

        return res.json();
    } catch (error) {
        console.error('[API] Network/Fetch Error:', error);
        throw error;
    }
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

export interface Tactics {
    id: string;
    matchId: string;
    teamId: string;
    formation?: string;
    lineup: Record<string, string | null>;
    mentality?: string;
    focus?: string;
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

    getMatches: (leagueId?: string, season: number = 1, teamId?: string) => {
        let url = `/matches?season=${season}&limit=100`;
        if (leagueId) url += `&leagueId=${leagueId}`;
        if (teamId) url += `&teamId=${teamId}`;
        return fetchJson<{ data: Match[] }>(url).then(res => res.data);
    },

    getTeam: (id: string) => fetchJson<Team>(`/teams/${id}`),

    getPlayer: (id: string) => fetchJson<Player>(`/players/${id}`),

    getPlayers: (teamId: string) => fetchJson<{ data: Player[], meta: any }>(`/players?teamId=${teamId}`),

    getMatch: (id: string) => fetchJson<Match>(`/matches/${id}`),

    getMatchEvents: (matchId: string) => fetchJson<MatchEventsResponse>(`/matches/${matchId}/events`),

    getMatchStats: (matchId: string) => fetchJson<MatchStatsRes>(`/stats/matches/${matchId}`),

    triggerSimulation: (matchId: string) => fetchJson<{ status: string; matchId: string }>(`/matches/${matchId}/simulate`, { method: 'POST' }),

    getTactics: (matchId: string) => fetchJson<{ homeTactics: Tactics | null; awayTactics: Tactics | null }>(`/matches/${matchId}/tactics`),

    submitTactics: (matchId: string, teamId: string, lineup: Record<string, string | null>, formation: string) =>
        fetchJson<Tactics>(`/matches/${matchId}/tactics`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ teamId, lineup, formation }),
        }),

    // Auth
    login: (data: any) => fetchJson<any>('/auth/email/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    }),

    register: (data: any) => fetchJson<any>('/auth/email/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    }),

    getMe: (token: string) => fetchJson<any>('/users/me', {
        headers: { 'Authorization': `Bearer ${token}` }
    }),

    // Finance
    getFinanceBalance: () => fetchJson<FinanceState>('/finance/balance'),
    getTransactions: (season?: number, type?: string) => {
        let url = '/finance/transactions';
        const params = new URLSearchParams();
        if (season) params.append('season', season.toString());
        if (type) params.append('type', type);
        const queryString = params.toString();
        if (queryString) url += `?${queryString}`;
        return fetchJson<Transaction[]>(url);
    },

    // Transfer/Auction
    getAuctions: () => fetchJson<Auction[]>('/transfer/auction'),
    placeBid: (auctionId: string, amount: number) =>
        fetchJson<Auction>(`/transfer/auction/${auctionId}/bid`, {
            method: 'POST',
            body: JSON.stringify({ amount }),
            headers: { 'Content-Type': 'application/json' }
        }),
    buyoutAuction: (auctionId: string) =>
        fetchJson<Auction>(`/transfer/auction/${auctionId}/buyout`, {
            method: 'POST'
        }),
    createAuction: (playerId: string, startPrice: number, buyoutPrice: number, durationHours: number) =>
        fetchJson<Auction>('/transfer/auction', {
            method: 'POST',
            body: JSON.stringify({ playerId, startPrice, buyoutPrice, durationHours }),
            headers: { 'Content-Type': 'application/json' }
        }),
};

