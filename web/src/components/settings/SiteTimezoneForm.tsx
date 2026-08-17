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

/**
 * 24 curated timezones, one per UTC offset. We deliberately
 * avoid `Intl.supportedValuesOf("timeZone")` here — that list
 * has 400+ entries (every IANA zone) and is unmanageable in a
 * dropdown, with names like "America/Argentina/Buenos_Aires"
 * that most users don't recognise.
 *
 * Each entry pins a "label" + the IANA value. The label is
 * shown in the dropdown; the value is what we send to the
 * server. The order is the same as the UTC offset (most
 * negative first), so a user scanning the list can roughly
 * tell "where am I in the day" by vertical position.
 *
 * If a user's currently-picked (or auto-detected) timezone is
 * NOT in this list — e.g. `Intl` returns
 * `America/Argentina/Buenos_Aires` — we render it as a
 * synthetic "Detected" row at the top so the user can see what
 * is set without being forced into the curated list.
 */
interface TimezoneEntry {
    value: string;
    label: string;
}

const CURATED_TIMEZONES: ReadonlyArray<TimezoneEntry> = [
    { value: "Pacific/Midway",         label: "Midway (UTC-11)" },
    { value: "Pacific/Honolulu",       label: "Honolulu (UTC-10)" },
    { value: "America/Anchorage",      label: "Anchorage (UTC-9)" },
    { value: "America/Los_Angeles",    label: "Los Angeles (UTC-8)" },
    { value: "America/Denver",         label: "Denver (UTC-7)" },
    { value: "America/Chicago",        label: "Chicago (UTC-6)" },
    { value: "America/New_York",       label: "New York (UTC-5)" },
    { value: "America/Halifax",        label: "Halifax (UTC-4)" },
    { value: "America/Sao_Paulo",      label: "São Paulo (UTC-3)" },
    { value: "Atlantic/South_Georgia", label: "South Georgia (UTC-2)" },
    { value: "Atlantic/Cape_Verde",    label: "Cape Verde (UTC-1)" },
    { value: "Europe/London",          label: "London (UTC+0)" },
    { value: "Europe/Paris",           label: "Paris (UTC+1)" },
    { value: "Europe/Helsinki",        label: "Helsinki (UTC+2)" },
    { value: "Europe/Istanbul",        label: "Istanbul (UTC+3)" },
    { value: "Asia/Dubai",             label: "Dubai (UTC+4)" },
    { value: "Asia/Karachi",           label: "Karachi (UTC+5)" },
    { value: "Asia/Dhaka",             label: "Dhaka (UTC+6)" },
    { value: "Asia/Bangkok",           label: "Bangkok (UTC+7)" },
    { value: "Asia/Shanghai",          label: "Beijing Time (UTC+8)" },
    { value: "Asia/Tokyo",             label: "Tokyo (UTC+9)" },
    { value: "Australia/Sydney",       label: "Sydney (UTC+10)" },
    { value: "Pacific/Noumea",         label: "Noumea (UTC+11)" },
    { value: "Pacific/Auckland",       label: "Auckland (UTC+12)" },
];

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
    // selected zone produce a real-time clock.
    useEffect(() => {
        const id = setInterval(() => setPreview(new Date()), 1000);
        return () => clearInterval(id);
    }, []);

    /**
     * The options shown in the <select>. The curated list, plus
     * a synthetic "Detected" row at the top if the current
     * value (or a browser-detected value) isn't in the curated
     * list. Without this, a user whose browser reported an
     * off-list zone would see their setting vanish from the
     * dropdown and the form would silently fall back to the
     * first option on next save.
     */
    const options = useMemo(() => {
        const out: Array<{ value: string; label: string; isDetected: boolean }> = [];
        if (value && !CURATED_TIMEZONES.some((z) => z.value === value)) {
            out.push({ value, label: `${value} (current)`, isDetected: true });
        }
        for (const z of CURATED_TIMEZONES) {
            out.push({ value: z.value, label: z.label, isDetected: false });
        }
        return out;
    }, [value]);

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
                    className="flex-1 px-3 py-2.5 bg-surface-container-low border border-outline-variant/20 rounded-lg font-body text-sm text-on-surface focus:outline-none focus:border-primary transition-colors"
                >
                    {options.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
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
