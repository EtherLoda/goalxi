import type { ScoutNarrativeSection } from "@/lib/api";

/**
 * scout-narrative.ts — structured → displayable for scout reports.
 *
 * The 1-20 skill level descriptors and the per-skill Chinese/English
 * labels are constants here, not i18n keys. They're shared with
 * `app/[locale]/training/page.tsx` (which has the same 1-20 chart in
 * an inline block) — keep the two in sync if you add a new level.
 *
 * Tendency text is the one piece routed through i18n, because the
 * existing `youth.scouts.abilityTendency.{physical,technical,mental,balanced}`
 * keys already carry the right copy in both locales.
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

export type RenderedNarrative = {
  kind: ScoutNarrativeSection["kind"];
  icon: string;
  text: string;
};

export type NarrativeRenderer = (
  section: ScoutNarrativeSection,
) => RenderedNarrative;

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

/**
 * Build a renderer bound to a next-intl `t` function and a locale.
 * Only the templates (`narrative.age`, `narrative.abilities`,
 * `narrative.skill`) are i18n-driven; the level descriptors and skill
 * labels are constants in this file.
 *
 * Tendency text uses the project's pre-existing
 * `youth.scouts.abilityTendency.*` i18n keys.
 */
export function makeNarrativeRenderer(
  t: (key: string, values?: Record<string, string | number>) => string,
  locale: Locale,
): NarrativeRenderer {
  return (section) => {
    const v = clampVariant(section.variant);
    switch (section.kind) {
      case "age": {
        return {
          kind: "age",
          icon: "cake",
          text: t("narrative.age", {
            years: section.data.years,
            days: section.data.days,
          }),
        };
      }
      case "abilities": {
        return {
          kind: "abilities",
          icon: "auto_awesome",
          text: t(`narrative.abilities.v${v}`, {
            list: section.data.list.join(locale === "zh" ? "、" : ", "),
          }),
        };
      }
      case "skill": {
        const { mode } = section.data;
        const value = mode === "potential"
          ? section.data.potential
          : section.data.current;
        return {
          kind: "skill",
          icon: "bolt",
          text: t(`narrative.skill.${mode}.v${v}`, {
            skill: getSkillKeyLabel(section.data.skillKey, locale),
            label: getSkillLevel(value, locale),
          }),
        };
      }
      case "tendency": {
        return {
          kind: "tendency",
          icon: "psychology",
          text: t(`narrative.tendency.${section.data.tendencyKey}.v${v}`),
        };
      }
      case "physical": {
        return {
          kind: "physical",
          icon: "fitness_center",
          text: t(`narrative.physical.${section.data.profile}.v${v}`),
        };
      }
      case "ceiling": {
        return {
          kind: "ceiling",
          icon: section.data.revealed ? "trending_up" : "visibility_off",
          text: section.data.revealed
            ? t(`narrative.ceiling.revealed.v${v}`, {
                level: getSkillLevel(section.data.level ?? 0, locale),
              })
            : t(`narrative.ceiling.hidden.v${v}`),
        };
      }
    }
  };
}

/** Clamp a server-supplied variant into a known-good range. */
function clampVariant(v: number): number {
  if (!Number.isFinite(v)) return 0;
  const i = Math.floor(v);
  if (i < 0) return 0;
  if (i > 2) return 2;
  return i;
}
