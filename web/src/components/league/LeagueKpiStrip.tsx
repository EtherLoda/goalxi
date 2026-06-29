"use client";

import { useTranslations } from "next-intl";
import { clsx } from "clsx";
import type { Standing } from "@/lib/api";

interface LeagueKpiStripProps {
  standings: Standing[];
  userTeamId?: string;
  userTeamColor?: string;
}

interface KpiSpec {
  key: string;
  labelKey: 'kpi.leader' | 'kpi.form' | 'kpi.topScorer' | 'kpi.fouls';
  icon: string;
  /** Picks the row to highlight. */
  pick: (standings: Standing[]) => Standing | null;
  /** Value formatter. */
  value: (row: Standing) => string;
  sub: (row: Standing) => string;
  accent: 'primary' | 'secondary' | 'tertiary';
}

/**
 * 3-card KPI strip derived from league standings.
 * Today: leader, best form, top scorer (using wins as a proxy until we have
 * a dedicated `topScorer` field). The `noData` placeholder keeps the strip
 * useful when standings haven't loaded.
 */
export default function LeagueKpiStrip({
  standings,
  userTeamId,
  userTeamColor = "#00e479",
}: LeagueKpiStripProps) {
  const t = useTranslations('league');

  const kpis: KpiSpec[] = [
    {
      key: 'leader',
      labelKey: 'kpi.leader',
      icon: 'workspace_premium',
      pick: (rows) => rows.find((r) => r.position === 1) ?? null,
      value: (row) => row.teamName || `Club ${row.teamId.slice(0, 6)}`,
      sub: (row) => `${row.points} ${t('standings.pts')}`,
      accent: 'tertiary',
    },
    {
      key: 'form',
      labelKey: 'kpi.form',
      icon: 'trending_up',
      pick: (rows) => {
        const sorted = [...rows].sort((a, b) => {
          const aForm = countRecentWins(a);
          const bForm = countRecentWins(b);
          return bForm - aForm;
        });
        return sorted[0] ?? null;
      },
      value: (row) => row.teamName || `Club ${row.teamId.slice(0, 6)}`,
      sub: (row) => `${countRecentWins(row)}W · 5`,
      accent: 'primary',
    },
    {
      key: 'topScorer',
      labelKey: 'kpi.topScorer',
      icon: 'sports_score',
      pick: (rows) => [...rows].sort((a, b) => b.wins - a.wins)[0] ?? null,
      value: (row) => row.teamName || `Club ${row.teamId.slice(0, 6)}`,
      sub: (row) => `${row.wins} ${t('standings.w')}`,
      accent: 'secondary',
    },
  ];

  return (
    <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {kpis.map((kpi) => {
        const row = kpi.pick(standings);
        const accentBg =
          kpi.accent === 'primary'
            ? 'bg-primary/10 border-primary/20 text-primary'
            : kpi.accent === 'secondary'
              ? 'bg-secondary/10 border-secondary/20 text-secondary'
              : 'bg-tertiary/10 border-tertiary/20 text-tertiary';

        return (
          <div
            key={kpi.key}
            className="glass-panel rounded-2xl p-4 flex items-center gap-3"
          >
            <div
              className={clsx(
                'w-11 h-11 rounded-xl border flex items-center justify-center shrink-0',
                accentBg,
              )}
            >
              <span className="material-symbols-outlined text-xl">{kpi.icon}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-label text-[9px] uppercase tracking-[0.25em] font-black text-on-surface-variant">
                {t(kpi.labelKey)}
              </p>
              {row ? (
                <>
                  <p
                    className={clsx(
                      'font-headline text-base font-bold truncate',
                      row.teamId === userTeamId ? 'text-primary' : 'text-on-surface',
                    )}
                    style={
                      row.teamId === userTeamId
                        ? { textShadow: `0 0 10px ${userTeamColor}55` }
                        : undefined
                    }
                  >
                    {kpi.value(row)}
                  </p>
                  <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant/70">
                    {kpi.sub(row)}
                  </p>
                </>
              ) : (
                <p className="font-headline text-base font-bold text-on-surface-variant">
                  {t('kpi.noData')}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function countRecentWins(row: Standing): number {
  if (!row.recentMatches) return 0;
  return row.recentMatches.filter((m) => m.result === 'W').length;
}