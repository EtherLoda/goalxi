'use client';

/**
 * TeamTacticBar.tsx — the read-only tactic summary shown above the pitch.
 *
 * Why a bar and not a panel: the deployment gate is a HARD slot count, so
 * the player needs the count visible while dragging on the 阵容 tab, where
 * the picker is not on screen. The picker itself lives in the 战术与换人 tab
 * and renders the same tally, so the two can never disagree.
 */
import { useTranslations } from 'next-intl';
import type { PositionFamilyCode } from '@/lib/api';
import type { LineupMap, TeamTacticCodeValue } from '../types';
import { checkTactic, tallyFamilies } from './requirement';
import { LineupFamilyTally } from './LineupFamilyTally';
import type { TeamTacticsTable } from './use-team-tactics';

export interface TeamTacticBarProps {
  lineup: LineupMap;
  teamTactic: TeamTacticCodeValue | null;
  table: TeamTacticsTable | null;
  isLoading: boolean;
  error: string | null;
  isLocked: boolean;
}

export function TeamTacticBar({
  lineup,
  teamTactic,
  table,
  isLoading,
  error,
  isLocked,
}: TeamTacticBarProps) {
  const t = useTranslations('tactics.teamTactic');

  const tally = table ? tallyFamilies(lineup, table.families) : null;
  const check = checkTactic(lineup, teamTactic, table);
  const definition = teamTactic ? table?.tactics.find((d) => d.code === teamTactic) : undefined;

  // Families this tactic asks for, so the bar can bold exactly those.
  const needed = new Set<PositionFamilyCode>();
  for (const requirement of definition?.requirements ?? []) {
    for (const family of requirement.families) needed.add(family);
  }

  const name = teamTactic ? t(`codes.${teamTactic}`) : t('none');
  const showMissing = Boolean(teamTactic) && !check.ok && check.missing.length > 0;

  return (
    <section
      aria-label={t('title')}
      className="glass-panel flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl px-4 py-3"
    >
      <div className="flex min-w-0 flex-col">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant/70">
          {t('title')}
        </span>
        <span className="truncate text-sm font-semibold text-on-surface">
          {isLoading ? t('loading') : error ? t('unavailable') : name}
        </span>
      </div>

      <div className="flex flex-1 flex-wrap items-center gap-1.5">
        {tally && table ? (
          <LineupFamilyTally
            tally={tally}
            familyOrder={table.familyOrder}
            needed={needed}
          />
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        {showMissing ? (
          <span className="text-[11px] font-medium text-tertiary">
            {check.missing
              .map((m) =>
                t('missing', { need: m.need - m.have, families: m.families.join('/') }),
              )
              .join(' · ')}
          </span>
        ) : teamTactic ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary" />
            {t('satisfied')}
          </span>
        ) : (
          <span className="text-[11px] text-on-surface-variant/60">{t('noneHint')}</span>
        )}
        {isLocked ? (
          <span className="rounded bg-white/6 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
            {t('locked')}
          </span>
        ) : null}
      </div>
    </section>
  );
}
