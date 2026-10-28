'use client';

import { AppIcon } from '@/components/icons/AppIcon';
import { useTranslations } from 'next-intl';
import { type MatchEvent, type MatchStatsRes } from '@/lib/api';
import { buildStatRows, type StatRow, type StatRowKey } from './match-stats-rows';

const HOME_COLOR = 'var(--color-primary)';
const AWAY_COLOR = 'var(--color-secondary)';

/** Same panes as the chances card, so the two cards read as siblings. */
const HOME_PANE = 'var(--color-primary)';
const AWAY_PANE = 'var(--color-secondary)';

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
 * Each row is one bar split at the share line, with the two numbers
 * inside its ends and the label above it. The label stays out of the bar
 * on purpose: at 10px it was unreadable wherever the seam ran through a
 * word, and keeping the colour to the bar alone gives the card its
 * rhythm back.
 *
 * Every bar is the same height — an earlier version stacked a segmented
 * bar under each row, and the translucent away half read a hair thinner
 * than the home half even though both measured 3px.
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

      <dl className="flex flex-col">
        {rows.map((row, index) => {
          const total = row.home + row.away;
          const homeShare = total > 0 ? (row.home / total) * 100 : 50;
          const label = t(`rows.${row.key satisfies StatRowKey}`);
          const delay = index * ROW_STAGGER_MS;
          return (
            <div
              key={row.key}
              className="py-[2px]"
              data-testid={`match-stat-${row.key}`}
              style={{ animation: ROW_IN, animationDelay: `${delay}ms` }}
            >
              <dt className="mb-0.5 text-center text-kicker tracking-wider text-on-surface-variant/85">
                {label}
              </dt>
              <dd className="relative m-0 flex h-4 overflow-hidden rounded-md bg-white/[0.05]">
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
                  className="-ml-px h-full flex-1 origin-right"
                  style={{
                    backgroundColor: AWAY_PANE,
                    animation: BAR_GROW,
                    animationDelay: `${delay}ms`,
                  }}
                  aria-hidden="true"
                />
                <span className="pointer-events-none absolute inset-y-0 left-1.5 flex items-center text-label font-semibold tabular-nums text-ink-1000">
                  {formatValue(row, row.home)}
                </span>
                <span className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center text-label font-semibold tabular-nums text-ink-1000">
                  {formatValue(row, row.away)}
                </span>
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
