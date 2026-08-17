"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import { api, type Team } from "@/lib/api";
import { useCurrentTeamId } from "@/stores/gameStore";

import ClubInfoForm from "@/components/club/ClubInfoForm";

export default function TeamSettingsPage() {
    const t = useTranslations("settings.team.page");
    const tCommon = useTranslations();
    const { user, isLoading: authLoading } = useAuth();
    const currentTeamId = useCurrentTeamId();

    const [team, setTeam] = useState<Team | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!currentTeamId) return;
        setIsLoading(true);
        setError(null);
        api.teams
            .getById(currentTeamId)
            .then(setTeam)
            .catch((err: unknown) => {
                setError(err instanceof Error ? err.message : tCommon("common.error"));
            })
            .finally(() => setIsLoading(false));
    }, [currentTeamId, tCommon]);

    if (authLoading) {
        return (
            <div className="flex items-center justify-center min-h-[40vh]">
                <div className="font-headline text-sm font-bold uppercase tracking-widest text-on-surface-variant animate-pulse">
                    {tCommon("common.loading")}
                </div>
            </div>
        );
    }
    if (!user || !currentTeamId) {
        return (
            <div className="flex items-center justify-center min-h-[40vh]">
                <div className="font-headline text-sm font-bold uppercase tracking-widest text-error">
                    {tCommon("auth.loginRequired")}
                </div>
            </div>
        );
    }

    return (
        <>
            <header>
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-primary/70 mb-3">
                    <span className="material-symbols-outlined text-base">settings</span>
                    <span>{t("eyebrow")}</span>
                </div>
                <h1 className="font-headline text-4xl font-black uppercase tracking-tight text-on-surface">
                    {t("title")}
                </h1>
                <p className="font-body text-sm text-on-surface-variant mt-2 max-w-2xl">
                    {t("subtitle")}
                </p>
            </header>

            {error && (
                <div className="px-4 py-3 rounded-lg border border-error/30 bg-error/10 text-error text-sm">
                    {error}
                </div>
            )}

            {isLoading || !team ? (
                <div className="space-y-4">
                    <div className="h-40 rounded-xl bg-surface-container/30 animate-pulse" />
                </div>
            ) : (
                <section>
                    <h2 className="font-headline text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-3">
                        {t("sections.info")}
                    </h2>
                    <div className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/10">
                        <ClubInfoForm team={team} onSaved={setTeam} />
                    </div>
                </section>
            )}
        </>
    );
}
