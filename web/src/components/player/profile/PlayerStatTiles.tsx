'use client';

import { useTranslations } from 'next-intl';
import { conditionToneClass } from '@/lib/condition-tone';
import type { Player } from '@/lib/api';
import { StatTile } from './player-profile-primitives';

/**
 * The three-up condition strip: 体能 / 状态 / 潜力.
 *
 * Thresholds are the squad row's (≥4 reads strong, ≥2 reads playable), so a
 * player is the same colour here as in the list you clicked to get here.
 */
export function PlayerStatTiles({ player }: { player: Player }) {
  const t = useTranslations();

  return (
    <div className="flex min-w-0 flex-1 gap-tight">
      <StatTile
        label={t('squad.stamina')}
        value={Math.round(player.stamina)}
        suffix="/6"
        tone={conditionToneClass(player.stamina, 4, 2)}
      />
      <StatTile
        label={t('squad.form')}
        value={Math.round(player.form)}
        suffix="/5"
        tone={conditionToneClass(player.form, 4, 2)}
      />
      <StatTile
        label={t('squad.potential')}
        value={player.potentialAbility || 0}
        suffix="/100"
        tone="text-primary"
      />
    </div>
  );
}
