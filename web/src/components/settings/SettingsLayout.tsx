"use client";

import type { ReactNode } from "react";
import SettingsNav from "./SettingsNav";

interface SettingsLayoutProps {
    locale: string;
    children: ReactNode;
}

/**
 * Shell for the three Settings sub-pages. Sidebar on desktop collapses to
 * a top tab bar on narrow viewports (see the .lg: breakpoint).
 *
 * The page-specific header (eyebrow / title / subtitle) is rendered by each
 * child page inside the right column — this layout only owns the chrome.
 */
export default function SettingsLayout({ locale, children }: SettingsLayoutProps) {
    return (
        <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-8">
                <aside className="lg:sticky lg:top-6 lg:self-start">
                    <SettingsNav locale={locale} />
                </aside>
                <main className="min-w-0 space-y-8">{children}</main>
            </div>
        </div>
    );
}
