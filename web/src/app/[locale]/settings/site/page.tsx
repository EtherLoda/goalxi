"use client";

import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import SiteLanguageForm from "@/components/settings/SiteLanguageForm";
import SiteTimezoneForm from "@/components/settings/SiteTimezoneForm";

export default function SiteSettingsPage() {
    const t = useTranslations("settings.site.page");
    const tSections = useTranslations("settings.site.page.sections");
    const tLanguage = useTranslations("settings.site.language");
    const tTimezone = useTranslations("settings.site.timezone");
    const { user, isLoading } = useAuth();

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[40vh]">
                <div className="font-headline text-sm font-bold uppercase tracking-widest text-on-surface-variant animate-pulse">
                    …
                </div>
            </div>
        );
    }
    if (!user) {
        return (
            <div className="flex items-center justify-center min-h-[40vh]">
                <div className="font-headline text-sm font-bold uppercase tracking-widest text-error">
                    Login required
                </div>
            </div>
        );
    }

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

            <section>
                <h2 className="font-headline text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-3">
                    {tSections("language")}
                </h2>
                <div className="space-y-2 mb-4">
                    <h3 className="font-headline text-lg font-bold text-on-surface">
                        {tLanguage("title")}
                    </h3>
                </div>
                <div className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/10">
                    <SiteLanguageForm user={user} />
                </div>
            </section>

            <section>
                <h2 className="font-headline text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-3">
                    {tSections("timezone")}
                </h2>
                <div className="space-y-2 mb-4">
                    <h3 className="font-headline text-lg font-bold text-on-surface">
                        {tTimezone("title")}
                    </h3>
                </div>
                <div className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/10">
                    <SiteTimezoneForm user={user} />
                </div>
            </section>
        </>
    );
}
