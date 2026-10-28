'use client';

import { AppIcon } from '@/components/icons/AppIcon';
import { useTranslations } from 'next-intl';
import { type MatchEvent, type MatchStatsRes } from '@/lib/api';
import { buildStatRows, type StatRow, type StatRowKey } from './match-stats-rows';

const HOME_COLOR = 'var(--color-primary)';
const AWAY_COLOR = 'var(--color-secondary)';

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
 * Renders nothing until the `match_team_stats` row exists: that row is
 * written when the match completes, and inventing live numbers from the
 * event stream would disagree with the report at full time.
 *
 * The bars animate in on mount (see the `stat-*` keyframes in
 * `globals.css`). Both fills start at `scaleX(0)` and grow outward from
 * their own edge, meeting at the share line — the global reduced-motion
 * block collapses the whole thing to a single frame.
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
              <div className="flex items-baseline justify-between gap-2">
                <span className="w-10 shrink-0 text-left text-label font-semibold tabular-nums text-primary">
                  {formatValue(row, row.home)}
                </span>
                <dt className="min-w-0 flex-1 text-center text-label text-on-surface-variant/85 truncate">
                  {label}
                </dt>
                <span className="w-10 shrink-0 text-right text-label font-semibold tabular-nums text-secondary">
                  {formatValue(row, row.away)}
                </span>
              </div>
              <div
                className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-white/[0.07]"
                aria-hidden="true"
              >
                <span
                  className="h-full origin-left rounded-full"
                  style={{
                    width: `${homeShare}%`,
                    backgroundColor: 'color-mix(in srgb, var(--color-primary) 60%, transparent)',
                    animation: BAR_GROW,
                    animationDelay: `${delay}ms`,
                  }}
                />
                <span
                  className="h-full flex-1 origin-right rounded-full"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--color-secondary) 42%, transparent)',
                    animation: BAR_GROW,
                    animationDelay: `${delay}ms`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
