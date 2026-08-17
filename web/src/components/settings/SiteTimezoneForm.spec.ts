/**
 * Pin the curated timezone list shape. A future refactor
 * must not:
 *   - shrink the list below 24 entries (we promised the user
 *     "covers 24 timezones" — losing coverage breaks that),
 *   - drop Asia/Shanghai ("Beijing Time") — this is the
 *     canonical Chinese user setting and the most likely
 *     accidental removal,
 *   - produce duplicate values (the <select> would silently
 *     pick the first one).
 *
 * Reads the source file and asserts the structural invariants
 * rather than re-importing the constant, so the tripwire also
 * works if the constant is renamed.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("SiteTimezoneForm curated list", () => {
    const source = readFileSync(
        join(__dirname, "SiteTimezoneForm.tsx"),
        "utf8",
    );

    it("contains at least 24 curated entries", () => {
        // Count `value: "..."` strings inside the curated block.
        // We deliberately use a regex rather than `eval`/import
        // so the test reads as "the file contains at least N
        // curated rows" without dragging in module state.
        const valueEntries = source.match(/value:\s*"/g) ?? [];
        expect(valueEntries.length).toBeGreaterThanOrEqual(24);
    });

    it("includes Asia/Shanghai labeled as Beijing Time", () => {
        expect(source).toMatch(/value:\s*"Asia\/Shanghai"/);
        expect(source).toMatch(/Beijing Time/);
    });

    it("has no duplicate IANA values in the curated list", () => {
        // Extract every `value: "<zone>"` from the file. Duplicates
        // in the curated block would silently break the <select>.
        const matches = [
            ...source.matchAll(/value:\s*"([^"]+)"/g),
        ].map((m) => m[1]);
        const unique = new Set(matches);
        expect(unique.size).toBe(matches.length);
    });
});
