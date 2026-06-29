'use client';

import { clsx } from 'clsx';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { Match, Team } from '@/lib/api';
import { TacticsEntryButton } from '@/components/tactics/shared/TacticsEntryButton';

interface MatchdayHeroProps {
  /** Latest completed match (left side of the original two-up layout). */
  latestCompleted?: Match | null;
  /** Live match takes priority; otherwise the next upcoming fixture. */
  featuredRight?: Match | null;
  currentTeam: Team | null | undefined;
  leagueName: string;
  locale: string;
  /** Live `now` forwarded to TacticsEntryButton's lock countdown. */
  now: number;
  /** Optional current minute when the hero is showing a live match. */
  currentMinute?: number;
}

/**
 * Single-slot Matchday hero card.
 *
 * Picks the most important match (live > next upcoming > latest completed)
 * and renders a stadium-pitch background with a floating glass scoreboard.
 * Mirrors the visual language of TacticalMatchDetail so the match list
 * feels like a control center instead of a flat list.
 */
export function MatchdayHero({
  latestCompleted,
  featuredRight,
  currentTeam,
  leagueName,
  locale,
  now,
  currentMinute,
}: MatchdayHeroProps) {
  const t = useTranslations('matches.hero');
  const tCommon = useTranslations('common');
  const pick: Match | null | undefined = featuredRight ?? latestCompleted;
  if (!pick) {
    return null;
  }

  const isLive = pick.status === 'in_progress';
  const isHome = pick.homeTeamId === currentTeam?.id;
  const teamColor = currentTeam?.jerseyColorPrimary || '#00E479';

  const homeName = pick.homeTeam?.name || 'Home';
  const awayName = pick.awayTeam?.name || 'Away';
  const homeInitials = homeName.split(' ').map((w) => w[0]).join('').slice(0, 3).toUpperCase();
  const awayInitials = awayName.split(' ').map((w) => w[0]).join('').slice(0, 3).toUpperCase();

  const date = new Date(pick.scheduledAt);
  const dateLabel = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const timeLabel = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const detailHref = isLive
    ? `/${locale}/matches/live/${pick.id}`
    : `/${locale}/matches/${pick.id}`;

  return (
    <section
      className={clsx(
        'relative w-full overflow-hidden rounded-3xl',
        'bg-[#051a14] border border-white/5',
        'shadow-[0_12px_32px_rgba(0,0,0,0.4)]',
      )}
    >
      {/* Subtle pitch markings (center circle + penalty area borders) */}
      <div className="absolute inset-0 pointer-events-none opacity-70">
        {/* Center line */}
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-primary/10" />
        {/* Center circle */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 border border-primary/10 rounded-full" />
        {/* Center dot */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-primary/30 rounded-full" />
        {/* Penalty area — left */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 h-[55%] w-[14%] border border-primary/10 border-l-0" />
        {/* Penalty area — right */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2 h-[55%] w-[14%] border border-primary/10 border-r-0" />
      </div>

      {/* Corner gradient glow in the team's jersey color */}
      <div
        className="absolute -top-24 -left-24 w-72 h-72 rounded-full opacity-25 blur-3xl pointer-events-none"
        style={{ background: teamColor }}
        aria-hidden
      />
      <div
        className="absolute -bottom-24 -right-24 w-72 h-72 rounded-full opacity-20 blur-3xl pointer-events-none"
        style={{ background: teamColor }}
        aria-hidden
      />

      {/* Kicker row */}
      <div className="relative z-10 flex items-center justify-between px-6 md:px-10 pt-6">
        <div className="inline-flex items-center gap-2">
          {isLive ? (
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/30">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="font-label text-[10px] font-black uppercase tracking-[0.25em] text-primary">
                {t('liveLabel')} · {currentMinute ?? pick.round ?? '?'}&apos;
              </span>
            </span>
          ) : featuredRight && pick === featuredRight && !latestCompleted ? (
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-tertiary/10 border border-tertiary/30">
              <span className="material-symbols-outlined text-[14px] text-tertiary">event</span>
              <span className="font-label text-[10px] font-black uppercase tracking-[0.25em] text-tertiary">
                {t('nextMatch')} · {dateLabel}
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10">
              <span className="material-symbols-outlined text-[14px] text-on-surface-variant">history</span>
              <span className="font-label text-[10px] font-black uppercase tracking-[0.25em] text-on-surface-variant">
                {t('latest')}
              </span>
            </span>
          )}
          <span className="hidden sm:inline-block font-label text-[10px] font-black uppercase tracking-[0.25em] text-on-surface-variant/60">
            {pick.round ? tCommon('round', { round: pick.round }) : ''} {pick.round ? '·' : ''} {leagueName}
          </span>
        </div>
        <Link
          href={detailHref}
          className="font-label text-[10px] font-black uppercase tracking-[0.25em] text-primary hover:text-primary-fixed transition-colors flex items-center gap-1"
        >
          {isLive ? t('enterLive') : t('viewReport')}
          <span className="material-symbols-outlined text-base">arrow_forward</span>
        </Link>
      </div>

      {/* Floating glass-panel with team + score */}
      <div className="relative z-10 px-6 md:px-10 py-8 md:py-10">
        <div className="glass-panel rounded-2xl px-6 md:px-10 py-6 md:py-8 relative overflow-hidden">
          {/* Inner gradient sheen */}
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-secondary/5 pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6 md:gap-8">
            {/* Home team */}
            <div className="flex-1 flex flex-col items-center md:items-end gap-2 text-center md:text-right min-w-0">
              <span className="font-label text-[9px] font-black uppercase tracking-[0.25em] text-primary/80">
                {tCommon('home')}
              </span>
              <div className="font-headline text-2xl md:text-3xl lg:text-4xl font-black text-on-surface tracking-tight truncate w-full">
                {homeName}
              </div>
              <div
                className="w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center border-2 mt-1"
                style={{
                  backgroundColor: `${teamColor}22`,
                  borderColor: teamColor,
                  boxShadow: `0 0 18px ${teamColor}55`,
                }}
              >
                <span
                  className="font-headline font-black text-sm md:text-base"
                  style={{ color: teamColor }}
                >
                  {homeInitials}
                </span>
              </div>
            </div>

            {/* Score / VS */}
            <div className="flex flex-col items-center gap-2 min-w-[180px]">
              {isLive || pick.status === 'completed' ? (
                <div className="flex items-center gap-5">
                  <span
                    className="font-headline text-5xl md:text-6xl font-black text-on-surface tracking-tighter"
                    style={{ textShadow: '0 0 24px rgba(255,255,255,0.18)' }}
                  >
                    {pick.homeScore ?? 0}
                  </span>
                  <span className="font-headline text-2xl text-on-surface-variant/30 font-black">
                    —
                  </span>
                  <span
                    className="font-headline text-5xl md:text-6xl font-black text-on-surface tracking-tighter"
                    style={{ textShadow: '0 0 24px rgba(255,255,255,0.18)' }}
                  >
                    {pick.awayScore ?? 0}
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <span className="font-label text-[9px] font-black uppercase tracking-[0.25em] text-on-surface-variant">
                    {timeLabel} · {isHome ? 'Home' : 'Away'}
                  </span>
                  <span
                    className="font-headline text-4xl md:text-5xl font-black text-on-surface-variant/40 tracking-tighter"
                    style={{ textShadow: '0 0 14px rgba(255,255,255,0.08)' }}
                  >
                    VS
                  </span>
                </div>
              )}
              <span className="font-label text-[9px] font-black uppercase tracking-[0.25em] text-on-surface-variant/60">
                {isLive ? t('inProgress') : pick.status === 'completed' ? t('fullTime') : t('kickOff')}
              </span>
            </div>

            {/* Away team */}
            <div className="flex-1 flex flex-col items-center md:items-start gap-2 text-center md:text-left min-w-0">
              <span className="font-label text-[9px] font-black uppercase tracking-[0.25em] text-secondary/80">
                {tCommon('away')}
              </span>
              <div className="font-headline text-2xl md:text-3xl lg:text-4xl font-black text-on-surface tracking-tight truncate w-full">
                {awayName}
              </div>
              <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-error/10 border-2 border-error/30 flex items-center justify-center mt-1 shadow-[0_0_18px_rgba(255,180,171,0.25)]">
                <span className="font-headline font-black text-sm md:text-base text-error">
                  {awayInitials}
                </span>
              </div>
            </div>
          </div>

          {/* Footer: venue / live link / tactics entry */}
          <div className="relative z-10 mt-6 pt-4 border-t border-white/5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-on-surface-variant">
              <span className="material-symbols-outlined text-[14px]">stadium</span>
              <span>{pick.venue || t('venueTbd')}</span>
            </div>
            <div className="flex items-center gap-2">
              {isLive ? (
                <Link
                  href={detailHref}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-DEFAULT text-sm font-bold uppercase tracking-wider hover:bg-primary-fixed transition-colors"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-on-primary animate-pulse" />
                  Enter Live
                </Link>
              ) : (
                <TacticsEntryButton
                  matchId={pick.id}
                  matchStatus={pick.status}
                  scheduledAt={pick.scheduledAt}
                  variant="full"
                  locale={locale}
                  now={now}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}