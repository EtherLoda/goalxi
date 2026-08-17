"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, usePathname } from "next/navigation";
import { api, type User } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { routing } from "@/i18n/routing";

interface SiteLanguageFormProps {
    user: User;
}

/**
 * Pick the UI language. The change is two-step:
 *   1. `router.push` to the new locale segment FIRST so the UI
 *      flips immediately (no flash of "save → reload → 404" while
 *      the PATCH is in flight).
 *   2. PATCH `/users/me` with the new `preferredLanguage` so the
 *      server-side copy is in sync for the next session.
 *   3. Sync the in-memory `AuthContext` user via `refreshUser`
 *      so the rest of the app reads the new value without a
 *      full reload.
 *
 * If the PATCH fails, we roll the URL back to the previous
 * locale and surface the error inline. We do NOT re-throw —
 * the user has already seen the UI change and is mid-action;
 * the rollback is a defensive measure, not a panic.
 */
export default function SiteLanguageForm({ user }: SiteLanguageFormProps) {
    const t = useTranslations("settings.site.language");
    const router = useRouter();
    const pathname = usePathname();
    const { refreshUser } = useAuth();

    const [value, setValue] = useState(user.preferredLanguage ?? routing.defaultLocale);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        setValue(user.preferredLanguage ?? routing.defaultLocale);
    }, [user.preferredLanguage]);

    const supported = routing.locales as readonly string[];
    const handleChange = async (next: string) => {
        if (next === value) return;
        setError(null);
        setSaved(false);

        const previous = value;
        setValue(next);
        setIsSaving(true);

        // 1. Flip the URL first so the UI re-renders in the new locale
        //    immediately. We swap just the leading segment; the rest
        //    of the path is preserved so the user stays on the
        //    settings page.
        const swapLocale = (() => {
            if (!pathname) return null;
            const segments = pathname.split("/");
            if (segments.length > 1 && supported.includes(segments[1])) {
                segments[1] = next;
                return segments.join("/") || "/";
            }
            // Pathname didn't start with a locale segment (shouldn't
            // happen, but be defensive) — push to a clean settings
            // page in the new locale.
            return `/${next}/settings/site`;
        })();

        if (swapLocale) router.push(swapLocale);

        try {
            // 2. Persist the choice server-side.
            await api.users.updateMe({
                preferredLanguage: next as 'en' | 'zh',
            });
            // 3. Refresh the in-memory user so other surfaces
            //    (e.g. AuthContext's auto-redirect logic) see the
            //    new value.
            await refreshUser?.();
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err: unknown) {
            // Roll back both the URL and the in-memory pick so the
            // next render matches the server's view.
            setValue(previous);
            if (swapLocale) {
                const rollback = (() => {
                    const segs = pathname?.split("/") ?? [];
                    if (segs.length > 1 && supported.includes(segs[1])) {
                        segs[1] = previous;
                        return segs.join("/") || "/";
                    }
                    return `/${previous}/settings/site`;
                })();
                router.push(rollback);
            }
            setError(err instanceof Error ? err.message : "Failed to switch language");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            <p className="text-sm text-on-surface-variant">{t("subtitle")}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {supported.map((code) => {
                    const isActive = value === code;
                    return (
                        <button
                            key={code}
                            type="button"
                            onClick={() => handleChange(code)}
                            disabled={isSaving}
                            aria-pressed={isActive}
                            className={`px-4 py-3 rounded-xl border text-left transition-colors disabled:opacity-60 ${
                                isActive
                                    ? "bg-primary/10 border-primary/40 text-on-surface"
                                    : "bg-surface-container-low border-outline-variant/20 text-on-surface-variant hover:text-on-surface hover:border-outline-variant/40"
                            }`}
                        >
                            <div className="flex items-center gap-3">
                                <span
                                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                        isActive
                                            ? "border-primary"
                                            : "border-outline-variant/40"
                                    }`}
                                >
                                    {isActive && (
                                        <span className="w-2 h-2 rounded-full bg-primary" />
                                    )}
                                </span>
                                <span className="font-headline text-sm font-bold uppercase tracking-widest">
                                    {t(code as 'en' | 'zh')}
                                </span>
                                {isActive && (
                                    <span className="ml-auto text-[10px] font-mono uppercase tracking-widest text-primary">
                                        {code}
                                    </span>
                                )}
                            </div>
                            {isActive && isSaving && (
                                <p className="mt-2 text-[10px] text-on-surface-variant">
                                    {t("switching")}
                                </p>
                            )}
                        </button>
                    );
                })}
            </div>
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
