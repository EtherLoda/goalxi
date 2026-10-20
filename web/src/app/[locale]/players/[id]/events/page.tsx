'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, type Player, type PlayerEvent } from '@/lib/api';
import { PlayerEventTimeline } from '@/components/player/profile/PlayerEventTimeline';

/**
 * The full career event log for one player, as its own page.
 *
 * The profile used to render this inside a sidebar tab; a page gives the log
 * the whole column, keeps `back` working (the URL describes the view), and
 * leaves room to grow filters later without crowding the profile.
 */
export default function PlayerEventsPage() {
  const params = useParams<{ locale: string; id: string }>();
  const t = useTranslations('player_profile');
  const playerId = Number(params?.id);

  const [player, setPlayer] = useState<Player | null>(null);
  const [events, setEvents] = useState<PlayerEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!Number.isFinite(playerId)) return;
    let cancelled = false;
    Promise.all([
      api.players.getById(playerId),
      api.players.getEvents(playerId).catch(() => [] as PlayerEvent[]),
    ])
      .then(([loadedPlayer, loadedEvents]) => {
        if (cancelled) return;
        setPlayer(loadedPlayer);
        setEvents(loadedEvents);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  const locale = params?.locale ?? 'zh';

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
            {t('nav.events')}
          </span>
          <h1 className="font-headline text-2xl font-black tracking-tight text-on-surface">
            {player?.name ?? ''}
          </h1>
        </div>

        {loading ? (
          <div className="p-panel">
            <p className="font-label text-label text-on-surface-variant/60">{t('noEvents')}</p>
          </div>
        ) : (
          <PlayerEventTimeline events={events} limit={200} />
        )}
      </div>
    </div>
  );
}
