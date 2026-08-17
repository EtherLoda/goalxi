"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

interface SettingsNavProps {
    locale: string;
}

const ITEMS = [
    { href: "team", icon: "shield" },
    { href: "user", icon: "account_circle" },
    { href: "site", icon: "public" },
] as const;

export default function SettingsNav({ locale }: SettingsNavProps) {
    const pathname = usePathname();
    const t = useTranslations("settings.nav");

    // The pathname looks like /en/settings/team — match the trailing segment.
    // We anchor on the full path so links under /settings/<sub>/<deeper> still
    // highlight the right nav item.
    const activeSub = pathname?.match(/\/settings\/([^/]+)/)?.[1];

    return (
        <nav aria-label={t("label")} className="space-y-1">
            {ITEMS.map((item) => {
                const href = `/${locale}/settings/${item.href}`;
                const isActive = activeSub === item.href;
                return (
                    <Link
                        key={item.href}
                        href={href}
                        aria-current={isActive ? "page" : undefined}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg font-headline text-xs font-bold uppercase tracking-widest transition-colors ${
                            isActive
                                ? "bg-primary/10 text-primary border border-primary/30"
                                : "text-on-surface-variant hover:text-on-surface hover:bg-white/5 border border-transparent"
                        }`}
                    >
                        <span className="material-symbols-outlined text-base">
                            {item.icon}
                        </span>
                        <span>{t(item.href)}</span>
                    </Link>
                );
            })}
        </nav>
    );
}
