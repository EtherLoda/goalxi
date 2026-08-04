/**
 * scout-narrative.ts — small bilingual skill-label helpers, kept here
 * so ScoutCard and any future "show a 1-20 descriptor" UI can share
 * the same table.
 *
 * The narrative renderer itself was retired when the MVP scout
 * card stopped rendering prose — every skill is now a labelled bar
 * and the server's `buildNarrative` output is ignored by the web
 * frontend. The shared `Locale` type and `SKILL_LEVELS` /
 * `SKILL_KEY_LABELS` tables stay because they back the player page
 * descriptors and are easy to reuse later.
 */

export type Locale = "en" | "zh";

/**
 * 1-20 skill level descriptors. The values are sourced from
 * `app/[locale]/training/page.tsx` — do not invent new copies; both
 * sites should share this table.
 */
export const SKILL_LEVELS: Record<number, { zh: string; en: string }> = {
  1: { zh: "差劲", en: "Terrible" },
  2: { zh: "欠缺", en: "Deficient" },
  3: { zh: "入门", en: "Novice" },
  4: { zh: "平庸", en: "Mediocre" },
  5: { zh: "熟练", en: "Proficient" },
  6: { zh: "粗通", en: "Basic" },
  7: { zh: "扎实", en: "Solid" },
  8: { zh: "优秀", en: "Excellent" },
  9: { zh: "杰出", en: "Outstanding" },
  10: { zh: "精湛", en: "Skilled" },
  11: { zh: "超群", en: "Superlative" },
  12: { zh: "职业级", en: "Professional" },
  13: { zh: "卓越", en: "Exceptional" },
  14: { zh: "精英级", en: "Elite" },
  15: { zh: "统治级", en: "Dominant" },
  16: { zh: "大师级", en: "Master" },
  17: { zh: "宗师", en: "Grand Master" },
  18: { zh: "王牌", en: "Ace" },
  19: { zh: "传奇级", en: "Legendary" },
  20: { zh: "超凡入圣", en: "Transcendent" },
};

/**
 * Per-skill bilingual labels. Mirrors the `fieldLabels` table inside
 * `app/[locale]/training/page.tsx` — same copy, same casing. Keys
 * match the lowercased `PlayerSkills` property names.
 */
export const SKILL_KEY_LABELS: Record<string, { zh: string; en: string }> = {
  pace: { zh: "速度", en: "Pace" },
  strength: { zh: "力量", en: "Strength" },
  finishing: { zh: "射门", en: "Finishing" },
  passing: { zh: "传球", en: "Passing" },
  dribbling: { zh: "盘带", en: "Dribbling" },
  defending: { zh: "防守", en: "Defending" },
  positioning: { zh: "跑位", en: "Positioning" },
  composure: { zh: "冷静", en: "Composure" },
  freeKicks: { zh: "任意球", en: "Free Kicks" },
  penalties: { zh: "点球", en: "Penalties" },
  reflexes: { zh: "反应", en: "Reflexes" },
  handling: { zh: "扑救", en: "Handling" },
  aerial: { zh: "空中", en: "Aerial" },
};

/** Look up a 1-20 descriptor, clamped + case-insensitive. */
export function getSkillLevel(level: number, locale: Locale): string {
  const clamped = Math.max(1, Math.min(20, Math.round(level)));
  const entry = SKILL_LEVELS[clamped];
  return entry ? entry[locale] : String(clamped);
}

/** Look up a skill-key label, falling back to Title-case on miss. */
export function getSkillKeyLabel(key: string, locale: Locale): string {
  const entry =
    SKILL_KEY_LABELS[key] ??
    SKILL_KEY_LABELS[key.toLowerCase()] ??
    SKILL_KEY_LABELS[key.toUpperCase()];
  if (entry) return entry[locale];
  return key.charAt(0).toUpperCase() + key.slice(1);
}
