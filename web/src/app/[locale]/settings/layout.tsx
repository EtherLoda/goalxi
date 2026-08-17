import type { ReactNode } from "react";
import SettingsLayoutClient from "@/components/settings/SettingsLayout";

interface SettingsRouteLayoutProps {
    children: ReactNode;
    // Next.js 16+ types `params` as a Promise; awaiting here is what the
    // generated LayoutConfig<...> check expects.
    params: Promise<{ locale: string }>;
}

/**
 * Server layout for the three Settings sub-routes. Pulls the locale out of
 * the URL params and hands it to the client `SettingsLayout` shell. Keeping
 * this a server component means we don't ship the nav/highlight JS for pages
 * that don't use a sidebar.
 */
export default async function SettingsRouteLayout({
    children,
    params,
}: SettingsRouteLayoutProps) {
    const { locale } = await params;
    return <SettingsLayoutClient locale={locale}>{children}</SettingsLayoutClient>;
}
