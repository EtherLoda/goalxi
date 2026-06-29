"use client";

import { useTranslations } from "next-intl";

interface LeagueHeaderProps {
  leagueName: string;
  season: number;
  /** Current matchweek (1-based). */
  matchweek: number;
  /** Total matchweeks in the season. */
  totalMatchweeks: number;
  /** Optional: name of the team being viewed (when not on your own team). */
  viewingTeamName?: string;
}

/**
 * League hero header shown above the main league content.
 *
 * Renders the league name, season, and a matchweek progress bar.
 * The actual tab navigation lives in RightColumn — this header only
 * carries league-level identity + progress.
 */
export default function LeagueHeader({
  leagueName,
  season,
  matchweek,
  totalMatchweeks,
  viewingTeamName,
}: LeagueHeaderProps) {
  const t = useTranslations();

  const progressPct = Math.min(100, Math.round((matchweek / Math.max(1, totalMatchweeks)) * 100));

  return (
    <header className="relative overflow-hidden glass-panel rounded-2xl p-6">
      <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <span className="font-label text-[10px] font-black uppercase tracking-[0.3em] text-primary">
            {t('league.hero.kicker')}
          </span>
          <h1 className="font-headline text-4xl md:text-5xl font-black tracking-tighter text-on-surface uppercase italic leading-none">
            {leagueName}
          </h1>
          {viewingTeamName && (
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="font-label text-[10px] font-black uppercase tracking-[0.2em] text-primary">
                {t('league.hero.viewing', { team: viewingTeamName })}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col items-start md:items-end gap-2">
          <span className="font-label text-[10px] font-black uppercase tracking-[0.25em] text-on-surface-variant/70">
            {t('league.hero.round', { round: matchweek, total: totalMatchweeks })}
          </span>
          <span className="font-headline text-3xl font-black text-on-surface leading-none">
            S{season}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative z-10 mt-5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-label text-[9px] font-black uppercase tracking-[0.2em] text-on-surface-variant/70">
            {t('league.hero.completed', { completed: matchweek, total: totalMatchweeks })}
          </span>
          <span className="font-label text-[9px] font-black uppercase tracking-[0.2em] text-primary">
            {progressPct}%
          </span>
        </div>
        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary shadow-[0_0_10px_rgba(0,228,121,0.5)] transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
    </header>
  );
}
