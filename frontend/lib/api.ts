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
    nationality?: string;
    logoUrl?: string;
}

export interface Player {
    id: string;
    teamId: string;
    name: string;
    nationality?: string;
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
            // Try to extract error message from response body
            let errorData: any = {};
            let errorMsg = `API Error: ${res.status} ${res.statusText}`;

            try {
                errorData = await res.json();
                const message = errorData.message || errorData.error;
                if (message) {
                    errorMsg = Array.isArray(message) ? message.join(', ') : message;
                }
            } catch (parseError) {
                // Body is empty or not JSON - use default message
            }

            // Only log errors for non-404s or in development mode
            if (res.status !== 404 || process.env.NODE_ENV === 'development') {
                console.error(`[API] Error ${res.status}: ${res.statusText}`);
                if (Object.keys(errorData).length > 0) {
                    console.error('[API] Error Body:', errorData);
                }
            }

            // Create error with both message and status
            const error: any = new Error(errorMsg);
            error.status = res.status;
            throw error;
        }

        return res.json();
    } catch (error: any) {
        // Check if it's a network error (not an HTTP error)
        if (!error.status) {
            console.error('[API] Network Error - Is the API server running?', error);
            const networkError: any = new Error('Failed to connect to API server. Please ensure the backend is running.');
            networkError.isNetworkError = true;
            throw networkError;
        }
        // Re-throw HTTP errors as-is
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
    description?: string; // Event description for display
    eventType?: string; // Alternative event type field
    eventData?: any; // Alternative data field
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


export interface PlayerState {
    playerId: string;
    name: string;
    position: string;
    stamina: number;
    form: number;
    experience: number;
    age: number;
    ageDays: number;
    contribution: number;
    multiplier: number;
    entryMinute: number; // Minute they entered the pitch (0 if starter)
    sub?: boolean; // Legacy/Optional
    isOriginal?: boolean; // Legacy/Optional
    teamName?: string;
    overall: number; // Overall rating from snapshot
    conditionMultiplier: number;
    positionalContribution: number; // Raw contribution from position (before condition multiplier)
    appearance?: any; // Player appearance data from database
}

export interface TeamSnapshot {
    teamName: string;
    laneStrengths: {
        left: { attack: number; defense: number; possession: number };
        center: { attack: number; defense: number; possession: number };
        right: { attack: number; defense: number; possession: number };
    };
    gkRating: number;
    players: PlayerState[];
}

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

    getPlayers: (teamId: string) => fetchJson<{ data: Player[], meta: any }>(`/players?teamId=${teamId}&limit=100`),

    getMatch: (id: string) => fetchJson<Match>(`/matches/${id}`),

    getMatchEvents: (matchId: string) => fetchJson<MatchEventsResponse>(`/matches/${matchId}/events`),

    getMatchStats: (matchId: string) => fetchJson<MatchStatsRes>(`/stats/matches/${matchId}`),

    triggerSimulation: (matchId: string) => fetchJson<{ status: string; matchId: string }>(`/matches/${matchId}/simulate`, { method: 'POST' }),

    getTactics: (matchId: string) => fetchJson<{ homeTactics: Tactics | null; awayTactics: Tactics | null }>(`/matches/${matchId}/tactics`),

    submitTactics: (matchId: string, teamId: string, lineup: Record<string, string | null>, formation: string, substitutions: any[] = [], instructions: any = {}) =>
        fetchJson<Tactics>(`/matches/${matchId}/tactics`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ teamId, lineup, formation, substitutions, instructions }),
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
    getAuctionByPlayerId: async (playerId: string) => {
        try {
            const auctions = await fetchJson<Auction[]>('/transfer/auction');
            return auctions.find(a => a.player.id === playerId) || null;
        } catch (error: any) {
            // In server components, authentication may not be available
            // Return null instead of throwing to allow graceful degradation
            const errorMessage = error?.message || String(error) || '';
            const errorString = JSON.stringify(error);
            const errorLower = errorMessage.toLowerCase();
            // #region agent log
            if (typeof window !== 'undefined') {
                fetch('http://127.0.0.1:7242/ingest/cda15cfd-2b2c-4a7c-8f03-3a70d4e1a536', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'lib/api.ts:271', message: 'getAuctionByPlayerId catch block', data: { playerId, errorMessage, errorString: errorString.substring(0, 200), has401: errorMessage.includes('401'), hasUnauthorized: errorMessage.includes('Unauthorized') }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run4', hypothesisId: 'D' }) }).catch(() => { });
            }
            // #endregion
            // Check for 401/Unauthorized in multiple ways (case-insensitive)
            if (errorMessage.includes('401') ||
                errorMessage.includes('Unauthorized') ||
                errorLower.includes('401') ||
                errorLower.includes('unauthorized') ||
                errorString.includes('401') ||
                errorString.includes('Unauthorized') ||
                error?.status === 401 ||
                error?.response?.status === 401) {
                // Silently return null for 401 errors in server components
                return null;
            }
            // Re-throw other errors
            throw error;
        }
    },
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

