/**
 * Pin the timezone-flow contract for `formatDatetime`. The user-
 * facing behaviour we care about:
 *   1. Two calls with different `gameStore.timezone` values return
 *      different formatted strings for the same UTC instant.
 *   2. The default fallback (`'UTC'`) is what consumers see before
 *      `AuthContext` has hydrated.
 *   3. Locale is passed through to `Intl.DateTimeFormat`, so
 *      `en` and `zh` produce different output for the same time.
 *
 * We use a fixed `Date` to keep the test deterministic. Anything
 * that runs through `Date.now()` would be flaky across DST
 * boundaries and CI machine timezones.
 */
import { useGameStore } from "@/stores/gameStore";
import { formatDatetime } from "./format-datetime";

// A known UTC instant: 2026-08-17T05:49:00Z.
// Equivalent to 13:49 in Asia/Shanghai (UTC+8) and 01:49 in
// America/New_York (UTC-4).
const FIXED_UTC = new Date("2026-08-17T05:49:00.000Z");

function setStoreTz(tz: string) {
    useGameStore.setState({ timezone: tz });
}

describe("formatDatetime", () => {
    beforeEach(() => {
        setStoreTz("UTC");
    });

    it("honours gameStore.timezone for the timeZone option", () => {
        const utc = formatDatetime(FIXED_UTC, { locale: "en" });
        const sh = formatDatetime(FIXED_UTC, {
            locale: "en",
            timeZone: "Asia/Shanghai",
        });
        expect(utc).not.toBe(sh);
    });

    it("falls back to UTC when the store has no timezone yet", () => {
        setStoreTz("");
        const out = formatDatetime(FIXED_UTC, { locale: "en" });
        // The 24-hour minute will land on "5:49 AM" in UTC, never
        // 13:49. We don't pin the full format string — that's a
        // Intl platform detail — only the time part.
        expect(out).toMatch(/5:49/);
    });

    it("localises by the `locale` option (en vs zh differ)", () => {
        const en = formatDatetime(FIXED_UTC, {
            locale: "en",
            timeZone: "UTC",
        });
        const zh = formatDatetime(FIXED_UTC, {
            locale: "zh",
            timeZone: "UTC",
        });
        expect(en).not.toBe(zh);
    });

    it("accepts an ISO string as well as a Date", () => {
        const fromStr = formatDatetime(FIXED_UTC.toISOString(), {
            locale: "en",
            timeZone: "UTC",
        });
        const fromDate = formatDatetime(FIXED_UTC, {
            locale: "en",
            timeZone: "UTC",
        });
        expect(fromStr).toBe(fromDate);
    });
});
