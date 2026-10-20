'use client';

import { useTranslations } from 'next-intl';
import { AppIcon } from '@/components/icons/AppIcon';
import { InjuryBadge } from '@/components/player/InjuryBadge';
import { SpecialtyIcon } from '@/components/player/SpecialtyIcon';
import { getSpecialtyLabel } from '@/lib/specialties';
import type { Player } from '@/lib/api';

interface SquadPlayerRowProps {
  player: Player;
  isSelected: boolean;
  locale: string;
  onSelect: (player: Player) => void;
}

/** Colour for a 0-6 stamina / 0-5 form value, shared with the detail pane. */
export function conditionToneClass(value: number, good: number, ok: number): string {
  if (value >= good) return 'text-primary';
  if (value >= ok) return 'text-tertiary';
  return 'text-error';
}

function initialsOf(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * One row in the squad list.
 *
 * Deliberately a `<button>`, not a div with a nested `<Link>`: the row's only
 * job is "select this player", and a link inside a clickable row is both
 * invalid HTML (a button cannot contain one) and a second target in a 56px
 * strip. The profile link lives in the detail pane, where there is room to
 * label it.
 */
export function SquadPlayerRow({ player, isSelected, locale, onSelect }: SquadPlayerRowProps) {
  const t = useTranslations();
  const isGk = player.isGoalkeeper;
  const position = isGk ? 'GK' : (player.position ?? '').toUpperCase();

  return (
    <button
      type="button"
      onClick={() => onSelect(player)}
      aria-current={isSelected ? 'true' : undefined}
      className={`group flex w-full items-center gap-tight rounded-xl border px-tight py-2 text-left transition-colors duration-quick ${
        isSelected
          ? 'border-primary/30 bg-primary/10'
          : 'border-transparent hover:border-white/[0.06] hover:bg-white/[0.04]'
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-headline text-label font-bold transition-colors duration-quick ${
          isSelected
            ? 'bg-primary/20 text-primary'
            : 'bg-surface-container-high text-on-surface-variant group-hover:text-on-surface'
        }`}
      >
        {initialsOf(player.name)}
      </span>

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-micro">
          <span className="truncate text-title font-semibold text-on-surface">{player.name}</span>
          {player.coreSpecialty ? (
            <span
              className={`shrink-0 ${
                player.coreSpecialtyTier === 'GOLD'
                  ? 'text-tertiary'
                  : player.coreSpecialtyTier === 'SILVER'
                    ? 'text-on-surface-variant'
                    : 'text-outline'
              }`}
              title={getSpecialtyLabel(player.coreSpecialty, locale === 'en' ? 'en' : 'zh')}
            >
              <SpecialtyIcon code={player.coreSpecialty} tier={player.coreSpecialtyTier} size="sm" />
            </span>
          ) : null}
          {player.onTransfer ? (
            <AppIcon name="sell" className="shrink-0 text-kicker text-secondary" label={t('squad.transfer.listed')} />
          ) : null}
          <InjuryBadge
            player={player}
            estimatedDays={Math.ceil((player.currentInjuryValue ?? 0) / 8)}
          />
        </span>

        <span className="mt-0.5 flex items-center gap-tight font-label text-kicker uppercase tracking-[0.08em] text-on-surface-variant/75">
          {position ? <span className="text-outline">{position}</span> : null}
          {position ? <span className="text-outline/50">·</span> : null}
          <span className="tabular-nums normal-case tracking-normal">
            {t('common.ageFormat', { y: player.age, d: player.ageDays })}
          </span>
          <span className="h-2.5 w-px bg-outline-variant/50" />
          <span className="tabular-nums normal-case tracking-normal">
            <span className="text-outline">{t('squad.stamina')}</span>{' '}
            <span className={conditionToneClass(player.stamina, 4, 2)}>{Math.round(player.stamina)}</span>
          </span>
          <span className="tabular-nums normal-case tracking-normal">
            <span className="text-outline">{t('squad.form')}</span>{' '}
            <span className={conditionToneClass(player.form, 4, 2)}>{Math.round(player.form)}</span>
          </span>
        </span>
      </span>

      <span className="shrink-0 text-right">
        <span className="block font-headline text-lg font-black leading-none tabular-nums text-on-surface">
          {player.overall}
        </span>
        <span className="mt-0.5 block font-label text-kicker tabular-nums text-outline">
          {t('common.currencySymbol')}
          {(player.currentWage || 0).toLocaleString()}
        </span>
      </span>
    </button>
  );
}
