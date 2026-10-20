'use client';

import { useTranslations } from 'next-intl';
import { conditionToneClass } from '@/lib/condition-tone';
import type { Player } from '@/lib/api';
import { StatTile } from './player-profile-primitives';

/**
 * Condition values run 0–5.99 in the engine (`STAMINA_MAX` = 5.99). Rounding
 * alone would print "6/5" for a maxed player, so both tiles clamp to the
 * five-point scale the player actually thinks in: 5.99 reads 5/5, and the
 * dot positions on the pitch agree with the number here.
 */
function conditionPoints(value: number): number {
  return Math.min(5, Math.max(0, Math.round(value)));
}

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
        value={conditionPoints(player.stamina)}
        suffix="/5"
        tone={conditionToneClass(player.stamina, 4, 2)}
      />
      <StatTile
        label={t('squad.form')}
        value={conditionPoints(player.form)}
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
