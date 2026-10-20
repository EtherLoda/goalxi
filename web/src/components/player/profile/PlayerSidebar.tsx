'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { PlayerEvent } from '@/lib/api';
import { EventIcon } from './player-profile-primitives';

type SidebarTab = 'events' | 'matches';

interface PlayerSidebarProps {
  events: readonly PlayerEvent[];
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

/**
 * The profile page's right column.
 *
 * Two tabs over the SAME `player_events` payload: the flat career log, and the
 * same rows grouped by the match they came from. There is no per-match
 * appearance table in the database yet, so "比赛记录" is honest about what it
 * is — every match this player has a recorded event in — rather than
 * pretending to be a full appearance list. A real appearance log needs a
 * backend projection over the simulated lineups.
 */
export function PlayerSidebar({ events }: PlayerSidebarProps) {
  const t = useTranslations('player_profile');
  const te = useTranslations('player_events');
  const [tab, setTab] = useState<SidebarTab>('events');

  const label = (event: PlayerEvent) =>
    event.titleKey ? te(event.titleKey.replace(/^player_events\./, '')) : event.eventType;

  const matches = useMemo(() => {
    const byMatch = new Map<string, PlayerEvent[]>();
    for (const event of events) {
      if (!event.matchId) continue;
      const list = byMatch.get(event.matchId);
      if (list) list.push(event);
      else byMatch.set(event.matchId, [event]);
    }
    return [...byMatch.entries()]
      .map(([matchId, list]) => ({ matchId, date: list[0].date, events: list }))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [events]);

  const tabClass = (active: boolean) =>
    [
      'flex-1 rounded-lg px-tight py-micro font-label text-kicker font-bold uppercase tracking-[0.08em] transition-colors duration-quick',
      active
        ? 'bg-primary/15 text-primary'
        : 'text-on-surface-variant hover:bg-white/[0.04] hover:text-on-surface',
    ].join(' ');

  return (
    <div className="glass-panel flex flex-col overflow-hidden rounded-2xl">
      <div className="flex gap-micro border-b border-outline-variant/30 p-tight">
        <button
          type="button"
          onClick={() => setTab('events')}
          className={tabClass(tab === 'events')}
          aria-pressed={tab === 'events'}
        >
          {t('tabs.events')}
        </button>
        <button
          type="button"
          onClick={() => setTab('matches')}
          className={tabClass(tab === 'matches')}
          aria-pressed={tab === 'matches'}
        >
          {t('tabs.matches')}
        </button>
      </div>

      <div className="custom-scrollbar max-h-[520px] overflow-y-auto p-panel">
        {tab === 'events' ? (
          events.length === 0 ? (
            <p className="font-label text-label text-on-surface-variant/60">{t('noEvents')}</p>
          ) : (
            <ul className="flex flex-col gap-tight">
              {events.slice(0, 20).map((event) => (
                <li key={event.id} className="flex items-center gap-tight">
                  <EventIcon type={event.eventType} />
                  <span className="min-w-0 flex-1 truncate text-label font-semibold text-on-surface">
                    {label(event)}
                  </span>
                  <span className="shrink-0 font-label text-kicker tabular-nums text-outline">
                    {dayLabel(event.date)}
                  </span>
                </li>
              ))}
            </ul>
          )
        ) : matches.length === 0 ? (
          <p className="font-label text-label text-on-surface-variant/60">{t('noMatches')}</p>
        ) : (
          <ul className="flex flex-col gap-tight">
            {matches.map((match) => (
              <li
                key={match.matchId}
                className="rounded-lg border border-outline-variant/25 bg-white/[0.02] p-tight"
              >
                <div className="mb-micro flex items-center justify-between">
                  <span className="font-label text-kicker tabular-nums text-on-surface">
                    {dayLabel(match.date)}
                  </span>
                  <span className="font-label text-kicker tabular-nums text-outline">
                    {t('eventsInMatch', { count: match.events.length })}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-tight">
                  {match.events.map((event) => (
                    <span key={event.id} className="inline-flex items-center gap-micro">
                      <EventIcon type={event.eventType} />
                      <span className="text-kicker text-on-surface-variant">{label(event)}</span>
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
