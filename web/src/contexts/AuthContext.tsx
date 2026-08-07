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
import { api, type User, type Team, type OnboardingState } from '@/lib/api';
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

/**
 * Routes that are off-limits to users whose onboarding worker
 * has not yet finished. We allow `/onboarding/select` itself
 * and the auth pages, otherwise the user gets bounced to
 * `/onboarding/select` on every navigation. Match the whitelist
 * pattern on the server too if you ever add one — the
 * `AuthGuard` decorator marks the endpoint as `@Public()`.
 */
const ONBOARDING_ALLOWED_PATHS = [
  /^\/[^/]+\/auth\//,
  /^\/[^/]+\/onboarding\//,
];

function isOnboardingAllowedPath(pathname: string): boolean {
  return ONBOARDING_ALLOWED_PATHS.some((re) => re.test(pathname));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
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
      setOnboarding(null);
      useGameStore.getState().clear();
      router.push('/');
    }
  }, [router]);

  /**
   * After a successful login (or page refresh) we need to:
   *   1. Know who the user is.
   *   2. Know their team.
   *   3. Know their onboarding state — because step (2) is a
   *      no-op for a freshly-registered user whose claim job
   *      is still in flight.
   *
   * `api.onboarding.getState()` is the single source of truth
   * for step (3) and also returns the team summary when
   * status=active. We use it as the routing input: if
   * `hasTeam=true`, send the user to /dashboard; otherwise
   * send them to /onboarding/select (which polls until
   * `hasTeam` flips).
   */
  const fetchUserAndOnboarding = useCallback(
    async (userId: string) => {
      try {
        const [userData, onboardingState, gameState] = await Promise.all([
          api.users.me(),
          api.onboarding.getState(),
          api.game.getCurrent(),
        ]);

        setUser(userData);
        setOnboarding(onboardingState);

        useGameStore.getState().setSeason(gameState.season);
        useGameStore.getState().setWeek(gameState.week);

        if (onboardingState.hasTeam && onboardingState.team) {
          // Promote the onboarding summary to the full Team
          // shape the rest of the app reads from
          // `useGameStore.teamId`. Fields we don't have at this
          // point default to sensible empty values — pages
          // that care about them refetch via `api.teams.getById`.
          setTeam({
            id: onboardingState.team.id,
            name: onboardingState.team.name,
            leagueId: onboardingState.team.leagueId ?? '',
            isBot: onboardingState.team.isBot,
            jerseyColorPrimary: '#FF0000',
            jerseyColorSecondary: '#FFFFFF',
          });
          useGameStore.getState().setTeam({
            teamId: onboardingState.team.id,
            teamName: onboardingState.team.name,
            leagueId: onboardingState.team.leagueId,
            leagueName: '',
          });
        } else {
          setTeam(null);
        }
      } catch (error) {
        console.error('Failed to fetch user/onboarding:', error);
        logout();
      }
    },
    [logout],
  );

  useEffect(() => {
    const token = localStorage.getItem('goalxi_token');
    if (!token) {
      setIsLoading(false);
      return;
    }

    // Boot path: hydrate from localStorage. We still poll the
    // onboarding endpoint on every page navigation (see the
    // pathname effect below) — this is the first chance to
    // bounce a freshly-registered user to /onboarding/select.
    api.users
      .me()
      .then((userData) => {
        setUser(userData);
        return Promise.all([api.onboarding.getState(), api.game.getCurrent()]);
      })
      .then(([onboardingState, gameState]) => {
        setOnboarding(onboardingState);
        useGameStore.getState().setSeason(gameState.season);
        useGameStore.getState().setWeek(gameState.week);
        if (onboardingState.hasTeam && onboardingState.team) {
          setTeam({
            id: onboardingState.team.id,
            name: onboardingState.team.name,
            leagueId: onboardingState.team.leagueId ?? '',
            isBot: onboardingState.team.isBot,
            jerseyColorPrimary: '#FF0000',
            jerseyColorSecondary: '#FFFFFF',
          });
          useGameStore.getState().setTeam({
            teamId: onboardingState.team.id,
            teamName: onboardingState.team.name,
            leagueId: onboardingState.team.leagueId,
            leagueName: '',
          });
        }
      })
      .catch(() => {
        localStorage.removeItem('goalxi_token');
        setUser(null);
        setTeam(null);
        setOnboarding(null);
        useGameStore.getState().clear();
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  /**
   * Page-level guard. On every navigation we re-check the
   * onboarding state: if the user is authenticated but still
   * teamless, we silently send them to /onboarding/select
   * unless they are already on an allowed path.
   *
   * Polling cadence: the onboarding page is the right place
   * to set up its own interval (it owns the loading UI);
   * this effect just routes people who wander away from it.
   */
  useEffect(() => {
    if (!user) return;
    if (!onboarding) return;
    if (onboarding.hasTeam) return;
    if (isOnboardingAllowedPath(pathname)) return;
    router.push(`/${pathname.split('/')[1]}/onboarding/select`);
  }, [user, onboarding, pathname, router]);

  const login = async (email: string, password: string) => {
    const { userId } = await api.auth.login(email, password);
    await fetchUserAndOnboarding(userId);
    const locale = pathname.split('/')[1] || 'en';
    // Route based on onboarding state. If the user is mid-flow
    // (e.g. session expired and they had to re-login during
    // onboarding), we send them to the select page which will
    // resume polling and route them forward.
    if (onboarding?.hasTeam) {
      const teamId = useGameStore.getState().teamId;
      router.push(`/${locale}/dashboard?team=${teamId}`);
    } else {
      router.push(`/${locale}/onboarding/select`);
    }
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
