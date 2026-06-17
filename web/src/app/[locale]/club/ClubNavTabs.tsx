"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { clsx } from "clsx";

type Locale = "en" | "zh";

const TABS = [
    { key: "overview", href: "/club", icon: "dashboard" },
    { key: "settings", href: "/club/settings", icon: "settings" },
    { key: "medical", href: "/club/medical", icon: "medical_services" },
] as const;

export default function ClubNavTabs() {
    const t = useTranslations("club.nav");
    const pathname = usePathname();
    const params = useParams();
    const locale = (params.locale as Locale) || "en";

    return (
        <div className="border-b border-outline-variant/10 bg-surface-container-low/40">
            <div className="px-6 lg:px-10 max-w-7xl mx-auto">
                <nav className="flex gap-1 overflow-x-auto" aria-label={t("aria")}>
                    {TABS.map((tab) => {
                        const href = `/${locale}${tab.href}`;
                        const isActive =
                            tab.href === "/club"
                                ? pathname === href
                                : pathname === href || pathname.startsWith(href + "/");
                        return (
                            <Link
                                key={tab.key}
                                href={href}
                                className={clsx(
                                    "flex items-center gap-2 px-4 py-3 font-headline text-xs font-bold uppercase tracking-widest border-b-2 transition-colors",
                                    isActive
                                        ? "border-primary text-primary"
                                        : "border-transparent text-on-surface-variant hover:text-on-surface hover:border-outline-variant",
                                )}
                                aria-current={isActive ? "page" : undefined}
                            >
                                <span
                                    className="material-symbols-outlined text-base"
                                    style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}
                                    aria-hidden
                                >
                                    {tab.icon}
                                </span>
                                {t(tab.key)}
                            </Link>
                        );
                    })}
                </nav>
            </div>
        </div>
    );
}
