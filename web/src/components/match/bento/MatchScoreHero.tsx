/**
 * MatchScoreHero.tsx — bento-grade score header for the match page.
 *
 * Replaces the two-row header (back button + title / score chip /
 * connected dot) plus the floating "LIVE • 67'" pill that the live
 * page used to render above the timeline. The bento puts both into
 * one tall strip so the reader sees the most important state
 * (who's winning, what minute, is the socket alive) in a single
 * glance.
 *
 * Visual contract:
 *   - Resting state: large 3-line score chip on the right, big team
 *     names, subtle connection dot on the left.
 *   - "FT" overlay when the match finishes — matches the existing
 *     `t('fullTimeTitle')` so live + report reuse the same copy.
 *   - Status dot color follows the existing convention: green when
 *     WS is connected, amber otherwise (no new tokens introduced).
 *
 * Relies on the existing `useTranslations('matches.live')` scope for
 * status copy. Other bento cells use their own translations; this
 * one reuses the live chrome keys so live and report stay in sync.
 */

'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { GlassPanel } from '@/components/tactics/shared/GlassPanel';

export interface MatchScoreHeroProps {
  locale: string;
  matchId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  currentMinute: number;
  isComplete: boolean;
  isConnected: boolean;
}

export function MatchScoreHero({
  locale,
  matchId,
  homeTeamName,
  awayTeamName,
  homeScore,
  awayScore,
  currentMinute,
  isComplete,
  isConnected,
}: MatchScoreHeroProps) {
  const t = useTranslations('matches.live');
  return (
    <GlassPanel size="md" className="flex items-center gap-5">
      {/* Back button — kept as a small chip, not a big square */}
      <Link
        href={`/${locale}/matches`}
        aria-label={t('backToMatches')}
        className="flex items-center justify-center w-10 h-10 rounded-xl bg-surface-container border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all"
        data-testid="match-back-link"
      >
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
      </Link>

      {/* Team strip — home on the left, away on the right, score in the
          middle. Each side is a flexed column so the team names + the
          secondary "Home"/"Away" label stay aligned with the big score. */}
      <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div className="min-w-0 text-right">
          <div
            className="font-headline font-black text-2xl md:text-3xl text-on-surface truncate"
            data-testid="match-home-name"
          >
            {homeTeamName}
          </div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant font-headline mt-0.5">
            {t('home')}
          </div>
        </div>

        <div className="flex items-baseline gap-2 px-4">
          <span
            className="font-headline font-black text-5xl md:text-6xl tabular-nums text-primary leading-none"
            data-testid="match-home-score"
          >
            {homeScore}
          </span>
          <span className="font-headline text-2xl md:text-3xl text-on-surface-variant">·</span>
          <span
            className="font-headline font-black text-5xl md:text-6xl tabular-nums text-secondary leading-none"
            data-testid="match-away-score"
          >
            {awayScore}
          </span>
        </div>

        <div className="min-w-0 text-left">
          <div
            className="font-headline font-black text-2xl md:text-3xl text-on-surface truncate"
            data-testid="match-away-name"
          >
            {awayTeamName}
          </div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant font-headline mt-0.5">
            {t('away')}
          </div>
        </div>
      </div>

      {/* Minute + connection chip — duplicate of the legacy
          "LIVE • 67'" pill so the new hero feels self-contained. */}
      <div
        className={`shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-full ${
          isComplete
            ? 'bg-surface-container border border-outline-variant/40 text-on-surface-variant'
            : isConnected
              ? 'bg-primary/10 text-primary border border-primary/20'
              : 'bg-amber-500/10 text-amber-500 border border-amber-500/30'
        }`}
        data-testid="match-minute-pill"
      >
        <span
          className={`w-2 h-2 rounded-full ${
            isComplete
              ? 'bg-on-surface-variant'
              : isConnected
                ? 'bg-primary animate-pulse'
                : 'bg-amber-500 animate-pulse'
          }`}
          aria-hidden="true"
        />
        <span className="font-mono font-black text-sm tabular-nums">
          {isComplete
            ? 'FT'
            : `${currentMinute}&apos;`}
        </span>
        {!isComplete && (
          <span className="text-[10px] font-bold uppercase tracking-widest font-headline">
            {isConnected ? t('liveTag') : t('connecting')}
          </span>
        )}
      </div>
    </GlassPanel>
  );
}
