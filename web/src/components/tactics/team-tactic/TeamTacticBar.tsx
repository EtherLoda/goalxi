'use client';

/**
 * TeamTacticBar.tsx — the read-only tactic summary shown above the pitch.
 *
 * Why a bar and not a panel: the slot count gates SUBMISSION, so the player
 * needs to watch the count while dragging on the 阵容 tab, where the picker is
 * not on screen. Selecting an unsatisfied tactic is allowed — the bar is how
 * the 阵容 tab reports the shortfall while the player fixes it. The picker
 * renders the same tally, so the two can never disagree.
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
      // One line, ~40px tall. It was a two-line card and the second line was
      // a label repeating a word the header already says; the vertical space
      // it gave back goes to the pitch, which is now the dominant column.
      className="glass-panel flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl px-3.5 py-2"
    >
      <span className="shrink-0 text-kicker font-semibold uppercase tracking-[0.14em] text-on-surface-variant/75">
        {t('title')}
      </span>
      <span className="shrink-0 text-body font-semibold text-on-surface">
        {isLoading ? t('loading') : error ? t('unavailable') : name}
      </span>
      <span aria-hidden className="hidden h-3 w-px shrink-0 bg-white/10 sm:block" />

      {/* The tally only earns its space once a tactic is chosen: with no
          tactic every family reads 0 and the row is seven zeroes of noise
          above the pitch. */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {teamTactic && tally && table ? (
          <LineupFamilyTally tally={tally} familyOrder={table.familyOrder} needed={needed} />
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {showMissing ? (
          <span className="text-label font-medium text-tertiary">
            {check.missing
              .map((m) => t('missing', { need: m.need - m.have, families: m.families.join('/') }))
              .join(' · ')}
          </span>
        ) : teamTactic ? (
          <span className="inline-flex items-center gap-1 text-label font-medium text-primary">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary" />
            {t('satisfied')}
          </span>
        ) : (
          <span className="text-label text-on-surface-variant/75">{t('noneHint')}</span>
        )}
        {isLocked ? (
          <span className="rounded bg-white/6 px-1.5 py-0.5 text-kicker font-semibold uppercase tracking-wider text-on-surface-variant">
            {t('locked')}
          </span>
        ) : null}
      </div>
    </section>
  );
}
