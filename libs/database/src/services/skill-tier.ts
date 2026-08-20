/**
 * Skill / Experience Tier Labels
 * --------------------------------
 * 21 discrete labels (level 0 → 20) describing a player’s strength.
 * Reusable in two contexts:
 *   1. Skills — the 0-20 attribute scale (pace, finishing, etc.)
 *   2. Experience — the cumulative level from matches (also 0-20).
 *
 * Pure data + one tiny lookup. No DB / i18n coupling — labels are inlined
 * here so the spec can lock the full 21-level grid in one place.
 */

export type SkillTierLevel =
    | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
    | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20;

export type SkillTierLocale = 'zh' | 'en';

export interface SkillTier {
    readonly level: SkillTierLevel;
    readonly zh: string;
    readonly en: string;
}


/**
 * 21-tier strength label, indexed by level (0-20).
 * The array is the source of truth: index = level.
 *
 *   L0  = None              (player has no rating / never played)
 *   L1  = Terrible
 *   L2  = Poor
 *   L3  = Mediocre
 *   L4  = Average
 *   L5  = Competent
 *   L6  = Satisfactory      (差强人意)
 *   L7  = Good
 *   L8  = Excellent
 *   L9  = Formidable
 *   L10 = Outstanding
 *   L11 = Superb
 *   L12 = Apex
 *   L13 = Superior
 *   L14 = World-Class
 *   L15 = Magnificent
 *   L16 = Exceptional
 *   L17 = Peerless
 *   L18 = Unmatched
 *   L19 = Transcendent
 *   L20 = Beyond Compare
 */
export const SKILL_TIERS: readonly SkillTier[] = [
    { level: 0,  zh: '无',       en: 'None' },
    { level: 1,  zh: '糟糕',   en: 'Terrible' },
    { level: 2,  zh: '差劲',       en: 'Poor' },
    { level: 3,  zh: '平庸',   en: 'Mediocre' },
    { level: 4,  zh: '一般',    en: 'Average' },
    { level: 5,  zh: '合格',  en: 'Competent' },
    { level: 6,  zh: '差强人意',   en: 'Satisfactory' },
    { level: 7,  zh: '良好',       en: 'Good' },
    { level: 8,  zh: '优秀',  en: 'Excellent' },
    { level: 9,  zh: '强大', en: 'Formidable' },
    { level: 10, zh: '杰出',en: 'Outstanding' },
    { level: 11, zh: '精湛',     en: 'Superb' },
    { level: 12, zh: '顶尖',       en: 'Apex' },
    { level: 13, zh: '卓越',   en: 'Superior' },
    { level: 14, zh: '超一流', en: 'World-Class' },
    { level: 15, zh: '卓绝',en: 'Magnificent' },
    { level: 16, zh: '出类拔萃',en: 'Exceptional' },
    { level: 17, zh: '举世无双',   en: 'Peerless' },
    { level: 18, zh: '登峰造极',  en: 'Unmatched' },
    { level: 19, zh: '空前绝后',      en: 'Transcendent' },
    { level: 20, zh: '化境',     en: 'Beyond Compare' },
];

export function getSkillTierLabel(level: number, locale: SkillTierLocale = 'en'): string {
    if (!Number.isFinite(level)) return SKILL_TIERS[0][locale];
    const clamped = Math.max(0, Math.min(20, Math.floor(level)));
    return SKILL_TIERS[clamped][locale];
}
