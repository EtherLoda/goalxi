"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api, type StadiumSummary } from "@/lib/api";

interface StadiumCapacityPanelProps {
    teamId: string;
    summary: StadiumSummary | null;
    onChanged: () => void;
}

const MIN_CAPACITY = 1000;
const CAPACITY_STEP = 500;

export default function StadiumCapacityPanel({
    teamId,
    summary,
    onChanged,
}: StadiumCapacityPanelProps) {
    const t = useTranslations("club.stadium");
    const tCommon = useTranslations();
    const [newCapacity, setNewCapacity] = useState(
        summary?.capacity?.toString() ?? "10000",
    );
    const [pendingAction, setPendingAction] = useState<"build" | "demolish" | "rename" | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [confirmText, setConfirmText] = useState("");

    const requestedCapacity = Number(newCapacity);
    const buildCost =
        Number.isFinite(requestedCapacity) && requestedCapacity >= MIN_CAPACITY
            ? requestedCapacity * 50
            : null;

    const handleBuild = async () => {
        if (!buildCost) return;
        setPendingAction("build");
        setError(null);
        try {
            await api.stadium.build(teamId, requestedCapacity);
            onChanged();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : tCommon("common.error"));
        } finally {
            setPendingAction(null);
        }
    };

    const handleDemolish = async () => {
        if (confirmText !== "demolish") return;
        setPendingAction("demolish");
        setError(null);
        try {
            await api.stadium.demolish(teamId);
            setConfirmText("");
            onChanged();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : tCommon("common.error"));
        } finally {
            setPendingAction(null);
        }
    };

    if (!summary) {
        return (
            <div className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/10 text-center">
                <span className="material-symbols-outlined text-4xl text-on-surface-variant/40">
                    stadium
                </span>
                <p className="font-body text-sm text-on-surface-variant mt-3">
                    {t("none")}
                </p>
            </div>
        );
    }

    return (
        <div className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/10 space-y-6">
            <header>
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
                    <span className="material-symbols-outlined text-base">stadium</span>
                    <span>{t("title")}</span>
                </div>
                <h3 className="font-headline text-2xl font-black text-on-surface">
                    {summary.name}
                </h3>
            </header>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat label={t("capacity")} value={summary.capacity.toLocaleString()} />
                <Stat
                    label={t("avgAttendance")}
                    value={
                        summary.currentSeasonAvgAttendance != null
                            ? summary.currentSeasonAvgAttendance.toLocaleString()
                            : "—"
                    }
                />
                <Stat
                    label={t("estRevenue")}
                    value={summary.estMatchdayRevenue.toLocaleString()}
                />
                <Stat
                    label={t("demolishRefund")}
                    value={summary.demolishRefund.toLocaleString()}
                />
            </div>

            {error && (
                <div className="px-4 py-3 rounded-lg border border-error/30 bg-error/10 text-error text-sm">
                    {error}
                </div>
            )}

            {/* Rebuild */}
            <div className="pt-4 border-t border-outline-variant/10 space-y-3">
                <h4 className="font-headline text-sm font-bold text-on-surface uppercase tracking-widest">
                    {t("rebuild")}
                </h4>
                <div className="flex items-end gap-3">
                    <div className="flex-1">
                        <label className="block font-label text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1.5">
                            {t("newCapacity")}
                        </label>
                        <input
                            type="number"
                            value={newCapacity}
                            onChange={(e) => setNewCapacity(e.target.value)}
                            min={MIN_CAPACITY}
                            step={CAPACITY_STEP}
                            className="w-full px-3 py-2.5 bg-surface-container border border-outline-variant/20 rounded-lg font-body text-sm text-on-surface focus:outline-none focus:border-primary"
                        />
                    </div>
                    <div className="text-right">
                        <div className="font-label text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1.5">
                            {t("cost")}
                        </div>
                        <div className="font-headline text-lg font-black text-on-surface">
                            {buildCost != null ? buildCost.toLocaleString() : "—"}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleBuild}
                        disabled={buildCost == null || pendingAction !== null}
                        className="px-4 py-2.5 rounded-lg bg-primary text-on-primary font-headline text-sm font-bold uppercase tracking-widest disabled:opacity-40 hover:opacity-90 transition-opacity"
                    >
                        {pendingAction === "build" ? t("rebuilding") : t("rebuild")}
                    </button>
                </div>
            </div>

            {/* Demolish (with confirm) */}
            <div className="pt-4 border-t border-outline-variant/10 space-y-3">
                <h4 className="font-headline text-sm font-bold text-error uppercase tracking-widest">
                    {t("demolishTitle")}
                </h4>
                <p className="text-xs text-on-surface-variant">{t("demolishWarn")}</p>
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        placeholder={t("demolishConfirmPlaceholder")}
                        className="flex-1 px-3 py-2 bg-surface-container border border-outline-variant/20 rounded-lg font-mono text-xs text-on-surface focus:outline-none focus:border-error"
                    />
                    <button
                        type="button"
                        onClick={handleDemolish}
                        disabled={confirmText !== "demolish" || pendingAction !== null}
                        className="px-4 py-2.5 rounded-lg border border-error/40 bg-error/10 text-error font-headline text-xs font-bold uppercase tracking-widest disabled:opacity-40 hover:bg-error/20 transition-colors"
                    >
                        {pendingAction === "demolish" ? t("demolishing") : t("demolish")}
                    </button>
                </div>
            </div>
        </div>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="bg-surface-container rounded-lg p-3">
            <div className="font-label text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1">
                {label}
            </div>
            <div className="font-headline text-lg font-black text-on-surface">{value}</div>
        </div>
    );
}
