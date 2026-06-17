"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { api, type Team, type StadiumSummary } from "@/lib/api";
import { useCurrentTeamId } from "@/stores/gameStore";

type Locale = "en" | "zh";

export default function ClubOverviewPage() {
    const t = useTranslations("club.overview");
    const tCommon = useTranslations();
    const params = useParams();
    const { user, isLoading: authLoading } = useAuth();
    const currentTeamId = useCurrentTeamId();
    const locale = (params.locale as Locale) || "en";

    const [team, setTeam] = useState<Team | null>(null);
    const [stadium, setStadium] = useState<StadiumSummary | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!currentTeamId) return;
        setIsLoading(true);
        Promise.all([
            api.teams.getById(currentTeamId).catch(() => null),
            api.stadium.getSummary(currentTeamId).catch(() => null),
        ])
            .then(([teamData, stadiumData]) => {
                setTeam(teamData);
                setStadium(stadiumData);
            })
            .finally(() => setIsLoading(false));
    }, [currentTeamId]);

    if (authLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="font-headline text-sm font-bold uppercase tracking-widest text-on-surface-variant animate-pulse">
                    {tCommon("common.loading")}
                </div>
            </div>
        );
    }

    if (!user || !currentTeamId) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="font-headline text-sm font-bold uppercase tracking-widest text-error">
                    {tCommon("auth.loginRequired")}
                </div>
            </div>
        );
    }

    return (
        <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-7xl mx-auto">
            <header className="mb-8">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-primary/70 mb-3">
                    <span className="material-symbols-outlined text-base">apartment</span>
                    <span>{t("eyebrow")}</span>
                </div>
                <h1 className="font-headline text-4xl font-black uppercase tracking-tight text-on-surface">
                    {team?.name ?? t("fallbackName")}
                </h1>
                <p className="font-body text-sm text-on-surface-variant mt-2 max-w-2xl">
                    {t("subtitle")}
                </p>
            </header>

            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="h-32 rounded-xl bg-surface-container/30 animate-pulse" />
                    <div className="h-32 rounded-xl bg-surface-container/30 animate-pulse" />
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/10">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-3">
                            <span className="material-symbols-outlined text-base">stadium</span>
                            <span>{t("stadium.title")}</span>
                        </div>
                        <div className="font-headline text-3xl font-black text-on-surface">
                            {stadium?.name ?? t("stadium.none")}
                        </div>
                        <div className="font-body text-xs text-on-surface-variant mt-2">
                            {t("stadium.capacity", {
                                n: stadium?.capacity?.toLocaleString(locale) ?? "—",
                            })}
                        </div>
                    </div>
                    <div className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/10">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-3">
                            <span className="material-symbols-outlined text-base">info</span>
                            <span>{t("info.title")}</span>
                        </div>
                        <div className="font-body text-sm text-on-surface space-y-1">
                            {team?.city && (
                                <div>
                                    <span className="text-on-surface-variant">{t("info.city")}: </span>
                                    {team.city}
                                </div>
                            )}
                            {team?.foundedYear != null && (
                                <div>
                                    <span className="text-on-surface-variant">{t("info.founded")}: </span>
                                    {team.foundedYear}
                                </div>
                            )}
                            {!team?.city && team?.foundedYear == null && (
                                <div className="text-on-surface-variant italic">{t("info.empty")}</div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
