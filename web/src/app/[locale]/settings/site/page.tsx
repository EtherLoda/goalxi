"use client";

import { useTranslations } from "next-intl";

/**
 * Site Settings landing page. The full implementation (language + timezone
 * forms) lands in commit 2 — this stub is enough for the nav wiring +
 * i18n smoke test in commit 1.
 */
export default function SiteSettingsPage() {
    const t = useTranslations("settings.site.page");

    return (
        <>
            <header>
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-primary/70 mb-3">
                    <span className="material-symbols-outlined text-base">public</span>
                    <span>{t("eyebrow")}</span>
                </div>
                <h1 className="font-headline text-4xl font-black uppercase tracking-tight text-on-surface">
                    {t("title")}
                </h1>
                <p className="font-body text-sm text-on-surface-variant mt-2 max-w-2xl">
                    {t("subtitle")}
                </p>
            </header>

            <section className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/10">
                <p className="font-body text-sm text-on-surface-variant">{t("comingSoon")}</p>
            </section>
        </>
    );
}
