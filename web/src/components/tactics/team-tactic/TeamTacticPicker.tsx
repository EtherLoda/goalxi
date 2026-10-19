'use client';

/**
 * TeamTacticPicker.tsx — the five tactics plus the default.
 *
 * Anyone can SELECT any tactic. The lineup gate is a submission gate, not a
 * selection gate: refusing the click meant the player had to work out for
 * themselves which slots the tactic wanted before they were allowed to look at
 * it, while the only place that said so was the card they could not press. Now
 * the card can be chosen in any state, the shortfall is reported under the
 * grid, and the submit button is what refuses — with the same sentence.
 *
 * A card is an icon and a name. Printing `CM×3 AM/W×1` on every card turned
 * six decisions into five lines of slot arithmetic that the player had to parse
 * before they could compare names; the requirement is a consequence of the
 * choice, not the choice. It still reaches the player three other ways: the
 * native tooltip on the card, the tally row underneath, and the shortfall line
 * once the tactic is selected.
 */
import { useTranslations } from 'next-intl';
import { AppIcon } from '@/components/icons/AppIcon';
import type { PositionFamilyCode } from '@/lib/api';
import {
  TEAM_TACTIC_CODES,
  type LineupMap,
  type TeamTacticCodeValue,
} from '../types';
import { checkTactic, tallyFamilies } from './requirement';
import { LineupFamilyTally } from './LineupFamilyTally';
import { TacticIcon } from './tactic-icon';
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

  /** "unmet" per code, computed once so every card renders from one pass. */
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

  /** "CM×3 AM/W×1" — tooltip only now. */
  const requirementText = (code: string): string => {
    const definition = table?.tactics.find((d) => d.code === code);
    if (!definition) return '';
    return definition.requirements
      .map((r) => `${r.families.join('/')}×${r.count}`)
      .join('  ');
  };

  if (isLoading) {
    return <p className="text-label text-on-surface-variant/75">{t('loading')}</p>;
  }
  if (error) {
    return <p className="text-label text-tertiary">{t('unavailable')}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        role="radiogroup"
        aria-label={t('title')}
        // Six equal cards, three to a row. Equal width is the point: an inline
        // row made 双翼齐飞 narrow and 中路渗透 wide, which reads as a ranking.
        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
      >
        <TacticCard
          code={null}
          label={t('none')}
          hint={t('noneHint')}
          isActive={value === null}
          isUnmet={false}
          disabled={disabled}
          onClick={() => onChange(null)}
          testId="team-tactic-none"
        />
        {TEAM_TACTIC_CODES.map((code) => (
          <TacticCard
            key={code}
            code={code}
            label={t(`codes.${code}`)}
            hint={requirementText(code)}
            unmetLabel={unmet.get(code)}
            isActive={value === code}
            isUnmet={unmet.has(code)}
            disabled={disabled}
            onClick={() => onChange(code)}
            testId={`team-tactic-${code}`}
          />
        ))}
      </div>

      {tally && table ? (
        <LineupFamilyTally tally={tally} familyOrder={table.familyOrder} needed={needed} />
      ) : null}

      {value === null ? (
        <p className="text-label leading-relaxed text-on-surface-variant/75">{t('noneHint')}</p>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-label leading-relaxed text-on-surface-variant/75">
            {t(`desc.${value}`)}
          </p>
          {unmet.get(value) ? (
            <p className="flex items-start gap-1.5 text-label font-medium text-tertiary">
              <AppIcon name="error" className="mt-px shrink-0 text-[12px]" />
              <span className="min-w-0">{t('shortfall', { detail: unmet.get(value) ?? '' })}</span>
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-label font-medium text-primary">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary" />
              {t('satisfied')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

interface TacticCardProps {
  code: TeamTacticCodeValue | null;
  label: string;
  /** Tooltip text: the slot requirement, or the neutral note for the default. */
  hint: string;
  unmetLabel?: string;
  isActive: boolean;
  isUnmet: boolean;
  disabled: boolean;
  onClick: () => void;
  testId: string;
}

function TacticCard({
  code,
  label,
  hint,
  unmetLabel,
  isActive,
  isUnmet,
  disabled,
  onClick,
  testId,
}: TacticCardProps) {
  const title = [hint, unmetLabel].filter(Boolean).join(' · ') || undefined;

  return (
    <button
      type="button"
      role="radio"
      aria-checked={isActive}
      aria-disabled={disabled}
      title={title}
      onClick={() => !disabled && onClick()}
      data-testid={testId}
      className={[
        'group flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left',
        'transition-[border-color,background-color,box-shadow,transform] duration-quick',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
        isActive
          ? 'border-primary/45 bg-primary/12 text-primary shadow-[inset_0_0_0_1px_rgba(0,228,121,0.22)]'
          : 'border-white/8 bg-white/[0.04] text-on-surface-variant',
        disabled
          ? 'cursor-not-allowed opacity-60'
          : !isActive &&
            'hover:-translate-y-px hover:border-primary/35 hover:bg-white/[0.07] hover:text-on-surface hover:shadow-[0_10px_24px_-16px_rgba(0,228,121,0.65)]',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* The icon carries the tactical shape; gold overrides green because a
          shortfall is the one thing the player must act on. */}
      <TacticIcon
        code={code}
        className={
          isUnmet ? 'text-tertiary' : isActive ? 'text-primary' : 'text-on-surface-variant/70'
        }
      />
      <span className="font-headline text-body font-bold leading-tight">{label}</span>
    </button>
  );
}
