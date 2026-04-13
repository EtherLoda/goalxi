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
  specialties?: string[];
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
  venue: string | null;
}

interface MatchListResponse {
  matches: Match[];
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
    getByUser: async (userId: string): Promise<Team> => {
      return request<Team>(`/teams/user/${userId}`);
    },
  },

  players: {
    getByTeam: async (teamId: string): Promise<{ items: Player[]; meta: any }> => {
      const response = await request<any>(`/players?teamId=${teamId}&limit=100`);
      // Handle both paginated {data, pagination} and direct array responses
      if (Array.isArray(response)) {
        return { items: response, meta: {} };
      }
      return { items: response.data || response.items || [], meta: response.pagination || response.meta || {} };
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
    getByTeam: async (teamId: string, status?: string): Promise<MatchListResponse> => {
      const params = new URLSearchParams({ teamId });
      if (status) params.append('status', status);
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
  status: 'active' | 'completed' | 'cancelled';
  createdAt: string;
}

interface BidRecord {
  teamId: string;
  teamName: string;
  amount: number;
  timestamp: string;
}

export type { User, Team, LoginResponse, League, Standing, Match, Player, TransferAuction, BidRecord };
