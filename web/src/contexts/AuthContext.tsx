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
    await api.auth.logout();
    setUser(null);
    setTeam(null);
    router.push('/auth/login');
  }, [router]);

  const fetchUserAndTeam = useCallback(async (userId: string) => {
    try {
      const userData = await api.users.me();
      setUser(userData);

      const teamData = await api.teams.getByUser(userId);
      setTeam(teamData);
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

    api.users
      .me()
      .then((userData) => {
        setUser(userData);
        return api.teams.getByUser(userData.id);
      })
      .then((teamData) => {
        setTeam(teamData);
      })
      .catch(() => {
        localStorage.removeItem('goalxi_token');
        setUser(null);
        setTeam(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  // Redirect to login if not authenticated and on protected route
  useEffect(() => {
    if (!isLoading && !user && pathname?.startsWith('/en/dashboard')) {
      router.push('/auth/login');
    }
  }, [isLoading, user, pathname, router]);

  const login = async (email: string, password: string) => {
    const { userId } = await api.auth.login(email, password);
    await fetchUserAndTeam(userId);
    router.push('/en/dashboard');
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
