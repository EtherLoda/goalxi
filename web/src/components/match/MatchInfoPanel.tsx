/**
 * MatchInfoPanel — the "what happened around this fixture" card.
 *
 * Layered on purpose: competition (which trophy, which round), then the
 * facts of the day (kickoff, ground, weather, crowd, money), then the
 * identifier at caption weight — it is for support tickets, not reading.
 *
 * The panel owns the formatting because every caller would otherwise
 * repeat the same three derivations (competition label, kickoff string,
 * fill percentage). Callers pass the match and nothing else.
 *
 * Every field is optional: cup and national-team fixtures carry no
 * league round, an away fixture has no gate receipts, and matches
 * settled before the `ticket_revenue` column existed have no revenue.
 * Rows drop out rather than printing zero, so a sparse fixture reads as
 * sparse instead of broken.
 */
'use client';

import { AppIcon, type MaterialIconName } from "@/components/icons/AppIcon";
import { useLocale, useTranslations } from 'next-intl';
import React from 'react';

/** The subset of `Match` this card reads. */
export interface MatchInfoSource {
  id?: string | null;
  type?: string | null;
  leagueName?: string | null;
  round?: number | null;
  cupRound?: number | null;
  scheduledAt?: string | Date | null;
  venue?: string | null;
  weather?: string | null;
  attendance?: number | null;
  capacity?: number | null;
  ticketRevenue?: number | null;
}

const COMPETITION_KEY: Record<string, string> = {
  league: 'league',
  cup: 'cup',
  playoff: 'playoff',
  tournament: 'tournament',
  friendly: 'friendly',
  national_team: 'nationalTeam',
};

function weatherIconName(w: string): MaterialIconName {
  switch (w.toLowerCase()) {
    case 'sunny':
      return 'wb_sunny';
    case 'cloudy':
      return 'cloud';
    case 'rainy':
      return 'rainy';
    case 'windy':
      return 'air';
    case 'foggy':
      return 'foggy';
    case 'snowy':
      return 'ac_unit';
    case 'stormy':
      return 'thunderstorm';
    default:
      return 'cloud';
  }
}

function Row({
  icon,
  caption,
  children,
}: {
  icon: MaterialIconName;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-surface-container-high text-muted">
        <AppIcon name={icon} className="text-body" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-kicker uppercase tracking-wider text-muted">
          {caption}
        </div>
        <div className="mt-0.5 text-body text-on-surface">{children}</div>
      </div>
    </div>
  );
}

export function MatchInfoPanel({ match }: { match?: MatchInfoSource | null }) {
  const t = useTranslations('matchInfo');
  const locale = useLocale();

  if (!match) return null;

  const kind = match.type ?? 'league';
  const compKey = COMPETITION_KEY[kind] ?? 'league';
  const compBase =
    kind === 'league' && match.leagueName
      ? match.leagueName
      : t(`competition.${compKey}`);
  const compRound = kind === 'cup' ? match.cupRound : match.round;
  const competition =
    compRound != null
      ? t('competition.withRound', { base: compBase, round: compRound })
      : compBase;

  const kickoff =
    match.scheduledAt == null
      ? null
      : new Date(match.scheduledAt).toLocaleString(locale, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });

  const fillPct =
    match.attendance != null && match.capacity != null && match.capacity > 0
      ? Math.round((match.attendance / match.capacity) * 100)
      : null;

  return (
    <section className="glass-panel overflow-hidden">
      <header className="flex items-center gap-2 px-4 py-3">
        <AppIcon name="info" className="text-body text-primary" />
        <h3 className="font-headline text-title font-bold tracking-wider text-on-surface">
          {t('title')}
        </h3>
      </header>

      <div className="divide-y divide-outline-variant/40 border-t border-outline-variant/40 px-4">
        <Row icon="emoji_events" caption={t('competition')}>
          {competition}
        </Row>

        {kickoff && (
          <Row icon="schedule" caption={t('kickoff')}>
            {kickoff}
          </Row>
        )}

        {match.venue && (
          <Row icon="stadium" caption={t('venue')}>
            {match.venue}
          </Row>
        )}

        {match.weather && (
          <Row
            icon={weatherIconName(match.weather)}
            caption={t('weather')}
          >
            {t.has(`weather.${match.weather.toLowerCase()}`)
              ? t(`weather.${match.weather.toLowerCase()}`)
              : match.weather}
          </Row>
        )}

        {match.attendance != null && (
          <Row icon="group" caption={t('attendance')}>
            {match.attendance.toLocaleString()}
            {fillPct != null && (
              <span className="ml-2 text-label text-muted">{fillPct}%</span>
            )}
          </Row>
        )}

        {match.ticketRevenue != null && (
          <Row icon="payments" caption={t('revenue')}>
            {`£${match.ticketRevenue.toLocaleString()}`}
          </Row>
        )}
      </div>

      {match.id && (
        <footer className="flex items-center justify-between gap-3 border-t border-outline-variant/40 px-4 py-2.5">
          <span className="text-kicker uppercase tracking-wider text-muted">
            {t('matchId')}
          </span>
          <code className="font-mono text-label text-muted" title={match.id}>
            {match.id.slice(0, 8)}
          </code>
        </footer>
      )}
    </section>
  );
}
