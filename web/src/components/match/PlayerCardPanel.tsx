'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { AppIcon } from '@/components/icons/AppIcon';
import { PlayerStatTiles } from '@/components/player/profile/PlayerStatTiles';
import { initialsOf } from '@/components/player/profile/player-profile-primitives';
import { SpecialtyIcon } from '@/components/player/SpecialtyIcon';
import { getSpecialtyLabel } from '@/lib/specialties';
import { api, type Player } from '@/lib/api';
import { usePlayerCardOptional } from './player-card-context';

/**
 * The rail's player card.
 *
 * Opened by clicking a player's name on the pitch, in the commentary or in
 * the highlights list; it replaces the match panels in the right rail until
 * dismissed. Deliberately a summary, not a second profile page: enough to
 * answer "who is this and how is he doing" without leaving the match, plus
 * two ways onward (player page, club page).
 */
interface CardState {
  /** Which player the payload belongs to; guards against out-of-order fetches. */
  readonly id: number;
  readonly player: Player | null;
  readonly failed: boolean;
}

export function PlayerCardPanel() {
  const t = useTranslations('matchPlayerCard');
  const context = usePlayerCardOptional();
  const playerId = context?.playerId ?? null;
  const [state, setState] = useState<CardState | null>(null);

  useEffect(() => {
    if (playerId == null) return;
    let cancelled = false;
    api.players
      .getById(playerId)
      .then((player) => {
        if (!cancelled) setState({ id: playerId, player, failed: false });
      })
      .catch(() => {
        if (!cancelled) setState({ id: playerId, player: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  // Stale payloads are impossible to show: the id is part of the state.
  const settled = state && state.id === playerId ? state : null;
  const player = settled?.player ?? null;

  return (
    <div
      className="glass-panel rounded-2xl p-4 flex flex-col gap-3"
      data-testid="player-card"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-headline font-bold text-kicker uppercase tracking-widest text-primary/80 flex items-center gap-2">
          <AppIcon name="person" className="text-base" />
          {t('title')}
        </h3>
        <button
          type="button"
          onClick={() => context?.closePlayer()}
          aria-label={t('close')}
          title={t('close')}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/10 text-on-surface-variant transition-colors hover:border-white/20 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <AppIcon name="close" className="text-sm" />
        </button>
      </div>

      {!settled && (
        <div className="flex flex-col gap-2" aria-busy="true">
          <div className="h-12 w-12 animate-pulse rounded-xl bg-white/[0.06]" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-white/[0.06]" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-white/[0.06]" />
        </div>
      )}

      {settled?.failed && (
        <p className="text-label text-on-surface-variant/70">{t('missing')}</p>
      )}

      {player && <PlayerCardContent player={player} />}
    </div>
  );
}

/**
 * The card body. Split out of the panel so it can be rendered with any
 * `Player` — the dev harness uses it to check the layout against real data
 * without a browser-side fetch.
 */
export function PlayerCardContent({ player }: { player: Player }) {
  const t = useTranslations('matchPlayerCard');
  const locale = useLocale();
  const specLocale = locale === 'en' ? 'en' : 'zh';

  return (
    <>
      <div className="flex items-start gap-3">
        <div
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] font-headline text-title font-black text-on-surface"
          style={{ background: 'linear-gradient(135deg, #00e47926, #00e4790a)' }}
        >
          {initialsOf(player.name)}
        </div>
        <div className="min-w-0 flex-1">
          <Link
            href={`/${locale}/players/${player.id}`}
            className="block truncate font-headline text-title font-bold text-on-surface transition-colors hover:text-primary"
          >
            {player.name}
          </Link>
          {player.position && (
            <div className="mt-0.5 font-label text-kicker uppercase tracking-[0.14em] text-outline">
              {player.position}
            </div>
          )}
        </div>
      </div>

      {player.teamName && (
        <Link
          href={player.teamId ? `/${locale}/teams/${player.teamId}` : `/${locale}/teams`}
          className="inline-flex max-w-full items-center gap-1.5 self-start rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 transition-colors hover:border-white/20"
        >
          <span className="font-label text-kicker uppercase tracking-[0.08em] text-outline">
            {t('club')}
          </span>
          <span className="truncate font-label text-label font-bold text-on-surface">
            {player.teamName}
          </span>
        </Link>
      )}

      <div className="border-t border-white/[0.07]" />

      <dl className="flex flex-col gap-1">
        <CardRow label={t('age')} value={t('ageValue', { y: player.age, d: player.ageDays ?? 0 })} />
        <CardRow
          label={t('wage')}
          value={t('wageValue', { amount: Math.round(player.currentWage ?? 0).toLocaleString() })}
        />
        <CardRow label={t('potential')} value={String(player.potentialAbility ?? '—')} />
        {player.coreSpecialty && (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="font-label text-kicker uppercase tracking-[0.12em] text-muted">
              {t('specialty')}
            </dt>
            <dd className="flex items-center gap-1 font-label text-label font-semibold text-tertiary">
              <SpecialtyIcon code={player.coreSpecialty} tier={player.coreSpecialtyTier} size="sm" />
              {getSpecialtyLabel(player.coreSpecialty, specLocale)}
            </dd>
          </div>
        )}
      </dl>

      <div className="border-t border-white/[0.07]" />

      <PlayerStatTiles player={player} />

      <Link
        href={`/${locale}/players/${player.id}`}
        className="mt-0.5 inline-flex items-center gap-1 self-start font-label text-label font-semibold text-primary transition-colors hover:text-primary/80"
      >
        {t('viewProfile')}
        <AppIcon name="arrow_forward" className="text-sm" />
      </Link>
    </>
  );
}

function CardRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="font-label text-kicker uppercase tracking-[0.12em] text-muted">{label}</dt>
      <dd className="font-label text-label font-semibold tabular-nums text-on-surface">{value}</dd>
    </div>
  );
}
