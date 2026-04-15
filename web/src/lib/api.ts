const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

interface LoginResponse {
  userId: string;
  accessToken: string;
  refreshToken: string;
  tokenExpires: number;
}

interface RegisterResponse {
  userId: string;
}

interface User {
  id: string;
  username: string;
  email: string;
  nickname: string;
  bio: string | null;
  supporterLevel: number;
}

interface Team {
  id: string;
  name: string;
  leagueId: string;
  isBot: boolean;
  jerseyColorPrimary: string;
  jerseyColorSecondary: string;
}

interface League {
  id: string;
  name: string;
  tier: number;
  tierDivision: number;
}

interface PlayerSkills {
  physical: { pace?: number; strength?: number };
  technical: Record<string, number>;
  mental: { composure?: number; positioning?: number };
  setPieces: { freeKicks?: number; penalties?: number };
}

interface Player {
  id: string;
  teamId: string | null;
  name: string;
  nationality?: string;
  birthday?: string;
  age: number;
  ageDays: number;
  isYouth: boolean;
  isGoalkeeper: boolean;
  overall: number;
  pwi: number;
  pwiDisplay: string;
  position?: string;
  teamName?: string;
  onTransfer: boolean;
  currentSkills: PlayerSkills;
  potentialSkills: PlayerSkills;
  potentialAbility: number;
  potentialTier: string;
  trainingSlot: string;
  experience: number;
  form: number;
  stamina: number;
  currentWage: number;
  specialty?: string;
}

