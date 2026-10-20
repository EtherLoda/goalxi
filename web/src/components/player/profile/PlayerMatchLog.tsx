'use client';

import { useTranslations } from 'next-intl';
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

/**
 * One match, one row: result, venue + opponent, season/round/date, score.
 *
 * Shared by the profile's four-row "recent matches" block and the full match
 * log page so the same match cannot read two different ways.
 */
export function PlayerMatchRow({ entry }: { entry: PlayerMatchLogEntry }) {
  const t = useTranslations('player_profile');
  const played = entry.teamScore !== null && entry.opponentScore !== null;

  return (
    <li className="flex items-center gap-tight rounded-lg border border-outline-variant/25 bg-white/[0.02] px-tight py-micro">
      <span
        className={`w-10 shrink-0 font-label text-kicker font-bold uppercase tracking-[0.08em] ${RESULT_TONE[entry.result]}`}
      >
        {t(`result.${entry.result}`)}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-label font-semibold text-on-surface">
          <span className="mr-micro text-kicker text-outline">
            {entry.isHome ? t('venue.home') : t('venue.away')}
          </span>
          {entry.opponentName}
        </p>
        <p className="font-label text-kicker tabular-nums text-outline">
          S{entry.season}
          {entry.round ? ` · R${entry.round}` : ''} · {dateLabel(entry.scheduledAt)}
        </p>
      </div>

      <span className="shrink-0 font-headline text-label font-bold tabular-nums text-on-surface">
        {played ? `${entry.teamScore} - ${entry.opponentScore}` : '—'}
      </span>
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
