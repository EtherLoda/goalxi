/**
 * MatchInfoPanel — the "what happened around this fixture" card.
 *
 * Rendered INSIDE the caller's GlassPanel, so it draws no panel of its own:
 * header row, then divider rows down to the identifier. That is the same
 * shape the neighbouring key-events / stats cards use.
 *
 * Competition is assembled here rather than at the call sites: `type` picks
 * the label, `round` carries the league matchday, `cupRound` the cup round.
 * Every field is optional and rows drop out when absent, so a sparse fixture
 * reads as sparse rather than printing zeros.
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

type TFn = ReturnType<typeof useTranslations<'matchInfo'>>;

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

function competitionLabel(m: MatchInfoSource, t: TFn): string {
  const kind = (m.type ?? 'league') as string;
  const withRound = (base: string, round: number | null | undefined) =>
    round == null ? base : t('competitionWithRound', { base, round });

  switch (kind) {
    case 'cup':
      return withRound(t('competitionCup'), m.cupRound);
    case 'playoff':
      return t('competitionPlayoff');
    case 'tournament':
      return t('competitionTournament');
    case 'friendly':
      return t('competitionFriendly');
    case 'national_team':
      return t('competitionNationalTeam');
    default:
      return withRound(m.leagueName ?? t('competitionLeague'), m.round);
  }
}

function weatherLabel(w: string, t: TFn): string {
  // Per-type names are flat leaves so the lookup stays type-safe.
  const map: Record<string, string> = {
    sunny: 'weatherSunny',
    cloudy: 'weatherCloudy',
    rainy: 'weatherRainy',
    windy: 'weatherWindy',
    foggy: 'weatherFoggy',
    snowy: 'weatherSnowy',
    stormy: 'weatherStormy',
  };
  const k = map[w.toLowerCase()];
  return k ? t(k) : w;
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
    <div className="flex items-start gap-3 px-4 py-2.5">
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
    <div className="flex flex-col">
      <header className="flex items-center gap-2 px-4 pb-2 pt-3">
        <AppIcon name="info" className="text-body text-primary" />
        <h3 className="font-headline text-title font-bold tracking-wide text-on-surface">
          {t('title')}
        </h3>
      </header>

      <div className="divide-y divide-outline-variant/40 border-t border-outline-variant/40">
        <Row icon="emoji_events" caption={t('competition')}>
          {competitionLabel(match, t)}
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
          <Row icon={weatherIconName(match.weather)} caption={t('weather')}>
            {weatherLabel(match.weather, t)}
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

        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <span className="text-kicker uppercase tracking-wider text-muted">
            {t('matchId')}
          </span>
          <code
            className="font-mono text-label text-muted"
            title={match.id ?? undefined}
          >
            {(match.id ?? '').slice(0, 8)}
          </code>
        </div>
      </div>
    </div>
  );
}
