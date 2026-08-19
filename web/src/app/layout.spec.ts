import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Source-level tripwire for the "two AuthProvider trees" bug
 * that locked the URL in an en/zh redirect loop on 2026-08-19.
 *
 * Why a source grep instead of a behavioural test: the failure
 * mode is a React-context double-mount that requires a real
 * router / `useEffect` race to reproduce. Pinning the rule on
 * the file's content catches the root cause at PR time, before
 * the slow `pnpm dev` round-trip tells you the page flickers
 * again.
 *
 * Pinned rule: `web/src/app/layout.tsx` (the root layout) MUST
 * NOT import `NextIntlClientProvider`, `AuthProvider`, or
 * `TeamViewProvider`. The locale-aware app routes all live
 * under `app/[locale]/...` and the only place the provider
 * tree belongs is `app/[locale]/layout.tsx`.
 */
describe("app/layout.tsx — root layout stays a pure HTML shell", () => {
    const source = readFileSync(
        join(__dirname, "layout.tsx"),
        "utf8",
    );

    const FORBIDDEN = [
        {
            symbol: "NextIntlClientProvider",
            why:
                "The locale-aware variant lives in [locale]/layout.tsx. " +
                "Re-adding it at the root creates a double-NICP tree and " +
                "drives the en/zh redirect loop when combined with a " +
                "double AuthProvider.",
        },
        {
            symbol: "AuthProvider",
            why:
                "Two AuthProvider trees hold independent `useState(user)`. " +
                "Only the inner one is updated by `SiteLanguageForm.refreshUser`; " +
                "the outer keeps its stale `preferredLanguage` and the " +
                "auto-correct effect pushes the URL back to the old locale, " +
                "indefinitely.",
        },
        {
            symbol: "TeamViewProvider",
            why:
                "Same double-mount shape as AuthProvider — independent state " +
                "for the inner-vs-outer tree. Kept down here for consistency " +
                "with the rule for AuthProvider.",
        },
    ] as const;

    for (const { symbol, why } of FORBIDDEN) {
        it(`does not import ${symbol} (${why})`, () => {
            // Match an `import` line that mentions the symbol.
            // `from "..."` boundaries are irrelevant; the import
            // is the smell regardless of source.
            const importPattern = new RegExp(
                `^\\s*import\\b[\\s\\S]{0,200}\\b${symbol}\\b`,
                "m",
            );
            expect({
                symbol,
                snippet: importPattern.exec(source)?.[0] ?? null,
            }).toEqual({ symbol, snippet: null });
        });
    }

    it("does not wrap children in any provider tag (defence against copy-paste regressions)", () => {
        // Belt-and-braces: even if the symbol isn't imported by
        // name (e.g. a future `* as Providers` re-export), the
        // layout must not introduce a JSX-level provider layer.
        // We expect a flat `<html><body>{children}</body></html>`
        // shape — no wrapper component around `{children}`.
        const bodyMatch = source.match(/<body[^>]*>([\s\S]*?)<\/body>/);
        expect(bodyMatch).not.toBeNull();
        const body = bodyMatch![1].trim();
        // The body should render `{children}` directly. Any
        // wrapper component around it (`<X>...{children}...</X>`)
        // would be the regression.
        expect(body).toBe("{children}");
    });
});
