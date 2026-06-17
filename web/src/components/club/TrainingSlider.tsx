"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";

interface TrainingSliderProps {
    teamId: string;
    value: number;
    /** ISO date string of last change (server-provided). Limits to 1/week. */
    lastChangedAt?: string | null;
    onSaved: (value: number) => void;
}

const STEP = 0.05;
const WARN_THRESHOLD = 0.5;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default function TrainingSlider({
    teamId,
    value,
    lastChangedAt,
    onSaved,
}: TrainingSliderProps) {
    const t = useTranslations("club.training");
    const tCommon = useTranslations();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [draft, setDraft] = useState(value);
    const dirty = Math.abs(draft - value) >= STEP / 2;
    const highIntensity = draft > WARN_THRESHOLD;

    const lastChangeDate = lastChangedAt ? new Date(lastChangedAt) : null;
    const canChange =
        !lastChangeDate || Date.now() - lastChangeDate.getTime() > WEEK_MS;

    const handleSave = async () => {
        if (!dirty || !canChange) return;
        setPending(true);
        setError(null);
        try {
            await api.teams.update(teamId, { staminaTrainingIntensity: draft });
            onSaved(draft);
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
                    <span className="material-symbols-outlined text-base">fitness_center</span>
                    <span>{t("title")}</span>
                </div>
                <h3 className="font-headline text-lg font-bold text-on-surface">
                    {t("subtitle")}
                </h3>
            </header>

            <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                    <span className="font-headline text-3xl font-black text-primary">
                        {Math.round(draft * 100)}%
                    </span>
                    <span className="text-xs text-on-surface-variant">
                        {t("step", { pct: Math.round(STEP * 100) })}
                    </span>
                </div>
                <input
                    type="range"
                    min={0}
                    max={1}
                    step={STEP}
                    value={draft}
                    onChange={(e) => setDraft(Number(e.target.value))}
                    disabled={!canChange}
                    className="w-full accent-primary"
                />
            </div>

            {highIntensity && (
                <div className="px-3 py-2 rounded-lg border border-amber-400/30 bg-amber-400/10 text-amber-200 text-xs">
                    {t("highWarn")}
                </div>
            )}
            {!canChange && (
                <div className="px-3 py-2 rounded-lg border border-outline-variant/20 bg-surface-container text-on-surface-variant text-xs">
                    {t("weeklyLimit")}
                </div>
            )}

            {error && (
                <div className="px-3 py-2 rounded-lg border border-error/30 bg-error/10 text-error text-xs">
                    {error}
                </div>
            )}

            <button
                type="button"
                onClick={handleSave}
                disabled={!dirty || !canChange || pending}
                className="px-4 py-2 rounded-lg bg-primary text-on-primary font-headline text-xs font-bold uppercase tracking-widest disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
                {pending ? tCommon("common.loading") : tCommon("common.save")}
            </button>
        </div>
    );
}
