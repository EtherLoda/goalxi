"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";

type BenchRole =
    | "goalkeeper"
    | "centerBack"
    | "fullback"
    | "winger"
    | "centralMidfield"
    | "forward";

const SLOTS: { key: BenchRole; icon: string }[] = [
    { key: "goalkeeper", icon: "sports_handball" },
    { key: "centerBack", icon: "shield" },
    { key: "fullback", icon: "directions_walk" },
    { key: "winger", icon: "directions_run" },
    { key: "centralMidfield", icon: "swap_horiz" },
    { key: "forward", icon: "sports_soccer" },
];

interface BenchQuickEditProps {
    teamId: string;
    bench: Record<BenchRole, string | null>;
    /** Lightweight player list for the picker. */
    players: { id: string; name: string }[];
    onSaved: (bench: Record<BenchRole, string | null>) => void;
}

export default function BenchQuickEdit({
    teamId,
    bench,
    players,
    onSaved,
}: BenchQuickEditProps) {
    const t = useTranslations("club.bench");
    const tCommon = useTranslations();
    const [draft, setDraft] = useState(bench);
    const [openSlot, setOpenSlot] = useState<BenchRole | null>(null);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const dirty =
        (Object.keys(bench) as BenchRole[]).some(
            (k) => (draft[k] ?? null) !== (bench[k] ?? null),
        );

    const playerName = (id: string | null | undefined) =>
        id ? players.find((p) => p.id === id)?.name ?? t("unassigned") : t("empty");

    const handleSave = async () => {
        if (!dirty) return;
        setPending(true);
        setError(null);
        try {
            await api.teams.updateBenchConfig(teamId, draft);
            onSaved(draft);
            // §5.4 cross-page sync: notify other listeners (e.g. tactics editor
            // if it starts reading benchConfig later) to refetch.
            if (typeof window !== "undefined") {
                window.dispatchEvent(
                    new CustomEvent("club:bench-updated", { detail: { teamId, bench: draft } }),
                );
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : tCommon("common.error"));
        } finally {
            setPending(false);
        }
    };

    return (
        <div className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/10 space-y-4">
            <header>
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
                    <span className="material-symbols-outlined text-base">groups</span>
                    <span>{t("title")}</span>
                </div>
                <h3 className="font-headline text-lg font-bold text-on-surface">
                    {t("subtitle")}
                </h3>
                <p className="text-xs text-on-surface-variant mt-1">{t("hint")}</p>
            </header>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {SLOTS.map((slot) => {
                    const filled = !!draft[slot.key];
                    return (
                        <button
                            key={slot.key}
                            type="button"
                            onClick={() => setOpenSlot(slot.key)}
                            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                                filled
                                    ? "border-primary/30 bg-primary/10"
                                    : "border-dashed border-outline-variant/30 bg-surface-container"
                            }`}
                        >
                            <span className="material-symbols-outlined text-base text-on-surface-variant">
                                {slot.icon}
                            </span>
                            <div className="flex-1 min-w-0">
                                <div className="font-label text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                                    {t(`slots.${slot.key}`)}
                                </div>
                                <div
                                    className={`font-headline text-sm font-bold truncate ${
                                        filled ? "text-on-surface" : "text-on-surface-variant/60"
                                    }`}
                                >
                                    {playerName(draft[slot.key])}
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>

            {error && (
                <div className="px-3 py-2 rounded-lg border border-error/30 bg-error/10 text-error text-xs">
                    {error}
                </div>
            )}

            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={!dirty || pending}
                    className="px-4 py-2 rounded-lg bg-primary text-on-primary font-headline text-xs font-bold uppercase tracking-widest disabled:opacity-40 hover:opacity-90 transition-opacity"
                >
                    {pending ? tCommon("common.loading") : tCommon("common.save")}
                </button>
                <button
                    type="button"
                    onClick={() => setDraft(bench)}
                    disabled={!dirty || pending}
                    className="px-4 py-2 rounded-lg border border-outline-variant/30 text-on-surface-variant font-headline text-xs font-bold uppercase tracking-widest disabled:opacity-40 hover:bg-surface-container transition-colors"
                >
                    {tCommon("common.cancel")}
                </button>
            </div>

            {/* Picker drawer */}
            {openSlot && (
                <div
                    className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4"
                    onClick={() => setOpenSlot(null)}
                >
                    <div
                        className="bg-surface-container-low rounded-t-2xl md:rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <header className="px-5 py-3 border-b border-outline-variant/10 flex items-center justify-between">
                            <h4 className="font-headline text-sm font-bold uppercase tracking-widest">
                                {t(`slots.${openSlot}`)}
                            </h4>
                            <button
                                type="button"
                                onClick={() => setOpenSlot(null)}
                                className="material-symbols-outlined text-on-surface-variant"
                            >
                                close
                            </button>
                        </header>
                        <div className="overflow-y-auto flex-1">
                            <button
                                type="button"
                                onClick={() => {
                                    setDraft((d) => ({ ...d, [openSlot]: null }));
                                    setOpenSlot(null);
                                }}
                                className="w-full px-5 py-3 text-left font-body text-sm text-on-surface-variant hover:bg-surface-container border-b border-outline-variant/10"
                            >
                                {t("empty")}
                            </button>
                            {players.map((p) => (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => {
                                        setDraft((d) => ({ ...d, [openSlot]: p.id }));
                                        setOpenSlot(null);
                                    }}
                                    className="w-full px-5 py-3 text-left font-body text-sm text-on-surface hover:bg-surface-container border-b border-outline-variant/10"
                                >
                                    {p.name}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
