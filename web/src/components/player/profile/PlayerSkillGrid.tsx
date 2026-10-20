'use client';

import { useTranslations } from 'next-intl';
import { SkillBar } from '@/components/player/PlayerStatsCard';
import { CATEGORY_BARS, CATEGORY_COLORS } from '@/components/player/skill-display';
import { groupSkills, readSkillPair, skillSpecsFor } from '@/components/player/skill-groups';
import type { Player } from '@/lib/api';
import { CATEGORY_ACCENT, groupTitleKey } from './player-profile-primitives';

interface PlayerSkillGridProps {
  player: Player;
  /**
   * 4 = one column per category, for the squad pane's wide split.
   * 2 = two up, for the profile page's narrower card. Below the breakpoint
   * both collapse to a single column.
   */
  columns?: 2 | 4;
}

/**
 * Every skill the position actually has, grouped by category, as current-against-
 * potential bars. The GK list reaches into the `technical` bucket for
 * reflexes/handling/aerial, which is a wire-format fact this deliberately keeps
 * in one place.
 */
export function PlayerSkillGrid({ player, columns = 4 }: PlayerSkillGridProps) {
  const t = useTranslations();
  const groups = groupSkills(skillSpecsFor(player.isGoalkeeper));
  const gridClass =
    columns === 4
      ? 'grid min-w-0 max-w-[980px] gap-x-gutter gap-y-panel sm:grid-cols-2 lg:grid-cols-4'
      : 'grid min-w-0 gap-x-gutter gap-y-panel sm:grid-cols-2';

  return (
    <div className="border-t border-outline-variant/30 p-panel">
      <div className={gridClass}>
        {groups.map((group) => (
          <div key={group.category} className="flex min-w-0 flex-col gap-tight">
            <div className="flex items-center gap-micro">
              <span className={`h-3 w-1 rounded-full ${CATEGORY_ACCENT[group.category]}`} />
              <span className="font-label text-kicker font-bold uppercase tracking-[0.12em] text-on-surface-variant">
                {t(`squad.skills.${groupTitleKey(group.category, player.isGoalkeeper)}`)}
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {group.specs.map((spec) => {
                const pair = readSkillPair(player.currentSkills, player.potentialSkills, spec);
                return (
                  <div key={spec.key} className="max-w-[240px]">
                    <SkillBar
                      label={t(`squad.skills.${spec.key}`)}
                      current={pair.current}
                      potential={pair.potential}
                      colorClass={CATEGORY_COLORS[group.category]}
                      barClass={CATEGORY_BARS[group.category]}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
