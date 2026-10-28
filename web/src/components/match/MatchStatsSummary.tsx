'use client';

import { AppIcon } from '@/components/icons/AppIcon';
import { useTranslations } from 'next-intl';
import { type MatchEvent, type MatchStatsRes } from '@/lib/api';
import { buildStatRows, type StatRow, type StatRowKey } from './match-stats-rows';

const HOME_COLOR = 'var(--color-primary)';
const AWAY_COLOR = 'var(--color-secondary)';

/** Same pane recipe as the chances card, so the two cards read as siblings. */
const HOME_PANE = 'color-mix(in srgb, var(--color-primary) 26%, #0c2418)';
const AWAY_PANE = 'color-mix(in srgb, var(--color-secondary) 30%, #0c2418)';

/** Bars grow one after another instead of all at once. */
const ROW_STAGGER_MS = 45;
const BAR_GROW = 'stat-bar-grow 650ms cubic-bezier(0.22, 1, 0.36, 1) both';
const ROW_IN = 'stat-row-in 400ms ease-out both';

interface MatchStatsSummaryProps {
  stats: MatchStatsRes | null;
  events: readonly MatchEvent[];
  homeTeamName: string;
  awayTeamName: string;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
}

function formatValue(row: StatRow, value: number): string {
  if (row.unit === 'percent') {
    // Two decimals on the server, one on screen — 61.5% is plenty.
    return `${Math.round(value * 10) / 10}%`;
  }
  return String(value);
}

/**
 * Match stats — the row-for-row comparison (shots, on target, corners,
 * tackles …), in the shape a Premier League match centre uses.
 *
 * Each row is one bar split at the share line, with the label riding in
 * the middle and the two numbers at the ends. One fixed height for every
 * row is the point: the earlier version laid a segmented bar under each
 * row and the semi-transparent away half read half a pixel thinner than
 * the home half.
 *
 * Renders nothing until the `match_team_stats` row exists: that row is
 * written when the match completes, and inventing live numbers from the
 * event stream would disagree with the report at full time.
 */
export function MatchStatsSummary({
  stats,
  events,
  homeTeamName,
  awayTeamName,
  homeTeamId,
  awayTeamId,
}: MatchStatsSummaryProps) {
  const t = useTranslations('matches.bento.matchStats');
  const rows = buildStatRows(stats, events, homeTeamId ?? null, awayTeamId ?? null);

  if (rows.length === 0) return null;

  return (
    <section className="glass-panel rounded-2xl p-4 shrink-0">
      <h3 className="font-headline font-bold text-kicker uppercase tracking-widest text-primary mb-2.5 flex items-center gap-2">
        <AppIcon name="trending_up" className="text-base" />
        {t('title')}
      </h3>

      <div className="flex items-center justify-between mb-2 text-kicker font-headline uppercase tracking-wider">
        <span className="font-bold truncate" style={{ color: HOME_COLOR }}>
          {homeTeamName}
        </span>
        <span className="font-bold truncate text-right" style={{ color: AWAY_COLOR }}>
          {awayTeamName}
        </span>
      </div>

      <dl className="flex flex-col gap-1">
        {rows.map((row, index) => {
          const total = row.home + row.away;
          const homeShare = total > 0 ? (row.home / total) * 100 : 50;
          const label = t(`rows.${row.key satisfies StatRowKey}`);
          const delay = index * ROW_STAGGER_MS;
          return (
            <div
              key={row.key}
              data-testid={`match-stat-${row.key}`}
              style={{ animation: ROW_IN, animationDelay: `${delay}ms` }}
            >
              <dt className="sr-only">{label}</dt>
              <div className="relative flex h-4 overflow-hidden rounded-md bg-white/[0.05]">
                <span
                  className="h-full origin-left"
                  style={{
                    width: `${homeShare}%`,
                    backgroundColor: HOME_PANE,
                    animation: BAR_GROW,
                    animationDelay: `${delay}ms`,
                  }}
                  aria-hidden="true"
                />
                <span
                  className="h-full flex-1 origin-right"
                  style={{
                    backgroundColor: AWAY_PANE,
                    animation: BAR_GROW,
                    animationDelay: `${delay}ms`,
                  }}
                  aria-hidden="true"
                />
                <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-label font-semibold tabular-nums text-on-surface [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]">
                  {formatValue(row, row.home)}
                </span>
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-1.5 text-kicker tracking-wide text-on-surface [text-shadow:0_1px_2px_rgba(0,0,0,0.55)] whitespace-nowrap"
                >
                  {label}
                </span>
                <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-label font-semibold tabular-nums text-on-surface [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]">
                  {formatValue(row, row.away)}
                </span>
              </div>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
