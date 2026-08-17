"use client";

import { useEffect, useState, Suspense, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { clsx } from "clsx";
import { api, type League, type Standing } from "@/lib/api";
import StandingsTable from "@/components/league/StandingsTable";

function LeagueHistoryPage() {
  return (
    <Suspense fallback={<LeagueHistoryLoading />}>
      <LeagueHistoryContent />
    </Suspense>
  );
}

function LeagueHistoryContent() {
  const t = useTranslations();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const leagueId = params.id as string;
  const locale = (params.locale as string) || "en";

  const [league, setLeague] = useState<League | null>(null);
  const [pastSeasons, setPastSeasons] = useState<{ season: number }[] | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [standings, setStandings] = useState<Standing[] | null>(null);
  const [isLoadingSeasons, setIsLoadingSeasons] = useState(true);
  const [isLoadingStandings, setIsLoadingStandings] = useState(false);

  // ---- Load league info + list of past seasons on mount ----
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [leagueData, seasons] = await Promise.all([
          api.leagues.getById(leagueId).catch(() => null),
          api.leagues.getPastSeasons(leagueId).catch(() => []),
        ]);
        if (cancelled) return;
        setLeague(leagueData);
        setPastSeasons(seasons);
        // Default to ?season=… in URL, otherwise the most recent past season.
        const fromUrl = Number(searchParams.get('season'));
        const initial =
          Number.isFinite(fromUrl) && seasons.some((s) => s.season === fromUrl)
            ? fromUrl
            : seasons[0]?.season ?? null;
        setSelectedSeason(initial);
      } finally {
        if (!cancelled) setIsLoadingSeasons(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // searchParams is intentionally omitted from deps — we only want to read it on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId]);

  // ---- Load standings whenever the selected season changes ----
  useEffect(() => {
    if (selectedSeason == null) {
      setStandings(null);
      return;
    }
    let cancelled = false;
    setIsLoadingStandings(true);
    api.leagues
      .getStandings(leagueId, { season: selectedSeason })
      .then((rows) => {
        if (cancelled) return;
        setStandings(rows);
      })
      .catch(() => {
        if (cancelled) return;
        setStandings([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingStandings(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leagueId, selectedSeason]);

  const handleBack = useCallback(() => {
    router.push(`/${locale}/league/${leagueId}`);
  }, [router, locale, leagueId]);

  const handleSeasonChange = useCallback(
    (season: number) => {
      setSelectedSeason(season);
      // Reflect the filter in the URL so it's shareable / back-button friendly.
      const next = new URLSearchParams(searchParams.toString());
      next.set('season', String(season));
      router.replace(`/${locale}/league/${leagueId}/history?${next.toString()}`);
    },
    [router, locale, leagueId, searchParams],
  );

  if (isLoadingSeasons) {
    return <LeagueHistoryLoading />;
  }

  const hasSeasons = Boolean(pastSeasons && pastSeasons.length > 0);

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
      {/* Header strip */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <button
          type="button"
          onClick={handleBack}
          className={clsx(
            'inline-flex items-center gap-1.5 h-8 px-3 rounded-full',
            'glass-panel border border-white/10',
            'font-label text-[10px] font-black uppercase tracking-[0.2em]',
            'text-on-surface-variant hover:text-on-surface hover:border-white/20',
            'transition-colors',
          )}
          aria-label="Back"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          <span>{t('common.back')}</span>
        </button>

        <div className="text-right">
          <span className="block font-label text-[10px] font-black uppercase tracking-[0.3em] text-primary">
            {league?.name || t('league.hero.kicker')}
          </span>
          <h1 className="font-headline text-3xl md:text-4xl font-black tracking-tighter text-on-surface uppercase italic leading-none mt-1">
            {t('league.history.title')}
          </h1>
          <p className="font-body text-sm text-on-surface-variant mt-2">
            {t('league.history.subtitle')}
          </p>
        </div>
      </div>

      {/* Season filter */}
      {hasSeasons && (
        <SeasonFilter
          seasons={pastSeasons!}
          selected={selectedSeason}
          onChange={handleSeasonChange}
        />
      )}

      {/* Standings body */}
      {!hasSeasons ? (
        <EmptyState
          icon="history"
          title={t('league.history.title')}
          message={t('league.history.empty')}
        />
      ) : isLoadingStandings ? (
        <div className="glass-panel rounded-2xl p-12 flex items-center justify-center">
          <span className="material-symbols-outlined text-4xl text-primary animate-spin">
            progress_activity
          </span>
        </div>
      ) : standings && standings.length > 0 ? (
        <StandingsTable
          standings={standings}
          userTeamId={undefined}
          locale={locale}
        />
      ) : selectedSeason != null ? (
        <EmptyState
          icon="leaderboard"
          title={t('league.history.title')}
          message={t('league.history.emptySeason', {
            season: selectedSeason,
            defaultValue: `No standings recorded for season ${selectedSeason}.`,
          })}
        />
      ) : null}
    </div>
  );
}

interface SeasonFilterProps {
  seasons: { season: number }[];
  selected: number | null;
  onChange: (season: number) => void;
}

function SeasonFilter({ seasons, selected, onChange }: SeasonFilterProps) {
  const t = useTranslations();
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="inline-flex items-center gap-1.5 font-label text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/70">
        <span className="material-symbols-outlined text-base">filter_list</span>
        {t('league.history.filterSeason', { defaultValue: 'Season' })}
      </span>
      <div className="inline-flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 -mx-1 px-1">
        {seasons.map(({ season }) => {
          const active = season === selected;
          return (
            <button
              key={season}
              type="button"
              onClick={() => onChange(season)}
              aria-pressed={active}
              className={clsx(
                'shrink-0 inline-flex items-center justify-center h-8 px-4 rounded-full',
                'font-headline text-[11px] font-black uppercase tracking-[0.18em]',
                'border transition-all',
                active
                  ? 'bg-primary text-on-primary border-primary shadow-[0_0_14px_rgba(0,228,121,0.4)]'
                  : 'glass-panel text-on-surface-variant border-white/10 hover:text-on-surface hover:border-white/20',
              )}
            >
              S{season}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface EmptyStateProps {
  icon: string;
  title: string;
  message: string;
}

function EmptyState({ icon, title, message }: EmptyStateProps) {
  return (
    <div className="glass-panel rounded-2xl">
      <div className="flex items-center justify-center py-20 px-6">
        <div className="text-center max-w-sm">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
            <span className="material-symbols-outlined text-4xl text-primary">
              {icon}
            </span>
          </div>
          <p className="font-headline text-base font-black text-on-surface mb-1">
            {title}
          </p>
          <p className="font-body text-sm text-on-surface-variant">{message}</p>
        </div>
      </div>
    </div>
  );
}

function LeagueHistoryLoading() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <span className="material-symbols-outlined text-4xl text-primary animate-spin">
        progress_activity
      </span>
    </div>
  );
}

export default function LeagueHistoryPageWrapper() {
  return (
    <Suspense fallback={null}>
      <LeagueHistoryPage />
    </Suspense>
  );
}

