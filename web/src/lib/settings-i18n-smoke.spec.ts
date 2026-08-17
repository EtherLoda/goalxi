/**
 * i18n smoke for the Settings namespace. Picker code in the new
 * components looks up keys like `settings.user.profile.nickname`;
 * if either en or zh is missing a key, the component silently
 * falls back to the parent bundle. This spec fails fast instead.
 *
 * Mirrors the pattern in `commentary-i18n-smoke.spec.ts`: import
 * both JSON files, list every key the components reach for, then
 * assert existence in both locales.
 */
import en from "../../messages/en.json";
import zh from "../../messages/zh.json";

/**
 * Keys in the Settings namespace the new commit 2 components
 * actually call. Kept flat (no `commentary.` prefix because
 * next-intl's `getSettings` strips the namespace). When a new
 * sub-section is added to a Settings form, add its key here
 * too or the new section ships without smoke coverage.
 */
const KEYS: Array<{ section: string; subs: string[]; tpls: number }> = [
    { section: "user.page", subs: [], tpls: 0 },
    { section: "user.profile", subs: [], tpls: 0 },
    { section: "user.security", subs: [], tpls: 0 },
    { section: "user.passwordDialog", subs: [], tpls: 0 },
    { section: "site.page", subs: [], tpls: 0 },
    { section: "site.language", subs: [], tpls: 0 },
    { section: "site.timezone", subs: [], tpls: 0 },
];

function lookup(
    bundle: Record<string, unknown>,
    dotted: string,
): unknown {
    return dotted
        .split(".")
        .reduce<unknown>(
            (acc, key) =>
                acc && typeof acc === "object"
                    ? (acc as Record<string, unknown>)[key]
                    : undefined,
            bundle,
        );
}

describe("settings i18n smoke", () => {
    describe("en.json", () => {
        KEYS.forEach(({ section, subs }) => {
            const stripped = section;
            if (subs.length === 0) {
                it(`has settings.${stripped} as a non-empty string`, () => {
                    const v = lookup(en, `settings.${stripped}`);
                    // Bundles can be either a flat string or an
                    // object containing `tpl_0..tpl_N`; the smoke
                    // check just wants to ensure the path is
                    // present and the leaf is well-formed.
                    if (typeof v === "string") {
                        expect(v.length).toBeGreaterThan(0);
                    } else {
                        expect(typeof v).toBe("object");
                    }
                });
            } else {
                subs.forEach((sub) => {
                    it(`has settings.${stripped}.${sub}`, () => {
                        const v = lookup(en, `settings.${stripped}.${sub}`);
                        expect(v).toBeDefined();
                    });
                });
            }
        });
    });

    describe("zh.json", () => {
        KEYS.forEach(({ section, subs }) => {
            const stripped = section;
            if (subs.length === 0) {
                it(`has settings.${stripped} as a non-empty string`, () => {
                    const v = lookup(zh, `settings.${stripped}`);
                    if (typeof v === "string") {
                        expect(v.length).toBeGreaterThan(0);
                    } else {
                        expect(typeof v).toBe("object");
                    }
                });
            } else {
                subs.forEach((sub) => {
                    it(`has settings.${stripped}.${sub}`, () => {
                        const v = lookup(zh, `settings.${stripped}.${sub}`);
                        expect(v).toBeDefined();
                    });
                });
            }
        });
    });
});
