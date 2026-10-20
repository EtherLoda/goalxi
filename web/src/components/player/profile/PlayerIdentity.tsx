'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { SpecialtyIcon } from '@/components/player/SpecialtyIcon';
import { getSpecialtyLabel } from '@/lib/specialties';
import type { Player } from '@/lib/api';
import { initialsOf, MetaCell } from './player-profile-primitives';

interface PlayerIdentityProps {
  player: Player;
  locale: string;
  /** Rendered as a link when set; the profile page leaves it unset (you are already there). */
  nameHref?: string;
  /** Jersey tint for the avatar wash. Falls back to the club green. */
  accentColor?: string | null;
  /** Position / transfer / youth chips, supplied by the screen that knows which matter. */
  chips?: ReactNode;
  /** Where the club chip should navigate. Omitted = rendered as plain text. */
  clubHref?: string;
  /** Right-aligned action cluster. */
  actions?: ReactNode;
}

/**
 * The player header: portrait, name, specialty, chips and the four-cell meta
 * strip. Shared by the squad detail pane and the full profile page so a player
 * cannot look like two different people depending on which screen you opened.
 */
export function PlayerIdentity({
  player,
  locale,
  nameHref,
  accentColor,
  chips,
  actions,
  clubHref,
}: PlayerIdentityProps) {
  const t = useTranslations();
  const lang: 'en' | 'zh' = locale === 'en' ? 'en' : 'zh';
  const accent = accentColor ?? '#00e479';
  const initials = useMemo(() => initialsOf(player.name), [player.name]);
  const overall = player.overall ?? player.pwi ?? 0;
  const clubLabel = player.teamName ?? t('player_profile.freeAgent');

  const nameClass =
    'font-headline text-2xl font-black leading-none tracking-tight text-on-surface';

  return (
    <div className="flex flex-col gap-gutter p-panel sm:flex-row sm:items-start">
      <div
        className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border border-white/[0.08] font-headline text-3xl font-black text-on-surface"
        style={{ background: `linear-gradient(135deg, ${accent}26, ${accent}0a)` }}
        aria-hidden="true"
      >
        {initials}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-tight">
        <div className="flex flex-wrap items-center gap-tight">
          {nameHref ? (
            <Link
              href={nameHref}
              className={`${nameClass} transition-colors duration-quick hover:text-primary`}
            >
              {player.name}
            </Link>
          ) : (
            <h1 className={nameClass}>{player.name}</h1>
          )}
          {/* The id is the only stable way for a player to say "this one" in a
              support request or to a friend; the name is not unique. */}
          <span
            aria-label={`${t('player_profile.playerId')} ${player.id}`}
            className="rounded-md border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 font-label text-kicker font-bold tabular-nums tracking-[0.04em] text-outline"
          >
            #{player.id}
          </span>
          {player.coreSpecialty ? (
            <span
              className={`inline-flex items-center gap-micro font-label text-label font-bold ${
                player.coreSpecialtyTier === 'GOLD'
                  ? 'text-tertiary'
                  : player.coreSpecialtyTier === 'SILVER'
                    ? 'text-on-surface-variant'
                    : 'text-outline'
              }`}
            >
              <SpecialtyIcon code={player.coreSpecialty} tier={player.coreSpecialtyTier} size="md" />
              {getSpecialtyLabel(player.coreSpecialty, lang)}
            </span>
          ) : null}
        </div>

        {/* The club is part of who the player is, not decoration: it sits in
            the chip row so "which team does he play for" is answerable without
            opening the squad list. */}
        <div className="flex flex-wrap items-center gap-tight">
          <span className="inline-flex items-center gap-micro rounded-full border border-white/[0.08] bg-white/[0.04] px-tight py-micro font-label text-kicker">
            <span className="uppercase tracking-[0.08em] text-outline">
              {t('player_profile.club')}
            </span>
            {clubHref ? (
              <Link
                href={clubHref}
                className="font-bold text-on-surface transition-colors duration-quick hover:text-primary"
              >
                {clubLabel}
              </Link>
            ) : (
              <span className="font-bold text-on-surface">{clubLabel}</span>
            )}
          </span>
          {chips}
        </div>

        <div className="mt-tight grid grid-cols-3 gap-x-gutter gap-y-tight">
          <MetaCell label={t('squad.age')}>
            {t('common.ageFormat', { y: player.age, d: player.ageDays })}
          </MetaCell>
          <MetaCell label={t('squad.wage')}>
            <span className="text-secondary">
              {t('common.currencySymbol')}
              {(player.currentWage || 0).toLocaleString()}
            </span>
          </MetaCell>
          <MetaCell label={t('squad.overall')}>
            <span className="text-primary">{overall.toLocaleString()}</span>
          </MetaCell>
        </div>
      </div>

      {actions ? <div className="flex shrink-0 items-center gap-tight">{actions}</div> : null}
    </div>
  );
}