interface PlayerListResponse {
  items: Player[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

interface PlayerEvent {
  id: string;
  playerId: string;
  season: number;
  date: string;
  eventType: string;
  icon?: string;
  titleKey?: string;
  matchId?: string;
  titleData?: Record<string, any>;
  details?: any;
}

interface Match {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  scheduledAt: string;
  matchday: number | null;
  leagueId: string;
  season: number;
  week: number;
  venue: string | null;
}

interface MatchListResponse {
  data: Match[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

interface Standing {
  position: number;
  teamId: string;
  teamName: string;
  leagueId: string;
  season: number;
  played: number;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('goalxi_token');
}

function setToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('goalxi_token', token);
}

function removeToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('goalxi_token');
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    // Prefer the API's error message, fallback to status text
    const errorMessage = errorData?.message || response.statusText || `Error ${response.status}`;
    throw new Error(errorMessage);
  }

  return response.json();
}

export const api = {
  auth: {
    login: async (email: string, password: string): Promise<LoginResponse> => {
      const data = await request<LoginResponse>('/auth/email/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setToken(data.accessToken);
      return data;
    },

    register: async (
      username: string,
      email: string,
      password: string
    ): Promise<RegisterResponse> => {
      return request<RegisterResponse>('/auth/email/register', {
        method: 'POST',
        body: JSON.stringify({ username, email, password }),
      });
    },

    logout: async (): Promise<void> => {
      try {
        await request('/auth/logout', { method: 'POST' });
      } finally {
        removeToken();
      }
    },

    refresh: async (refreshToken: string): Promise<LoginResponse> => {
      const data = await request<LoginResponse>('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });
      setToken(data.accessToken);
      return data;
    },
  },

  users: {
    me: async (): Promise<User> => {
      return request<User>('/users/me');
    },
  },

  teams: {
    getById: async (id: string): Promise<Team> => {
      return request<Team>(`/teams/${id}`);
    },
    getByUser: async (userId: string): Promise<Team> => {
      return request<Team>(`/teams/user/${userId}`);
    },
  },

  players: {
    getById: async (id: string): Promise<Player> => {
      return request<Player>(`/players/${id}`);
    },
    getByTeam: async (teamId: string): Promise<{ items: Player[]; meta: any }> => {
      const response = await request<any>(`/players?teamId=${teamId}&limit=100`);
      // Handle both paginated {data, pagination} and direct array responses
      if (Array.isArray(response)) {
        return { items: response, meta: {} };
      }
      return { items: response.data || response.items || [], meta: response.pagination || response.meta || {} };
    },
    getEvents: async (playerId: string, season?: number): Promise<PlayerEvent[]> => {
      const params = new URLSearchParams();
      if (season !== undefined) params.append('season', String(season));
      const qs = params.toString();
      return request<PlayerEvent[]>(`/player-events/player/${playerId}${qs ? `?${qs}` : ''}`);
    },
  },

  leagues: {
    getById: async (id: string): Promise<League> => {
      return request<League>(`/leagues/${id}`);
    },
    getStandings: async (leagueId: string): Promise<Standing[]> => {
      return request<Standing[]>(`/leagues/${leagueId}/standings`);
    },
  },

  matches: {
    getByTeam: async (teamId: string, filters?: {
      status?: string;
      week?: number;
      season?: number;
      leagueId?: string;
    }): Promise<MatchListResponse> => {
      const params = new URLSearchParams({ teamId });
      if (filters?.status) params.append('status', filters.status);
      if (filters?.week) params.append('week', String(filters.week));
      if (filters?.season) params.append('season', String(filters.season));
      if (filters?.leagueId) params.append('leagueId', filters.leagueId);
      return request<MatchListResponse>(`/matches?${params.toString()}`);
    },
    getByLeague: async (leagueId: string, filters?: {
      status?: string;
      week?: number;
      season?: number;
    }): Promise<MatchListResponse> => {
      const params = new URLSearchParams({ leagueId });
      if (filters?.status) params.append('status', filters.status);
      if (filters?.week) params.append('week', String(filters.week));
      if (filters?.season) params.append('season', String(filters.season));
      return request<MatchListResponse>(`/matches?${params.toString()}`);
    },
  },

  transfers: {
    getAuctions: async (): Promise<TransferAuction[]> => {
      return request<TransferAuction[]>('/transfer/auction');
    },
    createAuction: async (playerId: string, startPrice: number, buyoutPrice: number, durationHours?: number): Promise<TransferAuction> => {
      const body: Record<string, unknown> = { playerId, startPrice, buyoutPrice };
      if (durationHours !== undefined) {
        body.durationHours = durationHours;
      }
      return request<TransferAuction>('/transfer/auction', {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
    placeBid: async (auctionId: string, amount: number): Promise<TransferAuction> => {
      return request<TransferAuction>(`/transfer/auction/${auctionId}/bid`, {
        method: 'POST',
        body: JSON.stringify({ amount }),
      });
    },
    buyout: async (auctionId: string): Promise<TransferAuction> => {
      return request<TransferAuction>(`/transfer/auction/${auctionId}/buyout`, {
        method: 'POST',
      });
    },
    getMyBids: async (): Promise<MyBid[]> => {
      return request<MyBid[]>('/transfer/auction/my-bids');
    },
    getMyListings: async (): Promise<TransferAuction[]> => {
      return request<TransferAuction[]>('/transfer/auction/my-listings');
    },
    getMyPurchases: async (date?: string): Promise<TransferTransaction[]> => {
      const params = date ? `?date=${date}` : '';
      return request<TransferTransaction[]>(`/transfer/transactions/purchases${params}`);
    },
    getMySales: async (date?: string): Promise<TransferTransaction[]> => {
      const params = date ? `?date=${date}` : '';
      return request<TransferTransaction[]>(`/transfer/transactions/sales${params}`);
    },
  },

  game: {
    getCurrent: async (): Promise<{ season: number; week: number }> => {
      return request<{ season: number; week: number }>('/game/current');
    },
  },

  finance: {
    getBalance: async (): Promise<{ balance: number; lockedCash: number }> => {
      return request<{ balance: number; lockedCash: number }>('/finance/balance');
    },
    getTransactions: async (params?: { season?: number; type?: string }): Promise<FinanceTransaction[]> => {
      const searchParams = new URLSearchParams();
      if (params?.season) searchParams.set('season', String(params.season));
      if (params?.type) searchParams.set('type', params.type);
      const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
      return request<FinanceTransaction[]>(`/finance/transactions${query}`);
    },
  },
};

interface TransferAuction {
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
  bidHistory: BidRecord[];
  status: 'ACTIVE' | 'SETTLING' | 'SOLD' | 'EXPIRED' | 'CANCELLED';
  createdAt: string;
}

interface MyBid extends TransferAuction {
  isLeading: boolean;
  isOutbid: boolean;
}

interface TransferTransaction {
  id: string;
  auctionId: string;
  player: Player;
  fromTeam: Team;
  fromTeamId?: string;
  toTeam: Team;
  toTeamId?: string;
  amount: number;
  type: 'BUYOUT' | 'AUCTION_COMPLETE';
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  transactionDate: string;
  settledAt?: string;
  season: number;
}

interface BidRecord {
  teamId: string;
  teamName: string;
  amount: number;
  timestamp: string;
}

interface FinanceTransaction {
  id: string;
  season: number;
  amount: number;
  type: string;
  description?: string;
  createdAt: string;
}

export type { User, Team, LoginResponse, League, Standing, Match, Player, TransferAuction, MyBid, TransferTransaction, BidRecord, FinanceTransaction, PlayerEvent };
