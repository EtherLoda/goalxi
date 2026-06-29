"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { api, type Match } from "@/lib/api";
import Link from "next/link";
import { clsx } from "clsx";
import { FormChipStrip, type FormResult } from "@/components/match/FormChipStrip";

interface MatchWithResult extends Match {
  result?: "W" | "D" | "L" | null;
  isUserHome?: boolean;
}

export default function ArchivedMatchesPage() {
  const { team } = useAuth();
  const params = useParams();
  const locale = (params.locale as string) || "en";
  const t = useTranslations('matches.archivePage');
  const tSections = useTranslations('matches.sections');
  const tVerdict = useTranslations('matches.verdict');
  const tCommon = useTranslations('common');

  const [currentSeason, setCurrentSeason] = useState<number>(1);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [seasons, setSeasons] = useState<number[]>([1]);
  const [matches, setMatches] = useState<MatchWithResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    api.game
      .getCurrent()
      .then((current) => {
        setCurrentSeason(current.season);
        setSelectedSeason(current.season);
        const seasonOptions = Array.from(
          { length: current.season },
          (_, i) => current.season - i,
        );
        setSeasons(seasonOptions);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!team?.id || !selectedSeason) return;

    const fetchMatches = async () => {
      setIsLoading(true);
      try {
        const completedData = await api.matches.getByTeam(team.id, {
          status: "completed",
          season: selectedSeason,
        });

        const processedMatches = (completedData?.data || [])
          .sort(
            (a: Match, b: Match) =>
              new Date(b.scheduledAt).getTime() -
              new Date(a.scheduledAt).getTime(),
          )
          .map((match: Match) => {
            const isHome = match.homeTeamId === team.id;
            const userScore = isHome ? match.homeScore : match.awayScore;
            const opponentScore = isHome ? match.awayScore : match.homeScore;

            let result: "W" | "D" | "L" | null = null;
            if (userScore !== null && opponentScore !== null) {
              if (userScore > opponentScore) result = "W";
              else if (userScore < opponentScore) result = "L";
              else result = "D";
            }

            return { ...match, result, isUserHome: isHome };
          });

        setMatches(processedMatches);
      } catch (error) {
        console.error("Failed to fetch matches:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMatches();
  }, [team?.id, selectedSeason]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const isHomeMatch = (match: MatchWithResult) =>
    match.homeTeamId === team?.id;

  const stats = {
    total: matches.length,
    wins: matches.filter((m) => m.result === "W").length,
    draws: matches.filter((m) => m.result === "D").length,
    losses: matches.filter((m) => m.result === "L").length,
  };

  // Recent form chips for the hero (oldest → newest)
  const formResults: FormResult[] = matches
    .slice()
    .reverse()
    .map((m) => m.result ?? 'pending');

  const points = stats.wins * 3 + stats.draws;
  const isCurrentSeason = selectedSeason === currentSeason;

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-6xl mx-auto w-full">
      {/* Page Header */}
      <header className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Link
            href={`/${locale}/matches`}
            className="group inline-flex items-center justify-center w-10 h-10 rounded-full glass-panel hover:border-white/20 transition-all"
            aria-label="Back to Matches"
          >
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant group-hover:text-primary transition-colors">
              arrow_back
            </span>
          </Link>
          <div>
            <span className="font-label text-[10px] font-black uppercase tracking-[0.3em] text-primary">
              {t('kicker')}
            </span>
            <h1 className="font-headline text-4xl md:text-5xl font-black tracking-tighter text-on-surface uppercase italic mt-1">
              {t('title')}
            </h1>
          </div>
        </div>

        {/* Season segmented control */}
        {seasons.length > 1 && (
          <div className="glass-panel rounded-full p-1 inline-flex items-center gap-1 self-start">
            {seasons.map((season) => {
              const active = selectedSeason === season;
              return (
                <button
                  key={season}
                  onClick={() => setSelectedSeason(season)}
                  className={clsx(
                    'inline-flex items-center gap-1.5 h-8 px-4 rounded-full',
                    'font-headline text-[11px] font-black uppercase tracking-[0.2em]',
                    'transition-all',
                    active
                      ? 'bg-primary text-on-primary shadow-[0_0_14px_rgba(0,228,121,0.45)]'
                      : 'text-on-surface-variant hover:text-on-surface',
                  )}
                >
                  <span className="material-symbols-outlined text-[14px]">
                    {active ? 'check_circle' : 'history'}
                  </span>
                  {t('season', { season })}
                </button>
              );
            })}
          </div>
        )}
      </header>

      {/* Season Hero — large season number + KPI strip */}
      <section className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Season title card */}
        <div className="glass-panel rounded-2xl p-6 lg:col-span-2 flex flex-col justify-between relative overflow-hidden">
          <div
            className="absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-20 blur-3xl pointer-events-none"
            style={{ background: team?.jerseyColorPrimary || '#00E479' }}
            aria-hidden
          />
          <div className="relative z-10">
            <p className="font-label text-[10px] uppercase tracking-[0.3em] text-primary font-black">
              {isCurrentSeason ? t('currentSeason') : t('pastSeason')}
            </p>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="font-headline text-7xl md:text-8xl font-black tracking-tighter text-on-surface">
                S{selectedSeason}
              </span>
            </div>
            <p className="font-body text-sm text-on-surface-variant mt-2">
              {tCommon('match', { count: stats.total })} ·
              {' '}
              <span className="text-primary font-bold">{points}</span> {t('pointsShort')}
            </p>
          </div>
          {/* Form chip strip */}
          {formResults.length > 0 && (
            <div className="relative z-10 mt-4 pt-4 border-t border-white/5">
              <p className="font-label text-[9px] uppercase tracking-[0.25em] text-primary font-black mb-2">
                {t('seasonForm')}
              </p>
              <FormChipStrip results={formResults} />
            </div>
          )}
        </div>

        {/* KPI cards — Wins / Draws / Losses / Total */}
        <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label={t('played')} value={stats.total} accent="default" />
          <KpiCard label={t('wins')} value={stats.wins} accent="primary" />
          <KpiCard label={t('draws')} value={stats.draws} accent="muted" />
          <KpiCard label={t('losses')} value={stats.losses} accent="error" />
        </div>
      </section>

      {/* Matches List */}
      <section>
        <h2 className="font-headline text-xs font-black uppercase tracking-[0.25em] text-primary flex items-center gap-2 px-1 mb-3">
          <span className="material-symbols-outlined text-base">history</span>
          {tSections('matchLog')}
          {!isLoading && (
            <span className="ml-auto text-on-surface-variant/60 font-label text-[10px]">
              {t('entries', { count: stats.total })}
            </span>
          )}
        </h2>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-[72px] glass-panel rounded-2xl animate-pulse"
              />
            ))}
          </div>
        ) : matches.length === 0 ? (
          <div className="glass-panel rounded-2xl p-12 text-center">
            <span className="material-symbols-outlined text-6xl text-on-surface-variant/30 mb-4 block">
              event_busy
            </span>
            <p className="text-on-surface-variant text-lg font-medium mb-2">
              {t('noMatchFound')}
            </p>
            <p className="text-on-surface-variant/60 text-sm">
              {isCurrentSeason
                ? t('currentEmpty')
                : t('pastEmpty', { season: selectedSeason })}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {matches.map((match) => {
              const userScore = match.isUserHome
                ? match.homeScore
                : match.awayScore;
              const opponentScore = match.isUserHome
                ? match.awayScore
                : match.homeScore;
              return (
                <Link
                  key={match.id}
                  href={`/${locale}/matches/${match.id}`}
                  className="group flex items-center gap-3 p-3 glass-panel rounded-2xl hover:border-white/15 hover:shadow-[0_0_20px_rgba(0,228,121,0.12)] transition-all"
                >
                  {/* Result indicator — glowing chip */}
                  <div
                    className={clsx(
                      'w-11 h-11 rounded-xl flex items-center justify-center font-headline font-black text-sm border shrink-0',
                      match.result === 'W' &&
                        'bg-primary text-on-primary border-primary shadow-[0_0_14px_rgba(0,228,121,0.45)]',
                      match.result === 'D' &&
                        'bg-white/5 text-on-surface-variant border-white/10',
                      match.result === 'L' &&
                        'bg-error/10 text-error border-error/30',
                      !match.result &&
                        'bg-white/5 text-on-surface-variant border-white/10',
                    )}
                  >
                    {match.result ?? '—'}
                  </div>

                  {/* Middle: date + teams + meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-0.5">
                      <span className="material-symbols-outlined text-[12px]">stadium</span>
                      <span>{formatDate(match.scheduledAt)}</span>
                      <span className="text-on-surface-variant/40">•</span>
                      <span
                        className={clsx(
                          'font-black',
                          isHomeMatch(match)
                            ? 'text-primary'
                            : 'text-on-surface-variant',
                        )}
                      >
                        {isHomeMatch(match) ? 'H' : 'A'}
                      </span>
                      {match.round && (
                        <>
                          <span className="text-on-surface-variant/40">•</span>
                          <span>{tCommon('round', { round: match.round })}</span>
                        </>
                      )}
                    </div>
                    <div className="font-headline text-sm font-bold text-on-surface truncate">
                      {match.homeTeam?.name} - {match.awayTeam?.name}
                    </div>
                  </div>

                  {/* Right: score + verdict */}
                  <div className="text-right shrink-0 flex items-center gap-3">
                    <div>
                      <p
                        className={clsx(
                          'font-headline text-lg font-black',
                          match.result === 'W' && 'text-primary',
                          match.result === 'L' && 'text-error',
                          match.result === 'D' && 'text-on-surface',
                          !match.result && 'text-on-surface-variant',
                        )}
                      >
                        {userScore ?? '-'} - {opponentScore ?? '-'}
                      </p>
                      <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant/60">
                        {match.result === 'W'
                          ? tVerdict('victory')
                          : match.result === 'L'
                            ? tVerdict('defeat')
                            : match.result === 'D'
                              ? tVerdict('draw')
                              : '—'}
                      </p>
                    </div>
                    <span className="material-symbols-outlined text-on-surface-variant/40 text-base group-hover:text-primary group-hover:translate-x-0.5 transition-all">
                      chevron_right
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

interface KpiCardProps {
  label: string;
  value: number;
  accent: 'primary' | 'error' | 'muted' | 'default';
}

function KpiCard({ label, value, accent }: KpiCardProps) {
  return (
    <div className="glass-panel rounded-2xl p-4 text-center flex flex-col justify-center">
      <p
        className={clsx(
          'font-label text-[9px] uppercase tracking-[0.25em] font-black mb-1',
          accent === 'primary' && 'text-primary',
          accent === 'error' && 'text-error',
          accent === 'muted' && 'text-on-surface-variant',
          accent === 'default' && 'text-primary',
        )}
      >
        {label}
      </p>
      <p
        className={clsx(
          'font-headline text-3xl md:text-4xl font-black',
          accent === 'primary' && 'text-primary',
          accent === 'error' && 'text-error',
          accent === 'muted' && 'text-on-surface',
          accent === 'default' && 'text-on-surface',
        )}
      >
        {value}
      </p>
    </div>
  );
}