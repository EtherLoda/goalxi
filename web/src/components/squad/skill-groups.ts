/**
 * skill-groups.ts — which skills a player has, in which category, in which order.
 *
 * Pure data + pure readers, no React. This exists because the squad page used
 * to hardcode the same four skill lists three times (once for the radar, once
 * per position type in the JSX, once in the GK branch), and the GK list had to
 * reach into the `technical` bucket for reflexes/handling/aerial — a shape fact
 * that is easy to get wrong when it is copy-pasted.
 *
 * i18n keys live under `squad.skills.<key>`; this module never touches text.
 */

export type SkillCategoryKey = 'physical' | 'technical' | 'mental' | 'setPieces';

export interface SkillSpec {
  readonly key: string;
  readonly category: SkillCategoryKey;
}

/** Skill buckets as they arrive on the wire (`PlayerSkills`). */
export type SkillBuckets = Partial<Record<SkillCategoryKey, Record<string, number>>>;

const PHYSICAL_SKILLS: readonly SkillSpec[] = [
  { key: 'pace', category: 'physical' },
  { key: 'strength', category: 'physical' },
];

const SET_PIECES: readonly SkillSpec[] = [
  { key: 'freeKicks', category: 'setPieces' },
  { key: 'penalties', category: 'setPieces' },
];

/** 10 outfield skills — every one of them, never a subset. */
export const OUTFIELD_SKILLS: readonly SkillSpec[] = [
  ...PHYSICAL_SKILLS,
  { key: 'finishing', category: 'technical' },
  { key: 'passing', category: 'technical' },
  { key: 'dribbling', category: 'technical' },
  { key: 'defending', category: 'technical' },
  { key: 'positioning', category: 'mental' },
  { key: 'composure', category: 'mental' },
  ...SET_PIECES,
];

/**
 * 9 goalkeeper skills. `aerial` replaces defending, and reflexes / handling /
 * aerial are stored in the `technical` bucket even though they are not
 * technical skills in the outfield sense — that is the wire format.
 */
export const GOALKEEPER_SKILLS: readonly SkillSpec[] = [
  ...PHYSICAL_SKILLS,
  { key: 'reflexes', category: 'technical' },
  { key: 'handling', category: 'technical' },
  { key: 'aerial', category: 'technical' },
  { key: 'positioning', category: 'mental' },
  { key: 'composure', category: 'mental' },
  ...SET_PIECES,
];

/** Radar axes: the 8 most decision-relevant skills, in reading order. */
export const OUTFIELD_RADAR: readonly SkillSpec[] = [
  { key: 'finishing', category: 'technical' },
  { key: 'passing', category: 'technical' },
  { key: 'dribbling', category: 'technical' },
  { key: 'defending', category: 'technical' },
  { key: 'pace', category: 'physical' },
  { key: 'strength', category: 'physical' },
  { key: 'positioning', category: 'mental' },
  { key: 'composure', category: 'mental' },
];

export const GOALKEEPER_RADAR: readonly SkillSpec[] = [
  { key: 'pace', category: 'physical' },
  { key: 'strength', category: 'physical' },
  { key: 'reflexes', category: 'technical' },
  { key: 'handling', category: 'technical' },
  { key: 'aerial', category: 'technical' },
  { key: 'positioning', category: 'mental' },
  { key: 'freeKicks', category: 'setPieces' },
  { key: 'penalties', category: 'setPieces' },
];

export function skillSpecsFor(isGoalkeeper: boolean): readonly SkillSpec[] {
  return isGoalkeeper ? GOALKEEPER_SKILLS : OUTFIELD_SKILLS;
}

export function radarSpecsFor(isGoalkeeper: boolean): readonly SkillSpec[] {
  return isGoalkeeper ? GOALKEEPER_RADAR : OUTFIELD_RADAR;
}

/**
 * Current + potential for one skill, defaulting a missing value to 0.
 * `potential` is returned raw (it can be below `current` after a decline);
 * the bar clamps its own width, the label decides how to present it.
 */
export function readSkillPair(
  current: SkillBuckets | undefined,
  potential: SkillBuckets | undefined,
  spec: SkillSpec,
): { current: number; potential: number } {
  const cur = current?.[spec.category]?.[spec.key] ?? 0;
  const pot = potential?.[spec.category]?.[spec.key] ?? 0;
  return { current: cur, potential: pot };
}

export interface SkillGroup {
  readonly category: SkillCategoryKey;
  readonly specs: readonly SkillSpec[];
}

/** Stable group order: physical, technical, mental, set pieces. */
const CATEGORY_ORDER: readonly SkillCategoryKey[] = [
  'physical',
  'technical',
  'mental',
  'setPieces',
];

export function groupSkills(specs: readonly SkillSpec[]): readonly SkillGroup[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    specs: specs.filter((s) => s.category === category),
  })).filter((g) => g.specs.length > 0);
}
