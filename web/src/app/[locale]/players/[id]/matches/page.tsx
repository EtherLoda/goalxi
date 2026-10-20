'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, type Player, type PlayerMatchLogEntry } from '@/lib/api';
import { PlayerMatchList } from '@/components/player/profile/PlayerMatchLog';

/**
 * The player's match log, one row per match, filterable by season.
 *
 * The season list comes from the API (every season the player has a recorded
 * match in) rather than from the club's current season, so a player who moved
 * clubs still shows both halves of his history.
 */
export default function PlayerMatchesPage() {
  const params = useParams<{ locale: string; id: string }>();
  const t = useTranslations('player_profile');
  const playerId = Number(params?.id);

  const [player, setPlayer] = useState<Player | null>(null);
  const [entries, setEntries] = useState<PlayerMatchLogEntry[]>([]);
  const [seasons, setSeasons] = useState<number[]>([]);
  const [season, setSeason] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!Number.isFinite(playerId)) return;
    let cancelled = false;
    Promise.all([
      api.players.getById(playerId),
      api.players.getMatches(playerId, { limit: 100 }),
    ])
      .then(([loadedPlayer, log]) => {
        if (cancelled) return;
        setPlayer(loadedPlayer);
        setEntries(log.items);
        setSeasons(log.seasons);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  const visible = useMemo(
    () => (season === null ? entries : entries.filter((entry) => entry.season === season)),
    [entries, season],
  );

  const locale = params?.locale ?? 'zh';

  const chipClass = (active: boolean) =>
    [
      'rounded-lg px-tight py-micro font-label text-kicker font-bold tabular-nums transition-colors duration-quick',
      active
        ? 'bg-primary/15 text-primary'
        : 'text-on-surface-variant hover:bg-white/[0.04] hover:text-on-surface',
    ].join(' ');

  return (
    <div className="mx-auto w-full max-w-[720px] p-6 pt-8">
      <Link
        href={`/${locale}/players/${playerId}`}
        className="mb-panel inline-flex items-center gap-micro font-label text-kicker font-bold uppercase tracking-[0.08em] text-on-surface-variant transition-colors duration-quick hover:text-primary"
      >
        <span aria-hidden="true">←</span>
        {t('back')}
      </Link>

      <div className="glass-panel overflow-hidden rounded-2xl">
        <div className="flex flex-col gap-micro p-panel">
          <span className="font-label text-kicker font-bold uppercase tracking-[0.12em] text-outline">
            {t('nav.matches')}
          </span>
          <h1 className="font-headline text-2xl font-black tracking-tight text-on-surface">
            {player?.name ?? ''}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-micro border-t border-outline-variant/30 px-panel py-tight">
          <button
            type="button"
            onClick={() => setSeason(null)}
            className={chipClass(season === null)}
            aria-pressed={season === null}
          >
            {t('seasonAll')}
          </button>
          {seasons.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setSeason(value)}
              className={chipClass(season === value)}
              aria-pressed={season === value}
            >
              S{value}
            </button>
          ))}
        </div>

        <div className="p-panel pt-tight">
          {loading ? (
            <p className="font-label text-label text-on-surface-variant/60">{t('noMatches')}</p>
          ) : (
            <PlayerMatchList entries={visible} />
          )}
        </div>
      </div>
    </div>
  );
}
