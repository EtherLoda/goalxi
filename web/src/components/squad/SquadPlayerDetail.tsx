'use client';

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
}

/**
 * The right-hand pane of the squad screen: everything about one player without
 * leaving the list.
 *
 * The sections below are the same components the full player profile renders,
 * so the two screens cannot disagree about what a player looks like. There is
 * no "open full profile" button: the player's NAME is the link, here and in
 * the list.
 */
export function SquadPlayerDetail({ player, locale, events, jerseyColor }: SquadPlayerDetailProps) {
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

      <div className="px-panel pb-panel">
        <PlayerStatTiles player={player} />
      </div>

      <PlayerSkillGrid player={player} columns={4} />
      <PlayerEventTimeline events={events} />
    </div>
  );
}
