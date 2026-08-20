"use client";

import { useLocale } from "next-intl";
import { getSkillTierLabel, type SkillTierLocale } from "@/lib/skill-tier";

interface Props {
    value: number | null | undefined;
    className?: string;
    fallback?: string;
}

/**
 * Renders a player experience value as a 21-tier human-readable label.
 * The numeric value is shown on hover via the title attribute.
 *
 *   Text:  the tier label (e.g. 顶尖 / Apex)
 *   Hover: 162 XP (raw value)
 *
 * See libs/database/src/services/skill-tier.ts for the source-of-truth
 * 21-tier table; this is a web-side mirror of the labels.
 */
export function ExperienceTierLabel({ value, className, fallback = "—" }: Props) {
    const rawLocale = useLocale();
    const locale: SkillTierLocale = rawLocale === "zh" ? "zh" : "en";
    const safe = typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : null;
    if (safe === null) {
        return <span className={className} title="no data">{fallback}</span>;
    }
    const label = getSkillTierLabel(safe, locale);
    return (
        <span className={className} title={safe + " XP"}>
            {label}
        </span>
    );
}
