'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AppIcon } from '@/components/icons/AppIcon';
import { InjuryBadge } from '@/components/player/InjuryBadge';
import { Tooltip } from '@/components/ui/Tooltip';
import { SpecialtyIcon } from '@/components/player/SpecialtyIcon';
import { conditionToneClass } from '@/lib/condition-tone';
import { getSpecialtyLabel } from '@/lib/specialties';
import type { Player } from '@/lib/api';

interface SquadPlayerRowProps {
  player: Player;
  isSelected: boolean;
  locale: string;
  onSelect: (player: Player) => void;
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
 * The row selects the player; the NAME is its own link into the full profile,
 * which is the thing people try to click before they learn about the detail
 * pane. A `<div role="button">` rather than a real `<button>` because a button
 * may not contain a link — and the name really does have to be a link.
 */
export function SquadPlayerRow({ player, isSelected, locale, onSelect }: SquadPlayerRowProps) {
  const t = useTranslations();
  const isGk = player.isGoalkeeper;
  // Goalkeepers are flagged by an icon beside the name instead of a "GK" word in
  // the meta line, where it competed with the age and condition figures for space.
  const position = isGk ? '' : (player.position ?? '').toUpperCase();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(player)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(player);
        }
      }}
      aria-pressed={isSelected}
      className={`group flex w-full cursor-pointer items-center gap-tight rounded-xl border px-tight py-2 text-left transition-colors duration-quick ${
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
        <span className="flex items-center gap-1.5">
          <Link
            href={`/${locale}/players/${player.id}`}
            onClick={(event) => event.stopPropagation()}
            className="truncate text-title font-semibold text-on-surface transition-colors duration-quick hover:text-primary hover:underline"
          >
            {player.name}
          </Link>
          {isGk ? (
            <Tooltip label={t('squad.gkHint')}>
              <span
                className="flex h-[18px] w-[18px] shrink-0 items-center justify-center text-primary/70"
                aria-label={t('squad.gkHint')}
              >
                <AppIcon name="pan_tool" className="text-base" />
              </span>
            </Tooltip>
          ) : null}
          {player.coreSpecialty ? (
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center ${
                player.coreSpecialtyTier === 'GOLD'
                  ? 'text-tertiary'
                  : player.coreSpecialtyTier === 'SILVER'
                    ? 'text-on-surface-variant'
                    : 'text-outline'
              }`}
              title={getSpecialtyLabel(player.coreSpecialty, locale === 'en' ? 'en' : 'zh')}
            >
              <SpecialtyIcon code={player.coreSpecialty} tier={player.coreSpecialtyTier} size="lg" />
            </span>
          ) : null}
          {player.onTransfer ? (
            <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center text-secondary">
              <AppIcon name="swap_horiz" className="text-base" label={t('squad.transfer.listed')} />
            </span>
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
    </div>
  );
}
