'use client';

/**
 * TeamTacticPicker.tsx — the five tactics plus "no tactic".
 *
 * Anyone can SELECT any tactic. The lineup gate is a submission gate, not a
 * selection gate: refusing the click meant the player had to work out for
 * themselves which slots the tactic wanted before they were allowed to look at
 * it, while the only place that said so was the card they could not press. Now
 * the card can be chosen in any state, the shortfall is reported under the
 * grid, and the submit button is what refuses — with the same sentence.
 *
 * The slot requirement is on hover/focus instead of printed on every card.
 * Five lines of `CM×3 AM/W×1` at rest drowned the five names, which are the
 * thing being compared; the requirement only matters once the pointer is on a
 * card. The selected card shows its own requirement permanently, because a
 * touch device has no hover and the selection is exactly what needs checking.
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

  if (isLoading) {
    return <p className="text-label text-on-surface-variant/75">{t('loading')}</p>;
  }
  if (error) {
    return <p className="text-label text-tertiary">{t('unavailable')}</p>;
  }

  /** "CM×3 AM/W×1" — the slot requirement, shown on hover and while selected. */
  const requirementText = (code: string): string => {
    const definition = table?.tactics.find((d) => d.code === code);
    if (!definition) return '';
    return definition.requirements
      .map((r) => `${r.families.join('/')}×${r.count}`)
      .join('  ');
  };

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
          label={t('none')}
          requirement="—"
          isActive={value === null}
          isUnmet={false}
          disabled={disabled}
          onClick={() => onChange(null)}
          testId="team-tactic-none"
        />
        {TEAM_TACTIC_CODES.map((code) => {
          const reason = unmet.get(code);
          return (
            <TacticCard
              key={code}
              label={t(`codes.${code}`)}
              requirement={requirementText(code)}
              isActive={value === code}
              isUnmet={Boolean(reason)}
              unmetLabel={reason}
              disabled={disabled}
              onClick={() => onChange(code)}
              testId={`team-tactic-${code}`}
            />
          );
        })}
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
  label: string;
  requirement: string;
  isActive: boolean;
  isUnmet: boolean;
  unmetLabel?: string;
  disabled: boolean;
  onClick: () => void;
  testId: string;
}

function TacticCard({
  label,
  requirement,
  isActive,
  isUnmet,
  unmetLabel,
  disabled,
  onClick,
  testId,
}: TacticCardProps) {
  // One dot slot in the corner: the shortfall outranks the selection, because
  // "this is what you picked" is already legible from the card's fill.
  const dot = isUnmet ? 'bg-tertiary' : isActive ? 'bg-primary' : null;

  return (
    <button
      type="button"
      role="radio"
      aria-checked={isActive}
      aria-disabled={disabled}
      title={unmetLabel ?? undefined}
      onClick={() => !disabled && onClick()}
      data-testid={testId}
      className={[
        'group relative flex flex-col items-start rounded-lg border px-3 py-2.5 text-left',
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
      <span className="flex w-full items-start justify-between gap-2">
        <span className="font-headline text-body font-bold leading-tight">{label}</span>
        {dot ? (
          <span aria-hidden className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
        ) : null}
      </span>

      {/* Reserved height, not conditional rendering: hiding the line would make
          every card change height on hover and shove its neighbours. */}
      <span
        className={[
          'mt-1 block w-full truncate font-label text-kicker uppercase tracking-[0.12em] tabular-nums',
          'transition-[opacity,color] duration-quick',
          isUnmet ? 'text-tertiary' : isActive ? 'text-primary/85' : 'text-on-surface-variant/70',
          isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
        ].join(' ')}
      >
        {requirement || '—'}
      </span>
    </button>
  );
}
