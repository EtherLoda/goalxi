/**
 * skill-display.ts — shared constants and label helpers for the
 * "PlayerStatsCard-style" skill presentation. Consumed by:
 *   - `components/player/PlayerStatsCard.tsx`
 *   - `components/tactics/roster/DetailedRosterPlayerCard.tsx`
 *
 * Single source of truth for the four skill categories, the color tokens
 * used to paint their bars, the human-readable labels (en + zh), and the
 * `SKILL_MAX` upper bound used to normalise the bar fill width.
 *
 * The label keys are kept lowercase to match how the data is keyed in
 * `PlayerEntity.currentSkills` (see `libs/database/src/entities/player.entity.ts`).
 */

export const SKILL_MAX = 20;

export const CATEGORY_COLORS = {
  physical: 'text-[#a1ffc2]',
  technical: 'text-[#60a5fa]',
  mental: 'text-[#c084fc]',
  setPieces: 'text-[#fbbf24]',
} as const;

export type SkillCategory = keyof typeof CATEGORY_COLORS;

export const SKILL_CATEGORIES: readonly SkillCategory[] = [
  'physical',
  'technical',
  'mental',
  'setPieces',
] as const;

/** Bilingual category headers used as section titles above each skill group. */
export const CATEGORY_NAMES: Record<SkillCategory, { en: string; zh: string }> = {
  physical: { en: 'Physical', zh: '体能' },
  technical: { en: 'Technical', zh: '技术' },
  mental: { en: 'Mental', zh: '心智' },
  setPieces: { en: 'Set Pieces', zh: '定位球' },
};

/**
 * Bilingual labels for every known skill key. Keys are lowercased to
 * match the property names on `currentSkills`. Unknown keys fall back
 * to a Title-Cased version of the raw key in `formatSkillLabel`.
 */
export const SKILL_LABELS: Record<string, { en: string; zh: string }> = {
  pace: { en: 'Pace', zh: '速度' },
  strength: { en: 'Strength', zh: '力量' },
  tackling: { en: 'Tackle', zh: '抢断' },
  shooting: { en: 'Shoot', zh: '射门' },
  passing: { en: 'Pass', zh: '传球' },
  dribbling: { en: 'Dribble', zh: '盘带' },
  crossing: { en: 'Cross', zh: '传中' },
  finishing: { en: 'Finish', zh: '终结' },
  heading: { en: 'Header', zh: '头球' },
  positioning: { en: 'Posit', zh: '位置' },
  composure: { en: 'Comps', zh: '镇定' },
  vision: { en: 'Vision', zh: '视野' },
  freeKicks: { en: 'FKick', zh: '任意球' },
  penalties: { en: 'Penalt', zh: '点球' },
  agility: { en: 'Agility', zh: '敏捷' },
  reflexes: { en: 'Reflex', zh: '反应' },
  handling: { en: 'Handle', zh: '扑救' },
  aerial: { en: 'Aerial', zh: '空中' },
};

/**
 * Case-insensitive view of {@link SKILL_LABELS}. Built once at module init
 * so callers can look up labels regardless of input casing (`freeKicks`,
 * `FreeKicks`, `freekicks` all map to the same entry).
 */
const SKILL_LABELS_LC: ReadonlyMap<string, { en: string; zh: string }> = new Map(
  Object.entries(SKILL_LABELS).map(([k, v]) => [k.toLowerCase(), v]),
);

export function formatSkillLabel(skill: string, locale: 'en' | 'zh' = 'en'): string {
  // Try the raw key first (preserves any future casing-sensitive needs),
  // then fall back to a case-insensitive lookup so data-cased keys
  // (`freeKicks`) and any case variant work.
  const entry = SKILL_LABELS[skill] ?? SKILL_LABELS_LC.get(skill.toLowerCase());
  if (entry) return locale === 'zh' ? entry.zh : entry.en;
  // Title-case the raw key as a fallback for unknown future skills.
  return skill.charAt(0).toUpperCase() + skill.slice(1);
}

export function getCategoryName(cat: SkillCategory, locale: 'en' | 'zh' = 'en'): string {
  const names = CATEGORY_NAMES[cat];
  return locale === 'zh' ? names.zh : names.en;
}
