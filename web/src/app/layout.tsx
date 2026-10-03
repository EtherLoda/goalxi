import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

/**
 * Fonts are self-hosted through next/font: the browser downloads them
 * from our own origin with a real preload instead of a render-blocking
 * third-party stylesheet, and there is no external request to leak a
 * visitor to. The CSS variables are consumed by the `--font-*` tokens
 * in globals.css, so utility classes stay font-agnostic.
 *
 * Only `latin` is loaded. Neither family carries CJK glyphs, so the
 * zh UI has always rendered through the system-ui fallback — this
 * keeps that behaviour and keeps the payload small.
 */
const spaceGrotesk = Space_Grotesk({
    subsets: ["latin"],
    weight: ["300", "400", "500", "600", "700"],
    variable: "--font-space-grotesk",
    display: "swap",
});

const inter = Inter({
    subsets: ["latin"],
    weight: ["300", "400", "500", "600", "700"],
    variable: "--font-inter",
    display: "swap",
});

export const metadata: Metadata = {
    title: "GoalXI - Tactical Intelligence & Elite Performance",
    description:
        "Build your squad, set your tactics, and watch them play out minute by minute across an 85-league pyramid.",
    // NOTE: no og:image yet - public/ ships no raster asset, and a social
    // card pointing at a non-existent file is worse than none. Add one
    // (1200x630, real product screenshot) alongside this field.
    openGraph: {
        title: "GoalXI - Tactical Intelligence & Elite Performance",
        description:
            "Build your squad, set your tactics, and watch them play out minute by minute across an 85-league pyramid.",
        siteName: "GoalXI",
        type: "website",
    },
    twitter: {
        card: "summary",
        title: "GoalXI - Tactical Intelligence & Elite Performance",
        description:
            "Build your squad, set your tactics, and watch them play out minute by minute across an 85-league pyramid.",
    },
};

/**
 * Pure HTML shell. Intentionally contains no providers.
 *
 * Every live app route is mounted under `app/[locale]/...`, so
 * the real provider tree (`NextIntlClientProvider`,
 * `AuthProvider`, `TeamViewProvider`) lives one level down in
 * `app/[locale]/layout.tsx`. Keeping a second copy up here was
 * the cause of the en/zh redirect-loop reported on 2026-08-19:
 *
 *   - `AuthContext` ships a `useEffect` that auto-corrects the
 *     URL locale to match `user.preferredLanguage` on every
 *     navigation (`AuthContext.tsx:329`).
 *   - With TWO `AuthProvider` instances in the tree, each held
 *     its own `useState(user)`. `SiteLanguageForm` only updates
 *     the *inner* provider's `user` via `refreshUser`, so the
 *     *outer* provider kept seeing the stale
 *     `preferredLanguage` (e.g. `'en'`) and pushed every URL
 *     change back to `/en/...`, while the inner provider
 *     pushed to `/zh/...`. Result: the URL flickered
 *     `/en/ ↔ /zh/` indefinitely, the login page couldn't
 *     settle, and any "Submit" hit was on a form mid-remount.
 *
 * Pinning the rule: this file MUST NOT import
 * `NextIntlClientProvider`, `AuthProvider`, or
 * `TeamViewProvider`. A tripwire spec in
 * `web/src/app/layout.spec.ts` greps for those names and
 * fails the build if they ever sneak back in.
 */
export default function RootLayout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    return (
        <html
            lang="en"
            className={`dark ${spaceGrotesk.variable} ${inter.variable}`}
            suppressHydrationWarning
        >
            <body
                className="min-h-screen bg-surface text-on-surface antialiased"
                suppressHydrationWarning
            >
                {children}
            </body>
        </html>
    );
}
