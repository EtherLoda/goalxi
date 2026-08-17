import { useGameStore } from "@/stores/gameStore";

/**
 * All client-side date/time formatting should go through these
 * helpers. They read the timezone off the `gameStore` so a single
 * `SiteTimezoneForm` change propagates everywhere a time is shown
 * (match kickoff, notification timestamps, finance ledger) without
 * touching the call sites.
 *
 * Server-rendered text (email templates, notification bodies,
 * settlement cron logs) is NOT switched to the user's timezone —
 * the decision in `snappy-proud-penguin.md` is "FE only".
 *
 * The helpers take a `locale` argument rather than reading
 * `useRouter()` so they work outside React components too (e.g.
 * inside a `Intl.RelativeTimeFormat` update loop in a Zustand
 * listener).
 */

const FALLBACK_TZ = "UTC";

function readTimezone(): string {
    // `getState()` is the non-hook read path so this works inside
    // callbacks / event handlers / setIntervals that don't have
    // a React render context.
    return useGameStore.getState().timezone || FALLBACK_TZ;
}

export interface FormatOptions {
    /** BCP-47 locale code (e.g. `'en'`, `'zh'`). */
    locale: string;
    /** Override the timezone for a single call; defaults to the
     *  current `gameStore.timezone`. Mostly used by tests. */
    timeZone?: string;
}

/**
 * Format a date as a localised date+time string in the user's
 * current timezone. Example output:
 *   `8/17/2026, 1:49 PM` (en, Asia/Shanghai)
 *   `2026/8/17 13:49`   (zh, Asia/Shanghai)
 */
export function formatDatetime(value: Date | string, opts: FormatOptions): string {
    const d = typeof value === "string" ? new Date(value) : value;
    return new Intl.DateTimeFormat(opts.locale, {
        timeZone: opts.timeZone ?? readTimezone(),
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(d);
}

/** Date only (e.g. for a season/week badge). */
export function formatDate(value: Date | string, opts: FormatOptions): string {
    const d = typeof value === "string" ? new Date(value) : value;
    return new Intl.DateTimeFormat(opts.locale, {
        timeZone: opts.timeZone ?? readTimezone(),
        year: "numeric",
        month: "short",
        day: "numeric",
    }).format(d);
}

/** Time only. */
export function formatTime(value: Date | string, opts: FormatOptions): string {
    const d = typeof value === "string" ? new Date(value) : value;
    return new Intl.DateTimeFormat(opts.locale, {
        timeZone: opts.timeZone ?? readTimezone(),
        hour: "numeric",
        minute: "2-digit",
    }).format(d);
}

/**
 * React-friendly read of the active timezone. Subscribes to the
 * store so consumers re-render when the user switches timezones
 * via `SiteTimezoneForm`.
 */
export function useTimezone(): string {
    return useGameStore((s) => s.timezone || FALLBACK_TZ);
}
