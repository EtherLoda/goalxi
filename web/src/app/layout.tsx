import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "GoalXI — Tactical Intelligence & Elite Performance",
    description:
        "The most immersive tactical football management experience on the web. Master the pitch with precision data.",
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
        <html lang="en" className="dark" suppressHydrationWarning>
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link
                    rel="preconnect"
                    href="https://fonts.gstatic.com"
                    crossOrigin="anonymous"
                />
                <link
                    href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap"
                    rel="stylesheet"
                />
                <link
                    rel="stylesheet"
                    href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
                />
            </head>
            <body
                className="min-h-screen bg-surface text-on-surface antialiased"
                suppressHydrationWarning
            >
                {children}
            </body>
        </html>
    );
}
