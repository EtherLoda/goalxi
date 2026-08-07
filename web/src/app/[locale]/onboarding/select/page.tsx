"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { api, type OnboardingState } from "@/lib/api";

/**
 * "We are waiting on the worker" loading screen. The actual
 * selection (which league, which team) is made by the
 * settlement worker, not the user — see
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
 * Once the worker finishes, we do NOT auto-redirect to
 * `/dashboard`. Instead we show a "name your club" form
 * (the BOT teams the assigner hands out all carry the
 * placeholder `Team 1` / `Team 2` from the bootstrap
 * generator, which is jarring on the dashboard). The form
 * has a single input, a Save button that PATCHes
 * `/teams/me`, and a Skip link. Either path lands on
 * `/dashboard`.
 *
 * On any 4xx/5xx (e.g. JWT expired, settlement dead),
 * surface a manual "Retry assignment" button that calls
 * `POST /onboarding/claim` to re-enqueue the job.
 *
 * This page does NOT browse the available BOT teams. The
 * algorithm picks them; the user has no say in which one.
 * (We can layer a "swap my team" flow on top later if user
 * testing shows it matters.)
 */
export default function OnboardingSelectPage() {
  const router = useRouter();
  const params = useParams();
  const t = useTranslations();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  // Name-your-club step state. Only mounted when the worker
  // has finished and the user has a team in hand.
  const [nameDraft, setNameDraft] = useState<string>('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const locale = (params.locale as string) || 'en';

  const fetchState = useCallback(async () => {
    try {
      const data = await api.onboarding.getState();
      setState(data);
      setError(null);
      if (data.hasTeam && data.team) {
        // Seed the name draft from the server-side value
        // (the `ONBOARDING_PENDING_NAME` sentinel the
        // assigner stamps on the very first claim).
        setNameDraft((prev) => (prev === '' ? data.team!.name : prev));
        // If the team is named (the user already filled the
        // form on a previous login, OR they skipped), this
        // page is the wrong destination — bounce them to
        // the dashboard immediately. Without this, the form
        // would re-appear on every login and the user would
        // have to skip it again to get to their team.
        if (!data.needsName) {
          router.push(`/${locale}/dashboard?team=${data.team.id}`);
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to check onboarding state',
      );
    }
  }, [router, locale]);

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

  const handleSaveName = useCallback(async () => {
    const trimmed = nameDraft.trim();
    if (trimmed.length < 2 || trimmed.length > 50) {
      setRenameError(
        // Server enforces 2–50 anyway; this is a client-side
        // affordance so the user doesn't have to round-trip
        // the network to find out.
        t('onboarding.nameStep.title').length > 0
          ? 'Name must be 2–50 characters'
          : 'Name must be 2–50 characters',
      );
      return;
    }
    setIsRenaming(true);
    setRenameError(null);
    try {
      await api.teams.updateMine({ name: trimmed });
      router.push(`/${locale}/dashboard?team=${state?.team?.id}`);
    } catch (err) {
      setRenameError(
        err instanceof Error ? err.message : 'Failed to save team name',
      );
    } finally {
      setIsRenaming(false);
    }
  }, [nameDraft, router, locale, state?.team?.id, t]);

  const handleSkipName = useCallback(() => {
    router.push(`/${locale}/dashboard?team=${state?.team?.id}`);
  }, [router, locale, state?.team?.id]);

  const status = state?.status ?? 'teamless';
  // The form renders only when the worker has finished AND the
  // team name still carries the `ONBOARDING_PENDING_NAME`
  // sentinel. Once the user picks a real name (or skips),
  // `state.needsName` flips to false and `fetchState` above
  // routes the user to `/dashboard` — so `shouldShowForm`
  // here is effectively a "still waiting for the first name"
  // gate, not a "user is on this page" gate.
  const shouldShowForm = !!state?.hasTeam && !!state?.team && !!state?.needsName;
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
          {shouldShowForm ? (
            // Worker finished AND the user has not named the
            // club yet (the team's name is still the
            // `ONBOARDING_PENDING_NAME` sentinel). Show the
            // form. The other branch — hasTeam + !needsName —
            // is caught earlier in `fetchState` and routes
            // the user straight to /dashboard, so this
            // component never actually mounts the form for
            // a returning manager who already named their
            // team.
            <NameYourClubStep
              teamName={state!.team!.name}
              nameDraft={nameDraft}
              onNameChange={setNameDraft}
              onSave={handleSaveName}
              onSkip={handleSkipName}
              isSaving={isRenaming}
              saveLabel={t('onboarding.nameStep.save')}
              savingLabel={t('onboarding.nameStep.saving')}
              skipLabel={t('onboarding.nameStep.skip')}
              placeholder={t('onboarding.nameStep.placeholder')}
              title={t('onboarding.nameStep.title')}
              subtitle={t('onboarding.nameStep.subtitle', {
                teamName: state!.team!.name,
              })}
              error={renameError}
            />
          ) : (
            <>
              {/* Spinner — the worker is doing real work, we
                  are not just showing a placeholder. Use the
                  status label to set expectations. */}
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

              {/* Manual refresh — fetch only when the user
                  asks for it (or refreshes the page). The
                  button reflects in-flight state. */}
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Name-your-club step ----------

interface NameYourClubStepProps {
  teamName: string;
  nameDraft: string;
  onNameChange: (v: string) => void;
  onSave: () => void;
  onSkip: () => void;
  isSaving: boolean;
  saveLabel: string;
  savingLabel: string;
  skipLabel: string;
  placeholder: string;
  title: string;
  subtitle: string;
  error: string | null;
}

/**
 * The form shown after the assigner has handed the user a
 * team. Pre-fills with whatever the worker assigned
 * (currently `Team 1` / `Team 2` — a placeholder from the
 * bootstrap generator) and lets the user either rename or
 * skip. Either path lands on `/dashboard`.
 *
 * This is the only piece that customises the team today;
 * the next pass (city, jersey colors, logo) will append
 * fields here without changing the route or the API
 * surface — the backend already accepts a partial
 * `UpdateTeamReqDto` via `PATCH /teams/me`.
 */
function NameYourClubStep({
  nameDraft,
  onNameChange,
  onSave,
  onSkip,
  isSaving,
  saveLabel,
  savingLabel,
  skipLabel,
  placeholder,
  title,
  subtitle,
  error,
}: NameYourClubStepProps) {
  return (
    <>
      <h1 className="font-headline text-2xl font-black text-on-surface mb-2">
        {title}
      </h1>
      <p className="font-body text-sm text-on-surface-variant mb-6">
        {subtitle}
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
        className="text-left"
      >
        <label
          htmlFor="onboarding-team-name"
          className="block text-xs font-label uppercase tracking-widest text-on-surface-variant mb-2"
        >
          {placeholder}
        </label>
        <input
          id="onboarding-team-name"
          data-testid="onboarding-team-name"
          type="text"
          value={nameDraft}
          onChange={(e) => onNameChange(e.target.value)}
          disabled={isSaving}
          maxLength={50}
          autoFocus
          className="w-full px-4 py-3 bg-surface-container-lowest border border-white/10 rounded-xl text-on-surface font-body text-base focus:outline-none focus:border-primary transition-colors disabled:opacity-50"
        />

        {error && (
          <div className="mt-3 p-3 bg-error/20 border border-error/30 rounded-xl text-error text-sm">
            {error}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3">
          <button
            type="submit"
            disabled={isSaving}
            data-testid="onboarding-team-save"
            className="w-full py-3 bg-primary text-on-primary font-headline font-bold text-sm uppercase tracking-widest rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? savingLabel : saveLabel}
          </button>
          <button
            type="button"
            onClick={onSkip}
            disabled={isSaving}
            data-testid="onboarding-team-skip"
            className="w-full py-2 text-on-surface-variant font-label font-bold text-xs uppercase tracking-widest rounded-lg hover:text-on-surface transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {skipLabel}
          </button>
        </div>
      </form>
    </>
  );
}
