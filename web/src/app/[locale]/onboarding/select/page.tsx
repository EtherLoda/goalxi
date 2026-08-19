"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { api, type OnboardingState } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

/**
 * "We are waiting on the worker" loading screen. The actual
 * selection (which league, which team, what club name) is
 * made by the settlement worker, not the user — see
 * `OnboardingService.assignTeamToUser` / `OnboardingAssigner`
 * in the API. The user's job here is to sit tight until the
 * state flips to `active`.
 *
 * Fetch model: a single GET on mount (which is itself the
 * "user refreshed the page" path), plus a manual "Check
 * status" button. We deliberately do NOT poll — settlement
 * is fast in the common case (single-digit seconds), and a
 * 1Hz poll across every onboarding user wastes backend
 * cycles for no UX gain over a manual refresh.
 *
 * Club name now comes from the register form: the user types
 * a `teamName` at `/auth/register`, the API enqueues it with
 * the `assign-team` job, and the settlement worker stamps it
 * directly onto the new team row during claim. There is no
 * separate "name your club" step on this page anymore — once
 * `hasTeam` flips to true we route the user straight to
 * `/dashboard`. The previous `ONBOARDING_PENDING_NAME`
 * sentinel + `needsName` flag have been removed.
 *
 * On any 4xx/5xx (e.g. JWT expired, settlement dead),
 * surface a manual "Retry assignment" button that calls
 * `POST /onboarding/claim` to re-enqueue the job.
 */
export default function OnboardingSelectPage() {
  const router = useRouter();
  const params = useParams();
  const t = useTranslations();
  const { refreshOnboarding } = useAuth();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const locale = (params.locale as string) || 'en';

  const fetchState = useCallback(async () => {
    try {
      const data = await api.onboarding.getState();
      setState(data);
      setError(null);
      if (data.hasTeam && data.team) {
        // Worker finished — push the fresh state into
        // AuthContext BEFORE we route away. The pathname
        // guard in `AuthProvider` reads `onboarding.hasTeam`
        // from the boot-time snapshot (which is still
        // `false` for a freshly-registered user); without
        // this sync it would see the stale value and bounce
        // us straight back here in a flicker loop until the
        // user gives up and refreshes the tab.
        const synced = await refreshOnboarding();
        if (!synced) {
          // Transient failure — let the user retry rather
          // than push to a dashboard that hasn't been
          // hydrated with the team context yet.
          setError('Failed to sync team state. Please try again.');
          return;
        }
        // Team already has the user-supplied club name
        // (stamped by the assigner during claim), so there's
        // nothing left for this page to do.
        router.push(`/${locale}/dashboard?team=${data.team.id}`);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to check onboarding state',
      );
    }
  }, [router, locale, refreshOnboarding]);

  useEffect(() => {
    // Single fetch on mount. This is the "user refreshed the
    // page" path. We intentionally do not set up an interval
    // — the worker is idempotent and the user can hit the
    // "Check status" button (or refresh) to re-poll.
    fetchState();
  }, [fetchState]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await fetchState();
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchState]);

  const handleRetry = useCallback(async () => {
    setIsRetrying(true);
    setError(null);
    try {
      await api.onboarding.claim();
      // Re-poll right away rather than waiting for the next
      // tick — the worker should pick the job up within a
      // second or two.
      await fetchState();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to re-enqueue onboarding',
      );
    } finally {
      setIsRetrying(false);
    }
  }, [fetchState]);

  const status = state?.status ?? 'teamless';
  const statusLabel: Record<OnboardingState['status'], string> = {
    teamless: t('onboarding.status.teamless'),
    processing: t('onboarding.status.processing'),
    active: t('onboarding.status.active'),
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-surface">
      <div className="fixed inset-0 z-0">
        <img
          alt="Stadium"
          className="w-full h-full object-cover grayscale brightness-30"
          src="https://images.unsplash.com/photo-1489944440615-453fc2b6a9a9?w=1920&q=80"
        />
        <div className="absolute inset-0 bg-surface/80" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-10">
          <Link href={`/${locale}`} className="inline-block">
            <span className="font-headline font-black text-2xl tracking-tighter text-primary uppercase">
              GoalXi
            </span>
          </Link>
        </div>

        <div className="glass-panel rounded-2xl p-10 text-center">
          {/* Spinner — the worker is doing real work, we are
              not just showing a placeholder. Use the status
              label to set expectations. */}
          <div className="mb-6 flex justify-center">
            <div
              className="w-16 h-16 rounded-full border-4 border-white/10 border-t-primary animate-spin"
              aria-hidden
            />
          </div>

          <h1 className="font-headline text-2xl font-black text-on-surface mb-2">
            {t('onboarding.title')}
          </h1>
          <p className="font-body text-sm text-on-surface-variant mb-6">
            {t('onboarding.subtitle')}
          </p>

          <div
            className="inline-block px-4 py-1.5 rounded-full bg-surface-container-lowest border border-white/10 text-xs font-label uppercase tracking-widest text-on-surface-variant"
            data-testid="onboarding-status"
          >
            {statusLabel[status]}
          </div>

          {/* Manual refresh — fetch only when the user asks
              for it (or refreshes the page). The button
              reflects in-flight state. */}
          <div className="mt-6">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              data-testid="onboarding-refresh"
              className="px-5 py-2 bg-surface-container-lowest border border-white/10 text-on-surface font-label font-bold text-xs uppercase tracking-widest rounded-lg hover:bg-surface-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRefreshing
                ? t('onboarding.checking')
                : t('onboarding.checkStatus')}
            </button>
          </div>

          {error && (
            <div className="mt-6 p-3 bg-error/20 border border-error/30 rounded-xl text-error text-sm">
              {error}
              <button
                onClick={handleRetry}
                disabled={isRetrying}
                className="mt-3 w-full py-2.5 bg-primary text-on-primary font-headline font-bold text-xs uppercase tracking-widest rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRetrying
                  ? t('onboarding.retrying')
                  : t('onboarding.retry')}
              </button>
            </div>
          )}

          <p className="mt-6 font-body text-xs text-on-surface-variant/70">
            {t('onboarding.footnote')}
          </p>
        </div>
      </div>
    </div>
  );
}
