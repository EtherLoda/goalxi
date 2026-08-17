"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { api, type User } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useGameStore } from "@/stores/gameStore";

interface SiteTimezoneFormProps {
    user: User;
}

const FALLBACK_TZ = "UTC";

function listSupportedTimezones(): string[] {
    // `Intl.supportedValuesOf` is a stage-4 proposal and shipped in
    // Node 18+ and every modern browser. Falls back to a tiny
    // hard-coded list for older runtimes (no current target
    // supports anything older, but the call site is hot — better
    // to be defensive).
    const fn = (Intl as unknown as {
        supportedValuesOf?: (key: string) => string[];
    }).supportedValuesOf;
    if (typeof fn === "function") {
        try {
            return fn("timeZone");
        } catch {
            // fall through
        }
    }
    return [
        FALLBACK_TZ,
        "America/New_York",
        "Europe/London",
        "Asia/Shanghai",
        "Asia/Tokyo",
        "Australia/Sydney",
    ];
}

function detectBrowserTimezone(): string {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TZ;
    } catch {
        return FALLBACK_TZ;
    }
}

export default function SiteTimezoneForm({ user }: SiteTimezoneFormProps) {
    const t = useTranslations("settings.site.timezone");
    const locale = useLocale();
    const { refreshUser } = useAuth();
    const storeTimezone = useGameStore((s) => s.timezone);
    const setStoreTimezone = useGameStore((s) => s.setTimezone);

    const [value, setValue] = useState(user.timezone || FALLBACK_TZ);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const [preview, setPreview] = useState(() => new Date());

    useEffect(() => {
        setValue(user.timezone || FALLBACK_TZ);
    }, [user.timezone]);

    // Live preview: tick every second so the user can see the
    // selected zone produce a real-time clock. Cheap; no cleanup
    // needed beyond the unmount cleanup below.
    useEffect(() => {
        const id = setInterval(() => setPreview(new Date()), 1000);
        return () => clearInterval(id);
    }, []);

    const timezones = useMemo(() => listSupportedTimezones(), []);

    const formattedPreview = useMemo(
        () =>
            new Intl.DateTimeFormat(locale, {
                timeZone: storeTimezone || value,
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
            }).format(preview),
        [preview, storeTimezone, value, locale],
    );

    const handleSave = async (next: string) => {
        if (next === value) return;
        setError(null);
        setSaved(false);
        setIsSaving(true);
        const previous = value;
        setValue(next);
        // Apply locally first so the preview tick shows the new
        // zone immediately, even before the PATCH round-trips.
        setStoreTimezone(next);
        try {
            await api.users.updateMe({ timezone: next });
            await refreshUser?.();
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err: unknown) {
            setValue(previous);
            setStoreTimezone(previous);
            setError(err instanceof Error ? err.message : "Failed to save timezone");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDetect = () => {
        const detected = detectBrowserTimezone();
        if (detected !== value) {
            void handleSave(detected);
        }
    };

    return (
        <div className="space-y-4">
            <p className="text-sm text-on-surface-variant">{t("subtitle")}</p>

            <div className="flex items-center gap-3">
                <select
                    value={value}
                    onChange={(e) => handleSave(e.target.value)}
                    disabled={isSaving}
                    className="flex-1 px-3 py-2.5 bg-surface-container-low border border-outline-variant/20 rounded-lg font-mono text-sm text-on-surface focus:outline-none focus:border-primary transition-colors"
                >
                    {timezones.map((tz) => (
                        <option key={tz} value={tz}>
                            {tz}
                        </option>
                    ))}
                </select>
                <button
                    type="button"
                    onClick={handleDetect}
                    disabled={isSaving}
                    className="px-3 py-2.5 rounded-lg border border-outline-variant/20 font-headline text-[10px] font-black uppercase tracking-widest text-on-surface-variant hover:text-on-surface hover:border-outline-variant/40 transition-colors disabled:opacity-60"
                >
                    {t("detect")}
                </button>
            </div>

            <p className="font-mono text-xs text-on-surface-variant">
                {t("currentPreview", { time: formattedPreview })}
            </p>

            {error && (
                <div className="px-3 py-2 rounded-lg border border-error/30 bg-error/10 text-error text-xs">
                    {error}
                </div>
            )}
            {saved && !error && (
                <div className="px-3 py-2 rounded-lg border border-primary/30 bg-primary/10 text-primary text-xs">
                    {t("saved")}
                </div>
            )}
        </div>
    );
}
