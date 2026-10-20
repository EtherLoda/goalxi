/**
 * player-profile-primitives.tsx — the small pieces the player surfaces share.
 *
 * The squad detail pane and the full player profile render the same player
 * twice, from two different screens. They used to own private copies of the
 * initials helper, the meta cell, the stat tile, the category accent and the
 * event icon map; the copies drifted, which is why the profile page showed
 * `PWI` where the squad page showed `综合`, and why its empty events box was a
 * 200px dashed panel while the squad's was a single muted line.
 *
 * Nothing here is specific to either screen. Anything that needs a translation
 * call or a route stays in the component that owns it.
 */

import { AppIcon, type MaterialIconName } from '@/components/icons/AppIcon';
import { KickerLabel } from '@/components/ui/KickerLabel';
import { Tooltip } from '@/components/ui/Tooltip';
import type { SkillCategoryKey } from '@/components/player/skill-groups';

export function initialsOf(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** One "label above value" cell used in the identity meta strip. */
export function MetaCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-micro">
      <KickerLabel>{label}</KickerLabel>
      <span className="truncate font-headline text-body font-bold text-on-surface">{children}</span>
    </div>
  );
}

/** Big number + caption used in the three-up condition strip. */
export function StatTile({
  label,
  value,
  suffix,
  tone = 'text-on-surface',
  tooltip,
}: {
  label: string;
  value: React.ReactNode;
  suffix?: string;
  tone?: string;
  /** Raw value behind the words, revealed on hover. */
  tooltip?: React.ReactNode;
}) {
  return (
    <Tooltip label={tooltip} className="flex-1">
      <div className="flex w-full flex-col items-center gap-micro rounded-xl bg-surface-container/60 px-tight py-2">
        <span
          className={`font-headline text-xl font-black leading-none tabular-nums ${tone}`}
        >
          {value}
          {suffix ? (
            <span className="ml-0.5 font-label text-kicker font-bold text-outline">{suffix}</span>
          ) : null}
        </span>
        <KickerLabel>{label}</KickerLabel>
      </div>
    </Tooltip>
  );
}

/** The 4px bar that heads a skill group, coloured by category. */
export const CATEGORY_ACCENT: Record<SkillCategoryKey, string> = {
  physical: 'bg-accent',
  technical: 'bg-signal-blue',
  mental: 'bg-signal-lilac',
  setPieces: 'bg-signal-gold',
};

/**
 * `squad.skills.*` mixes skill keys and four category-title keys in one
 * namespace, so the group heading needs its own lookup. Goalkeepers keep
 * reflexes/handling/aerial in the `technical` bucket, and the copy for that
 * group is "goalkeeper skills" — that is the only per-position branch.
 */
export function groupTitleKey(category: SkillCategoryKey, isGoalkeeper: boolean): string {
  switch (category) {
    case 'physical':
      return 'physicalAttributes';
    case 'technical':
      return isGoalkeeper ? 'goalkeeperSkills' : 'technicalSkills';
    case 'mental':
      return 'mentalProfile';
    case 'setPieces':
      return 'setPieces';
  }
}

export const EVENT_ICONS: Record<string, MaterialIconName> = {
  TRANSFER: 'swap_horiz',
  YOUTH_PROMOTION: 'trending_up',
  HAT_TRICK: 'sports_kabaddi',
  CHAMPIONSHIP_TITLE: 'emoji_events',
  GOLDEN_BOOT: 'military_tech',
  ASSISTS_LEADER: 'assist_hand',
  TACKLES_LEADER: 'shield',
  MAN_OF_THE_MATCH: 'star',
  INJURY: 'local_hospital',
  DEBUT: 'play_circle',
  LEAGUE_DEBUT: 'stadium',
  CAPTAIN_DEBUT: 'captain',
  RECORD_BROKEN: 'record_voice_over',
  CONTRACT_RENEWAL: 'renewal',
};

export const EVENT_COLORS: Record<string, string> = {
  TRANSFER: 'text-signal-blue',
  YOUTH_PROMOTION: 'text-positive-bright',
  HAT_TRICK: 'text-signal-gold',
  CHAMPIONSHIP_TITLE: 'text-signal-amber',
  GOLDEN_BOOT: 'text-signal-gold',
  ASSISTS_LEADER: 'text-signal-blue',
  TACKLES_LEADER: 'text-positive-bright',
  MAN_OF_THE_MATCH: 'text-signal-magenta',
  INJURY: 'text-error',
  DEBUT: 'text-signal-violet',
  LEAGUE_DEBUT: 'text-signal-violet',
  CAPTAIN_DEBUT: 'text-signal-gold',
  RECORD_BROKEN: 'text-signal-cyan',
  CONTRACT_RENEWAL: 'text-signal-blue',
};

/** Shared 28px icon frame so event icons line up across both screens. */
export function EventIcon({ type }: { type: string }) {
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-container ${
        EVENT_COLORS[type] ?? 'text-primary'
      }`}
    >
      <AppIcon name={EVENT_ICONS[type] ?? 'event'} className="text-body" />
    </span>
  );
}
