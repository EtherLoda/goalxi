'use client';

import { AppIcon } from '@/components/icons/AppIcon';
import { useTranslations } from 'next-intl';
import { type MatchEvent, type MatchStatsRes } from '@/lib/api';
import { buildStatRows, type StatRow, type StatRowKey } from './match-stats-rows';

const HOME_COLOR = 'var(--color-primary)';
const AWAY_COLOR = 'var(--color-secondary)';

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
 * fouls …), in the shape a Premier League match centre uses.
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
        {rows.map((row) => {
          const total = row.home + row.away;
          const homeShare = total > 0 ? (row.home / total) * 100 : 50;
          const label = t(`rows.${row.key satisfies StatRowKey}`);
          return (
            <div key={row.key} className="py-[3px]" data-testid={`match-stat-${row.key}`}>
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
                className="mt-0.5 flex h-[3px] overflow-hidden rounded-full bg-white/[0.06]"
                aria-hidden="true"
              >
                <span
                  style={{
                    width: `${homeShare}%`,
                    backgroundColor: 'color-mix(in srgb, var(--color-primary) 55%, transparent)',
                  }}
                  className="h-full"
                />
                <span
                  className="h-full flex-1"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--color-secondary) 40%, transparent)',
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
