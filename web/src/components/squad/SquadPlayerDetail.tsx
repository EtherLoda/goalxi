'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AppIcon } from '@/components/icons/AppIcon';
import { PlayerEventTimeline } from '@/components/player/profile/PlayerEventTimeline';
import { PlayerIdentity } from '@/components/player/profile/PlayerIdentity';
import { PlayerSkillGrid } from '@/components/player/profile/PlayerSkillGrid';
import { PlayerStatTiles } from '@/components/player/profile/PlayerStatTiles';
import type { Player, PlayerEvent } from '@/lib/api';

interface SquadPlayerDetailProps {
  player: Player;
  locale: string;
  events: readonly PlayerEvent[];
  jerseyColor?: string | null;
  /** Listing is only offered on your own squad and only while unlisted. */
  canList: boolean;
  onList: () => void;
}

/**
 * The right-hand pane of the squad screen: everything about one player without
 * leaving the list.
 *
 * The sections below are the same components the full player profile renders,
 * so the two screens cannot disagree about what a player looks like. What stays
 * local is the navigation: this pane links into the profile and offers "list
 * for sale" because you got here from your own squad.
 */
export function SquadPlayerDetail({
  player,
  locale,
  events,
  jerseyColor,
  canList,
  onList,
}: SquadPlayerDetailProps) {
  const t = useTranslations();
  const profileHref = `/${locale}/players/${player.id}`;

  return (
    <div className="flex flex-col">
      <PlayerIdentity
        player={player}
        locale={locale}
        nameHref={profileHref}
        accentColor={jerseyColor}
        chips={
          <>
            <span className="rounded-md border border-outline-variant/40 bg-surface-container-high px-1.5 py-0.5 font-label text-kicker font-bold uppercase tracking-[0.08em] text-on-surface-variant">
              {player.isGoalkeeper ? 'GK' : (player.position ?? '—').toUpperCase()}
            </span>
            {player.onTransfer ? (
              <span className="inline-flex items-center gap-micro rounded-md border border-secondary/30 bg-secondary/10 px-1.5 py-0.5 font-label text-kicker font-bold uppercase tracking-[0.08em] text-secondary">
                <AppIcon name="sell" className="text-kicker" />
                {t('squad.transfer.onTransfer')}
              </span>
            ) : null}
          </>
        }
      />

      <div className="flex flex-wrap items-stretch gap-tight px-panel pb-panel">
        <PlayerStatTiles player={player} />
        <div className="flex items-center gap-tight">
          <Link
            href={profileHref}
            className="inline-flex h-9 items-center gap-micro rounded-lg border border-outline-variant/40 px-tight font-label text-label font-bold text-on-surface-variant transition-colors duration-quick hover:border-outline hover:text-on-surface"
          >
            <AppIcon name="open_in_full" className="text-kicker" />
            {t('squad.fullProfile')}
          </Link>
          {canList ? (
            <button
              type="button"
              onClick={onList}
              className="inline-flex h-9 items-center gap-micro rounded-lg border border-primary/30 bg-primary/12 px-tight font-label text-label font-bold text-primary transition-colors duration-quick hover:bg-primary/20"
            >
              <AppIcon name="sell" className="text-kicker" />
              {t('squad.transfer.listPlayer')}
            </button>
          ) : null}
        </div>
      </div>

      <PlayerSkillGrid player={player} columns={4} />
      <PlayerEventTimeline events={events} />
    </div>
  );
}
