/**
 * squad-sort.ts — the squad list's sort dimensions.
 *
 * Pure data plus a pure comparator, no React: web jest runs on `node` and
 * there are no `.tsx` specs, so ordering rules are only testable if they live
 * in a `.ts` module.
 *
 * Position is deliberately NOT a dimension. Outfield players carry no
 * position — the roster's only positional fact is goalkeeper-or-not — so an
 * outfielder sorts identically under every "position" rule. Everything a
 * manager can actually order by is either a roster fact (age, wage) or a
 * skill.
 */

import {
  GOALKEEPER_SKILLS,
  OUTFIELD_SKILLS,
  groupSkills,
  readSkillPair,
  type SkillSpec,
} from '@/components/player/skill-groups';
import type { Player } from '@/lib/api';

export type StatSortKey =
  | 'overall'
  | 'age'
  | 'stamina'
  | 'form'
  | 'experience'
  | 'wage';

export type SkillSortKey = `skill:${string}`;
export type SquadSortKey = StatSortKey | SkillSortKey;

/** -1 puts the largest value first, 1 puts the smallest first. */
export type SortDirection = 1 | -1;

export interface SquadSort {
  readonly key: SquadSortKey;
  readonly direction: SortDirection;
}

export interface SortOption {
  readonly key: SquadSortKey;
  /** Relative to the `squad` namespace. */
  readonly labelKey: string;
  /** Direction the option starts in when first picked. */
  readonly direction: SortDirection;
}

export const DEFAULT_SQUAD_SORT: SquadSort = { key: 'overall', direction: -1 };

/**
 * Roster facts first, then skills. Each option carries the direction it means
 * when you pick it — "age" means youngest first, "wage" means most expensive
 * first — so the menu needs no separate ascending/descending control.
 */
export const STAT_SORT_OPTIONS: readonly SortOption[] = [
  { key: 'overall', labelKey: 'sort.overall', direction: -1 },
  { key: 'age', labelKey: 'sort.age', direction: 1 },
  { key: 'stamina', labelKey: 'sort.stamina', direction: 1 },
  { key: 'form', labelKey: 'sort.form', direction: -1 },
  { key: 'experience', labelKey: 'sort.experience', direction: -1 },
  { key: 'wage', labelKey: 'sort.wage', direction: -1 },
];

/**
 * The 13 skills a mixed squad can be ordered by: the union of the outfield and
 * goalkeeper sets (they share the six physical/mental/set-piece skills). Grouped
 * in reading order rather than wire order, so the menu and the profile's skill
 * grid list skills the same way. A goalkeeper's outfield-only skills are 0, so
 * sorting by 射门 naturally sinks them instead of erroring.
 */
const SORTABLE_SKILLS: readonly SkillSpec[] = (() => {
  const seen = new Set<string>();
  const union: SkillSpec[] = [];
  for (const spec of [...OUTFIELD_SKILLS, ...GOALKEEPER_SKILLS]) {
    if (seen.has(spec.key)) continue;
    seen.add(spec.key);
    union.push(spec);
  }
  return groupSkills(union).flatMap((group) => group.specs);
})();

export const SKILL_SORT_OPTIONS: readonly SortOption[] = SORTABLE_SKILLS.map(
  (spec) => ({
    key: `skill:${spec.key}` as SkillSortKey,
    labelKey: `skills.${spec.key}`,
    direction: -1,
  }),
);

const ALL_OPTIONS: readonly SortOption[] = [
  ...STAT_SORT_OPTIONS,
  ...SKILL_SORT_OPTIONS,
];

const SKILL_BY_KEY = new Map(SORTABLE_SKILLS.map((spec) => [spec.key, spec]));

export function findSortOption(key: SquadSortKey): SortOption {
  return (
    ALL_OPTIONS.find((option) => option.key === key) ?? STAT_SORT_OPTIONS[0]
  );
}

/**
 * Picking the active option again flips the direction; picking a different
 * option starts it in that option's natural direction.
 */
export function nextSort(current: SquadSort, key: SquadSortKey): SquadSort {
  if (current.key === key) {
    return { key, direction: current.direction === -1 ? 1 : -1 };
  }
  return { key, direction: findSortOption(key).direction };
}

/**
 * Age in days, so two 27-year-olds order by how far past their birthday they
 * are. `ageDays` is days elapsed since the last birthday, hence the 400
 * multiplier (a safe upper bound on days-in-a-year for ordering purposes).
 */
function valueOf(player: Player, key: SquadSortKey): number {
  switch (key) {
    case 'overall':
      return player.overall ?? 0;
    case 'age':
      return player.age * 400 + (player.ageDays ?? 0);
    case 'stamina':
      return player.stamina ?? 0;
    case 'form':
      return player.form ?? 0;
    case 'experience':
      return player.experience ?? 0;
    case 'wage':
      return player.currentWage ?? 0;
    default: {
      const spec = SKILL_BY_KEY.get(key.slice('skill:'.length));
      return spec ? readSkillPair(player.currentSkills, undefined, spec).current : 0;
    }
  }
}

export function sortSquad(
  players: readonly Player[],
  sort: SquadSort,
): Player[] {
  return [...players].sort((a, b) => {
    const delta = valueOf(a, sort.key) - valueOf(b, sort.key);
    if (delta !== 0) return delta * sort.direction;
    // Equal values must not reshuffle between renders: fall back to the
    // default order (strongest first), then to the id.
    if (a.overall !== b.overall) return b.overall - a.overall;
    return a.id - b.id;
  });
}
