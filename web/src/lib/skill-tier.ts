/**
 * Skill / Experience Tier Labels (web mirror)
 * ----------------------------------------
 * 21 discrete strength labels indexed by level 0-20, used to render
 * a player experience (or skill) value as a human-readable tier.
 *
 * Mirrors libs/database/src/services/skill-tier.ts. Keep in sync.
 * The web package does NOT depend on @goalxi/database, so we
 * redeclare the data here (pure constants, no DB / framework deps).
 *
 * L0  = None              L11 = Superb
 * L1  = Terrible          L12 = Apex
 * L2  = Poor              L13 = Superior
 * L3  = Mediocre          L14 = World-Class
 * L4  = Average           L15 = Magnificent
 * L5  = Competent         L16 = Exceptional
 * L6  = Satisfactory      L17 = Peerless
 * L7  = Good              L18 = Unmatched
 * L8  = Excellent         L19 = Transcendent
 * L9  = Formidable        L20 = Beyond Compare
 * L10 = Outstanding
 */

export type SkillTierLevel =
    | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
    | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20;

export type SkillTierLocale = "zh" | "en";

export interface SkillTier {
    readonly level: SkillTierLevel;
    readonly zh: string;
    readonly en: string;
}

export const SKILL_TIERS: readonly SkillTier[] = [
    { level: 0,  zh: "无",  en: "None" },
    { level: 1,  zh: "糟糕",  en: "Terrible" },
    { level: 2,  zh: "差劲",  en: "Poor" },
    { level: 3,  zh: "平庸",  en: "Mediocre" },
    { level: 4,  zh: "一般",  en: "Average" },
    { level: 5,  zh: "合格",  en: "Competent" },
    { level: 6,  zh: "差强人意",  en: "Satisfactory" },
    { level: 7,  zh: "良好",  en: "Good" },
    { level: 8,  zh: "优秀",  en: "Excellent" },
    { level: 9,  zh: "强大",  en: "Formidable" },
    { level: 10, zh: "杰出", en: "Outstanding" },
    { level: 11, zh: "精湛", en: "Superb" },
    { level: 12, zh: "顶尖", en: "Apex" },
    { level: 13, zh: "卓越", en: "Superior" },
    { level: 14, zh: "超一流", en: "World-Class" },
    { level: 15, zh: "卓绝", en: "Magnificent" },
    { level: 16, zh: "出类拔萃", en: "Exceptional" },
    { level: 17, zh: "举世无双", en: "Peerless" },
    { level: 18, zh: "登峰造极", en: "Unmatched" },
    { level: 19, zh: "空前绝后", en: "Transcendent" },
    { level: 20, zh: "化境", en: "Beyond Compare" },
];

/**
 * Look up the strength label for a given numeric level.
 * Clamps out-of-range values: level < 0 -> tier 0, level > 20 -> tier 20.
 * Non-integer values are floored.
 */
export function getSkillTierLabel(
    level: number,
    locale: SkillTierLocale = "en",
): string {
    if (!Number.isFinite(level)) {
        return SKILL_TIERS[0][locale];
    }
    const clamped = Math.max(0, Math.min(20, Math.floor(level)));
    return SKILL_TIERS[clamped][locale];
}

