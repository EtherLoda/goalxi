"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { api, type Team } from "@/lib/api";
import { useCurrentTeamId } from "@/stores/gameStore";

import AuditTimeline from "@/components/club/AuditTimeline";
import BenchQuickEdit from "@/components/club/BenchQuickEdit";
import ClubInfoForm from "@/components/club/ClubInfoForm";
import TrainingSlider from "@/components/club/TrainingSlider";

type Locale = "en" | "zh";

export default function ClubSettingsPage() {
    const t = useTranslations("club.settingsPage");
    const tCommon = useTranslations();
    const params = useParams();
    const { user, isLoading: authLoading } = useAuth();
    const currentTeamId = useCurrentTeamId();
    const locale = (params.locale as Locale) || "en";

    const [team, setTeam] = useState<Team | null>(null);
    const [players, setPlayers] = useState<{ id: string; name: string }[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!currentTeamId) return;
        setIsLoading(true);
        setError(null);
        Promise.all([
            api.teams.getById(currentTeamId).catch(() => null),
            api.players.getByTeam(currentTeamId).catch(() => ({ items: [], meta: {} })),
        ])
            .then(([teamData, playersData]) => {
                setTeam(teamData);
                setPlayers(
                    (playersData.items ?? []).map((p: { id: string; name: string }) => ({
                        id: p.id,
                        name: p.name,
                    })),
                );
            })
            .catch((err: unknown) => {
                setError(err instanceof Error ? err.message : tCommon("common.error"));
            })
            .finally(() => setIsLoading(false));
    }, [currentTeamId, tCommon]);

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
        <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-5xl mx-auto space-y-8">
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
                    <div className="h-40 rounded-xl bg-surface-container/30 animate-pulse" />
                </div>
            ) : (
                <>
                    <section>
                        <h2 className="font-headline text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-3">
                            {t("sections.info")}
                        </h2>
                        <div className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/10">
                            <ClubInfoForm team={team} onSaved={setTeam} />
                        </div>
                    </section>

                    <section>
                        <h2 className="font-headline text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-3">
                            {t("sections.training")}
                        </h2>
                        <TrainingSlider
                            teamId={currentTeamId}
                            value={team.staminaTrainingIntensity ?? 0.1}
                            lastChangedAt={team.trainingIntensityLastChangedAt}
                            onSaved={(v) =>
                                setTeam((t) =>
                                    t
                                        ? {
                                              ...t,
                                              staminaTrainingIntensity: v,
                                              trainingIntensityLastChangedAt: new Date().toISOString(),
                                          }
                                        : t,
                                )
                            }
                        />
                    </section>

                    <section>
                        <h2 className="font-headline text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-3">
                            {t("sections.bench")}
                        </h2>
                        <BenchQuickEdit
                            teamId={currentTeamId}
                            bench={
                                team.benchConfig ?? {
                                    goalkeeper: null,
                                    centerBack: null,
                                    fullback: null,
                                    winger: null,
                                    centralMidfield: null,
                                    forward: null,
                                }
                            }
                            players={players}
                            onSaved={(b) => setTeam((t) => (t ? { ...t, benchConfig: b } : t))}
                        />
                    </section>

                    <section>
                        <h2 className="font-headline text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-3">
                            {t("sections.audit")}
                        </h2>
                        <AuditTimeline teamId={currentTeamId} />
                    </section>
                </>
            )}
        </div>
    );
}