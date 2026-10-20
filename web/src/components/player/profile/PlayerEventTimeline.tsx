'use client';

import { useTranslations } from 'next-intl';
import type { PlayerEvent } from '@/lib/api';
import { EventIcon } from './player-profile-primitives';

interface PlayerEventTimelineProps {
  events: readonly PlayerEvent[];
  /** How many rows to show. The count badge appears only when there are more. */
  limit?: number;
}

/**
 * Career events as a compact list.
 *
 * The profile page used to render an empty state as a 200px dashed box with a
 * centred icon; the squad pane used a single muted line. One muted line is the
 * honest amount of ink for "nothing has happened yet", and it is what both
 * screens now render.
 */
export function PlayerEventTimeline({ events, limit = 5 }: PlayerEventTimelineProps) {
  const t = useTranslations('player_events');
  const shown = events.slice(0, limit);

  return (
    <div className="border-t border-outline-variant/30 p-panel">
      <div className="mb-tight flex items-center justify-between">
        <span className="font-label text-kicker font-bold uppercase tracking-[0.12em] text-on-surface-variant">
          {t('title')}
        </span>
        {events.length > limit ? (
          <span className="font-label text-kicker tabular-nums text-outline">{events.length}</span>
        ) : null}
      </div>

      {shown.length === 0 ? (
        <p className="font-label text-label text-on-surface-variant/60">{t('no_events')}</p>
      ) : (
        <ul className="flex flex-col gap-tight">
          {shown.map((event) => {
            const date = new Date(event.date);
            const dateLabel = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
            return (
              <li key={event.id} className="flex items-center gap-tight">
                <EventIcon type={event.eventType} />
                <span className="min-w-0 flex-1 truncate text-label font-semibold text-on-surface">
                  {event.titleKey ? t(event.titleKey.replace(/^player_events\./, '')) : event.eventType}
                </span>
                <span className="shrink-0 font-label text-kicker tabular-nums text-outline">
                  S{event.season} · {dateLabel}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
