"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { clsx } from "clsx";

interface LeagueHeaderProps {
  leagueName: string;
  season: number;
  /** Current matchweek (1-based). */
  matchweek: number;
  /** Total matchweeks in the season. */
  totalMatchweeks: number;
  /** Optional: name of the team being viewed (when not on your own team). */
  viewingTeamName?: string;
  /** Locale for menu hrefs. */
  locale: string;
  /** League id — used to build the /history href. */
  leagueId: string;
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
  locale,
  leagueId,
}: LeagueHeaderProps) {
  const t = useTranslations();

  const progressPct = Math.min(100, Math.round((matchweek / Math.max(1, totalMatchweeks)) * 100));

  return (
    <header className="relative overflow-hidden glass-panel rounded-2xl p-6">
      {/* Top-right "More" overflow menu — sits over the header without disturbing
          the existing two-column identity layout. */}
      <div className="absolute top-3 right-3 z-20">
        <MoreMenu locale={locale} leagueId={leagueId} />
      </div>

      <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between pr-12">
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

/**
 * "More" overflow menu — three-dot button in the top-right that opens
 * a glass dropdown. Currently exposes a single "History" item.
 */
function MoreMenu({ locale, leagueId }: { locale: string; leagueId: string }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('league.hero.more')}
        className={clsx(
          'inline-flex items-center gap-1.5 h-8 px-3 rounded-full',
          'glass-panel border border-white/10',
          'font-label text-[10px] font-black uppercase tracking-[0.2em]',
          'text-on-surface-variant hover:text-on-surface hover:border-white/20',
          'transition-colors',
        )}
        data-testid="league-more-menu-trigger"
      >
        <span className="material-symbols-outlined text-base">more_horiz</span>
        <span className="hidden sm:inline">{t('league.hero.more')}</span>
      </button>

      {open && (
        <div
          role="menu"
          className={clsx(
            'absolute right-0 top-full mt-2 min-w-[180px] z-30',
            'glass-panel rounded-xl border border-white/10 shadow-2xl',
            'py-1 overflow-hidden',
          )}
          data-testid="league-more-menu"
        >
          <Link
            href={`/${locale}/league/${leagueId}/history`}
            role="menuitem"
            onClick={() => setOpen(false)}
            className={clsx(
              'flex items-center gap-2.5 px-3 py-2.5',
              'font-headline text-xs font-bold uppercase tracking-wider',
              'text-on-surface hover:bg-white/5 transition-colors',
            )}
          >
            <span className="material-symbols-outlined text-base text-primary">history</span>
            <span>{t('league.hero.menu.history')}</span>
          </Link>
        </div>
      )}
    </div>
  );
}
