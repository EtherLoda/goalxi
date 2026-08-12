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
import { routing } from '@/i18n/routing';

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

/**
 * Resolve which locale segment to use for redirect targets
 * after login. Priority:
 *   1. `user.preferredLanguage` if it's a locale we actually
 *      support (matches `routing.locales`).
 *   2. Fall back to `routing.defaultLocale` (`'en'`).
 *
 * Why a whitelist check: a malicious or stale DB row could
 * carry a value that isn't in `routing.locales` (e.g. an
 * older schema, a test fixture, a row that pre-dates the
 * column being added). Dropping an unsupported code straight
 * into `router.push` would produce a `/xx/dashboard` URL the
 * middleware can't resolve, and the user would get a 404
 * instead of a dashboard. `defaultLocale` is the safe
 * fallback because next-intl guarantees it exists.
 */
function pickRedirectLocale(user: User | null | undefined): string {
  const preferred = user?.preferredLanguage;
  if (
    preferred &&
    (routing.locales as readonly string[]).includes(preferred)
  ) {
    return preferred;
  }
  return routing.defaultLocale;
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
   *
   * Returns the resolved `userData` and `onboardingState`
   * directly so callers (e.g. `login`) can branch on the
   * fresh values — `setUser`/`setOnboarding` only schedule
   * a re-render, the surrounding closure variables (`user`,
   * `onboarding`) are still the stale snapshots from the
   * previous render. Reading the return value is the only
   * race-free way to route by `preferredLanguage` and
   * `hasTeam` in the same tick.
   */
  const fetchUserAndOnboarding = useCallback(
    async (
      userId: string,
    ): Promise<{ userData: User; onboardingState: OnboardingState } | null> => {
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

        return { userData, onboardingState };
      } catch (error) {
        console.error('Failed to fetch user/onboarding:', error);
        logout();
        return null;
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

  /**
   * Locale auto-correction on page refresh / cold load.
   *
   * The user might have registered under `/zh` but is
   * currently looking at `/en/dashboard` (e.g. they shared a
   * link, restored a tab, or followed an in-app link built
   * from a stale locale). Once `user` is hydrated we redirect
   * to the right locale by swapping the URL's first segment.
   *
   * Skip the auth pages and the onboarding screen because
   * those are the exact places the user is most likely to
   * have navigated deliberately to the "wrong" locale (e.g.
   * signing up from `/en/register` for an English friend).
   * Letting them stay there respects the URL they typed.
   *
   * Also skip when the current locale is already a match —
   * no need to push a no-op redirect that would also
   * interrupt client-side navigation animation.
   */
  useEffect(() => {
    if (!user) return;
    if (isOnboardingAllowedPath(pathname)) return;
    const segments = pathname.split('/');
    const currentLocale = segments[1];
    if (
      currentLocale &&
      (routing.locales as readonly string[]).includes(currentLocale)
    ) {
      const target = pickRedirectLocale(user);
      if (target !== currentLocale) {
        // Reuse the rest of the URL — only swap the locale
        // segment. This preserves any query string / hash
        // and any deep link the user was on.
        segments[1] = target;
        router.push(segments.join('/') || '/');
      }
    }
  }, [user, pathname, router]);

  const login = async (email: string, password: string) => {
    const { userId } = await api.auth.login(email, password);
    // Read the fresh user/onboarding from the return value —
    // the closure-local `user`/`onboarding` are the previous
    // render's snapshots and would race the `setUser` call
    // we just made inside `fetchUserAndOnboarding`.
    const result = await fetchUserAndOnboarding(userId);
    if (!result) return;
    const { userData, onboardingState } = result;
    // Route by the user's persisted `preferredLanguage` (set
    // at register time) — NOT the locale segment of whatever
    // page they happened to hit the login button on. Without
    // this, a user who registered under `/zh` but is currently
    // looking at `/en/auth/login` would get bounced back to
    // `/en/dashboard` and have to manually flip the language
    // switcher every time. `pickRedirectLocale` whitelists
    // against `routing.locales` so a stale or unsupported DB
    // value can't 404 the redirect.
    const locale = pickRedirectLocale(userData);
    if (onboardingState.hasTeam && onboardingState.team) {
      const teamId = onboardingState.team.id;
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
