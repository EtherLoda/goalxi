'use client';

import { clsx } from 'clsx';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { Match, Team } from '@/lib/api';
import { TacticsEntryButton } from '@/components/tactics/shared/TacticsEntryButton';

interface FixtureTicketProps {
  match: Match;
  isHome: boolean;
  currentTeam: Team | null | undefined;
  leagueName: string;
  locale: string;
  /** Live `now` so the embedded TacticsEntryButton can re-render its lock countdown. */
  now: number;
}

const formatDay = (date: Date) =>
  date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();

const formatMonth = (date: Date) =>
  date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();

/**
 * Stadium "departure board" style upcoming fixture row.
 * Uses the team's primary jersey color as a vertical stripe + neon-glow date block.
 */
export function FixtureTicket({
  match,
  isHome,
  currentTeam,
  leagueName,
  locale,
  now,
}: FixtureTicketProps) {
  const t = useTranslations('matches.ticket');
  const tCommon = useTranslations('common');
  const date = new Date(match.scheduledAt);
  const opponentName = isHome ? match.awayTeam?.name : match.homeTeam?.name;
  const teamColor = currentTeam?.jerseyColorPrimary || '#00E479';

  return (
    <div
      className={clsx(
        'group relative flex items-stretch gap-0 rounded-2xl overflow-hidden',
        'bg-surface-container-low/70 backdrop-blur-xl',
        'border border-white/5 hover:border-white/15',
        'shadow-card hover:shadow-[0_8px_24px_rgba(0,0,0,0.45)]',
        'transition-all duration-200',
      )}
    >
      {/* Jersey-color vertical stripe (uses team primary) */}
      <div
        className="w-1.5 shrink-0"
        style={{
          background: `linear-gradient(180deg, ${teamColor}, ${teamColor}55)`,
          boxShadow: `0 0 18px ${teamColor}55`,
        }}
        aria-hidden
      />

      {/* Date block — neon glow on the day number */}
      <div className="flex flex-col items-center justify-center px-4 py-3 border-r border-white/5 shrink-0 w-20">
        <span className="font-label text-[9px] font-black uppercase tracking-widest text-on-surface-variant">
          {formatMonth(date)}
        </span>
        <span
          className="font-headline text-2xl font-black text-on-surface leading-none mt-0.5"
          style={{ textShadow: `0 0 12px ${teamColor}66` }}
        >
          {date.getDate()}
        </span>
        <span className="font-label text-[9px] font-bold uppercase tracking-widest text-on-surface-variant/70 mt-0.5">
          {formatDay(date)}
        </span>
      </div>

      {/* Middle: venue + opponent + meta */}
      <Link
        href={`/${locale}/matches/${match.id}`}
        className="flex-1 min-w-0 px-4 py-3 flex flex-col justify-center gap-1 hover:bg-white/2 transition-colors"
      >
        <div className="flex items-center gap-2 text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
          <span
            className="px-1.5 py-0.5 rounded font-black"
            style={{ backgroundColor: `${teamColor}1a`, color: teamColor }}
          >
            {isHome ? t('home') : t('away')}
          </span>
          <span className="text-on-surface-variant/60">
            {date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </span>
          {match.round ? (
            <>
              <span className="text-on-surface-variant/40">•</span>
              <span>{tCommon('round', { round: match.round })}</span>
            </>
          ) : null}
          <span className="text-on-surface-variant/40">•</span>
          <span className="truncate">{leagueName || t('match')}</span>
        </div>
        <div className="font-headline text-base font-bold text-on-surface truncate">
          <span className="text-on-surface-variant/60 font-medium">
            {isHome ? tCommon('vs') : tCommon('at')}
          </span>{' '}
          {opponentName || tCommon('tbd')}
        </div>
      </Link>

      {/* Right: tactics + arrow */}
      <div className="flex items-center gap-2 px-3 shrink-0">
        <TacticsEntryButton
          matchId={match.id}
          matchStatus={match.status}
          scheduledAt={match.scheduledAt}
          variant="icon"
          locale={locale}
          now={now}
        />
        <Link
          href={`/${locale}/matches/${match.id}`}
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-on-surface-variant hover:text-primary hover:bg-white/5 transition-colors"
          aria-label="View match"
        >
          <span className="material-symbols-outlined text-xl">chevron_right</span>
        </Link>
      </div>
    </div>
  );
}
