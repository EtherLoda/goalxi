"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";

interface AuditEntry {
    id: string;
    type: string;
    season: number;
    week: number;
    description: string;
    cost?: number;
    createdAt: string;
}

const ICONS: Record<string, string> = {
    stadium_build: "construction",
    stadium_demolish: "delete_sweep",
    stadium_rename: "edit_square",
    training_change: "fitness_center",
    name_change: "badge",
    logo_change: "image",
    jersey_change: "checkroom",
    unknown: "history",
};

export default function AuditTimeline({ teamId }: { teamId: string }) {
    const t = useTranslations("club.audit");
    const tCommon = useTranslations();
    const [entries, setEntries] = useState<AuditEntry[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setError(null);
        fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api/v1"}/teams/${teamId}/audit`)
            .then(async (r) => {
                if (!r.ok) throw new Error(`Status ${r.status}`);
                return r.json();
            })
            .then((data: AuditEntry[]) => {
                if (!cancelled) setEntries(data);
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : tCommon("common.error"));
                    setEntries([]);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [teamId, tCommon]);

    if (error) {
        return (
            <div className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/10">
                <p className="text-sm text-error">{error}</p>
            </div>
        );
    }

    if (entries == null) {
        return (
            <div className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/10">
                <div className="h-20 rounded bg-surface-container/30 animate-pulse" />
            </div>
        );
    }

    if (entries.length === 0) {
        return (
            <div className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/10 text-center">
                <span className="material-symbols-outlined text-3xl text-on-surface-variant/40">
                    history
                </span>
                <p className="text-sm text-on-surface-variant mt-2">{t("empty")}</p>
            </div>
        );
    }

    return (
        <div className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/10 space-y-3">
            <header>
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
                    <span className="material-symbols-outlined text-base">history</span>
                    <span>{t("title")}</span>
                </div>
                <p className="text-xs text-on-surface-variant">{t("subtitle")}</p>
            </header>
            <ol className="space-y-2">
                {entries.map((entry) => (
                    <li
                        key={entry.id}
                        className="flex items-start gap-3 px-3 py-2.5 rounded-lg border border-outline-variant/10 bg-surface-container/40"
                    >
                        <span className="material-symbols-outlined text-base text-on-surface-variant mt-0.5">
                            {ICONS[entry.type] ?? "history"}
                        </span>
                        <div className="flex-1 min-w-0">
                            <div className="font-body text-sm text-on-surface">
                                {entry.description}
                            </div>
                            <div className="font-label text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mt-0.5">
                                S{entry.season} W{entry.week}
                            </div>
                        </div>
                        {entry.cost != null && entry.cost < 0 && (
                            <div className="font-headline text-xs font-bold text-error whitespace-nowrap">
                                {entry.cost.toLocaleString()}
                            </div>
                        )}
                    </li>
                ))}
            </ol>
        </div>
    );
}
