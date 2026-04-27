'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { api, type User, type Team } from '@/lib/api';
import { useGameStore } from '@/stores/gameStore';

interface AuthContextType {
  user: User | null;
  team: Team | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      // ignore logout API errors
    } finally {
      setUser(null);
      setTeam(null);
      useGameStore.getState().clear();
      router.push('/');
    }
  }, [router]);

  const fetchUserAndTeam = useCallback(async (userId: string) => {
    try {
      const userData = await api.users.me();
      setUser(userData);

      const teamData = await api.teams.getByUser(userId);
      setTeam(teamData);

      // Sync game state to global store
      const gameState = await api.game.getCurrent();
      useGameStore.getState().setSeason(gameState.season);
      useGameStore.getState().setWeek(gameState.week);
      useGameStore.getState().setTeam({
        teamId: teamData.id,
        teamName: teamData.name,
        leagueId: teamData.leagueId,
        leagueName: '', // league name not in team data, can be fetched separately if needed
      });
    } catch (error) {
      console.error('Failed to fetch user/team:', error);
      logout();
    }
  }, [logout]);

  useEffect(() => {
    const token = localStorage.getItem('goalxi_token');
    if (!token) {
      setIsLoading(false);
      return;
    }

    Promise.all([api.users.me(), api.game.getCurrent()])
      .then(([userData, gameState]) => {
        setUser(userData);
        useGameStore.getState().setSeason(gameState.season);
        useGameStore.getState().setWeek(gameState.week);
        return api.teams.getByUser(userData.id);
      })
      .then((teamData) => {
        setTeam(teamData);
        useGameStore.getState().setTeam({
          teamId: teamData.id,
          teamName: teamData.name,
          leagueId: teamData.leagueId,
          leagueName: '',
        });
      })
      .catch(() => {
        localStorage.removeItem('goalxi_token');
        setUser(null);
        setTeam(null);
        useGameStore.getState().clear();
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  // Allow anonymous viewing - auth only needed for private operations

  const login = async (email: string, password: string) => {
    const { userId } = await api.auth.login(email, password);
    await fetchUserAndTeam(userId);
    // Use the team from the AuthContext state via the callback to ensure it's set
    const currentTeam = useGameStore.getState().teamId;
    router.push(`/en/dashboard?team=${currentTeam}`);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        team,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
