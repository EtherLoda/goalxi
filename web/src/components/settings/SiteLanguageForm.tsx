"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { api, type User } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { routing } from "@/i18n/routing";
import { useRouter, usePathname } from "@/i18n/navigation";

interface SiteLanguageFormProps {
    user: User;
}

/**
 * Pick the UI language. Three moves, no flicker:
 *
 *   1. Wrap the navigation in `startTransition` so React keeps
 *      the current tree visible while the new locale's
 *      message bundle is being prepared. Without this, the
 *      URL flip immediately unmounts the current tree and
 *      the user sees a brief blank/loading state - the
 *      "flash" the original implementation produced.
 *   2. `router.replace` (not `push`) with the next-intl
 *      locale-aware router. This:
 *        - avoids polluting the history stack with one entry
 *          per language click,
 *        - keeps the same `pathname` + `query` so we don't
 *          have to hand-build the new URL and risk a bug
 *          around the locale segment.
 *   3. PATCH `/users/me` in the background. If the call
 *      fails we ROLL BACK both the URL (in another
 *      `startTransition`) and the local pick, so the
 *      server's view of the world stays the source of truth.
 */
export default function SiteLanguageForm({ user }: SiteLanguageFormProps) {
    const t = useTranslations("settings.site.language");
    const router = useRouter();
    // NOTE: `usePathname` from `next-intl/navigation` returns the
    // path *without* the locale prefix (e.g. `/settings/site`),
    // which is what `router.replace` wants. The `useSearchParams`
    // hook still comes from `next/navigation` - that one is
    // locale-agnostic.
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { refreshUser } = useAuth();
    const [isPending, startTransition] = useTransition();

    const [value, setValue] = useState(
        user.preferredLanguage ?? routing.defaultLocale,
    );
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        setValue(user.preferredLanguage ?? routing.defaultLocale);
    }, [user.preferredLanguage]);

    /**
     * The "button is doing something" signal - either the URL
     * transition is in flight, or the PATCH is still in flight.
     * Drives both the disabled state and the "switching..."
     * microcopy under the active button.
     */
    const busy = isPending || isSaving;

    const supported = routing.locales as readonly string[];
    const handleChange = async (next: string) => {
        if (next === value) return;
        setError(null);
        setSaved(false);

        const previous = value;
        setValue(next);
        setIsSaving(true);

        // `useSearchParams()` returns `ReadonlyURLSearchParams | null`;
        // flatten to a plain object so next-intl's router can rebuild
        // the query string on the new URL.
        const query = Object.fromEntries(searchParams?.entries() ?? []);

        // Wrap the navigation in `startTransition` so React keeps
        // the current page visible while the new locale is being
        // prepared. This is the fix for the flicker.
        startTransition(() => {
            router.replace({ pathname, query }, { locale: next });
        });

        try {
            await api.users.updateMe({
                preferredLanguage: next as 'en' | 'zh',
            });
            await refreshUser?.();
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err: unknown) {
            // Roll the URL back to the previous locale so the
            // visible URL matches the server's view of the world.
            setValue(previous);
            startTransition(() => {
                router.replace({ pathname, query }, { locale: previous });
            });
            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to switch language",
            );
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
                            disabled={busy}
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
                            {isActive && busy && (
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
