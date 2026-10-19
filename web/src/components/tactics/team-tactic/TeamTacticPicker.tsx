'use client';

/**
 * TeamTacticPicker.tsx — the five tactics plus "no tactic".
 *
 * The gate is HARD: a lineup that cannot field a tactic makes that chip
 * unavailable rather than showing a "partially applied" state. Two reasons
 * it is a chip row and not a dropdown:
 *
 *  - the requirement is a slot count, and the count is right next to it, so
 *    the player can see *why* a chip is grey;
 *  - a dropdown hides four of the five options behind a click, and these are
 *    five comparable choices, not a long list.
 *
 * Every chip stays focusable even when unavailable (`aria-disabled` rather
 * than `disabled`) so a keyboard or screen-reader user can reach the reason
 * instead of having the option silently vanish from the tab order.
 */
import { useTranslations } from 'next-intl';
import type { PositionFamilyCode } from '@/lib/api';
import {
  TEAM_TACTIC_CODES,
  type LineupMap,
  type TeamTacticCodeValue,
} from '../types';
import { checkTactic, tallyFamilies } from './requirement';
import { LineupFamilyTally } from './LineupFamilyTally';
import type { TeamTacticsTable } from './use-team-tactics';

export interface TeamTacticPickerProps {
  value: TeamTacticCodeValue | null;
  lineup: LineupMap;
  table: TeamTacticsTable | null;
  isLoading: boolean;
  error: string | null;
  disabled: boolean;
  onChange: (tactic: TeamTacticCodeValue | null) => void;
}

export function TeamTacticPicker({
  value,
  lineup,
  table,
  isLoading,
  error,
  disabled,
  onChange,
}: TeamTacticPickerProps) {
  const t = useTranslations('tactics.teamTactic');

  const tally = table ? tallyFamilies(lineup, table.families) : null;
  const selected = table?.tactics.find((d) => d.code === value);
  const needed = new Set<PositionFamilyCode>();
  for (const requirement of selected?.requirements ?? []) {
    for (const family of requirement.families) needed.add(family);
  }

  /** "unmet" per code, computed once so every chip renders from one pass. */
  const unmet = new Map<string, string>();
  for (const code of TEAM_TACTIC_CODES) {
    const check = checkTactic(lineup, code, table);
    if (!check.ok) {
      unmet.set(
        code,
        check.missing
          .map((m) => t('missing', { need: m.need - m.have, families: m.families.join('/') }))
          .join(' · '),
      );
    }
  }

  if (isLoading) {
    return (
      <p className="text-[11px] text-on-surface-variant/60">{t('loading')}</p>
    );
  }
  if (error) {
    return <p className="text-[11px] text-tertiary">{t('unavailable')}</p>;
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={t('title')}>
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          aria-disabled={disabled}
          onClick={() => !disabled && onChange(null)}
          className={chipClass(value === null, false, disabled)}
          data-testid="team-tactic-none"
        >
          {t('none')}
        </button>
        {TEAM_TACTIC_CODES.map((code) => {
          const reason = unmet.get(code);
          const isBlocked = Boolean(reason);
          const isActive = value === code;
          return (
            <button
              key={code}
              type="button"
              role="radio"
              aria-checked={isActive}
              aria-disabled={disabled || isBlocked}
              title={isBlocked ? reason : undefined}
              onClick={() => {
                if (disabled) return;
                // A blocked tactic cannot be deployed. Clicking it is a
                // request for information, not a selection: the reason is
                // already on screen, so the click is a no-op.
                if (isBlocked) return;
                onChange(code);
              }}
              className={chipClass(isActive, isBlocked, disabled)}
              data-testid={`team-tactic-${code}`}
            >
              {t(`codes.${code}`)}
            </button>
          );
        })}
      </div>

      {tally && table ? (
        <LineupFamilyTally
          tally={tally}
          familyOrder={table.familyOrder}
          needed={needed}
        />
      ) : null}

      <p className="text-[11px] leading-relaxed text-on-surface-variant/75">
        {value === null ? t('noneHint') : t(`desc.${value}`)}
      </p>

      {value !== null && unmet.get(value) ? (
        <p className="text-[11px] font-medium text-tertiary">{unmet.get(value)}</p>
      ) : null}
    </div>
  );
}

function chipClass(isActive: boolean, isBlocked: boolean, disabled: boolean): string {
  const base =
    'rounded-lg px-2.5 py-1.5 text-[11px] font-label tracking-wide transition-colors duration-quick border';
  if (isBlocked) {
    return `${base} border-white/6 bg-white/3 text-on-surface-variant/40 cursor-not-allowed`;
  }
  if (disabled) {
    return `${base} border-white/6 bg-white/3 text-on-surface-variant/40 cursor-not-allowed`;
  }
  if (isActive) {
    return `${base} border-primary/40 bg-primary/15 text-primary`;
  }
  return `${base} border-white/8 bg-white/4 text-on-surface-variant hover:border-white/16 hover:text-on-surface`;
}
