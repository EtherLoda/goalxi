'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import type { PlayerMatchLogEntry } from '@/lib/api';

const RESULT_TONE: Record<PlayerMatchLogEntry['result'], string> = {
  win: 'text-primary',
  draw: 'text-on-surface-variant',
  loss: 'text-danger',
  pending: 'text-outline',
};

function dateLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

/** The match id is a UUID; the short form is for reading, the full one for hover. */
function shortId(id: string): string {
  return id.slice(0, 8);
}

/**
 * One match, one row: result, both clubs, season/round/date, match id, score.
 *
 * The whole row is a link to the match page — the id is the only handle a
 * player has on a specific fixture, so it is shown rather than hidden behind
 * a "detail" affordance.
 *
 * Shared by the profile's four-row "recent matches" block and the full match
 * log page so the same match cannot read two different ways.
 */
export function PlayerMatchRow({ entry }: { entry: PlayerMatchLogEntry }) {
  const t = useTranslations('player_profile');
  const locale = useLocale();
  const played = entry.homeScore !== null && entry.awayScore !== null;

  return (
    <li>
      <Link
        href={`/${locale}/matches/${entry.matchId}`}
        className="flex items-center gap-tight rounded-lg border border-outline-variant/25 bg-white/[0.02] px-tight py-micro transition-colors duration-quick hover:border-primary/40 hover:bg-white/[0.05]"
      >
        <span
          className={`w-8 shrink-0 font-label text-kicker font-bold uppercase tracking-[0.08em] ${RESULT_TONE[entry.result]}`}
        >
          {t(`result.${entry.result}`)}
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-micro truncate text-label">
            <span className="shrink-0 rounded bg-surface-container px-micro py-px font-label text-kicker font-bold text-on-surface-variant">
              {entry.isHome ? t('venue.home') : t('venue.away')}
            </span>
            <span
              className={`truncate ${entry.isHome ? 'font-semibold text-on-surface' : 'text-on-surface-variant'}`}
            >
              {entry.homeTeamName}
            </span>
            <span className="shrink-0 text-kicker text-outline">vs</span>
            <span
              className={`truncate ${entry.isHome ? 'text-on-surface-variant' : 'font-semibold text-on-surface'}`}
            >
              {entry.awayTeamName}
            </span>
          </p>
          <p className="truncate font-label text-kicker tabular-nums text-outline">
            S{entry.season}
            {entry.round ? ` · R${entry.round}` : ''} · {dateLabel(entry.scheduledAt)} ·{' '}
            <span title={entry.matchId}>#{shortId(entry.matchId)}</span>
          </p>
        </div>

        <span className="shrink-0 font-headline text-label font-bold tabular-nums text-on-surface">
          {played ? `${entry.homeScore} - ${entry.awayScore}` : '—'}
        </span>
      </Link>
    </li>
  );
}

export function PlayerMatchList({ entries }: { entries: readonly PlayerMatchLogEntry[] }) {
  const t = useTranslations('player_profile');

  if (entries.length === 0) {
    return <p className="font-label text-label text-on-surface-variant/60">{t('noMatches')}</p>;
  }

  return (
    <ul className="flex flex-col gap-micro">
      {entries.map((entry) => (
        <PlayerMatchRow key={entry.matchId} entry={entry} />
      ))}
    </ul>
  );
}
