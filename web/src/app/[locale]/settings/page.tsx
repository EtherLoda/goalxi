import { redirect } from "next/navigation";

interface SettingsIndexProps {
    // Next.js 16+ types `params` as a Promise.
    params: Promise<{ locale: string }>;
}

/**
 * Visiting `/settings` with no sub-path — bounce to the Team tab, which is
 * the one the user is most likely to want (legacy /club/settings behavior).
 */
export default async function SettingsIndex({ params }: SettingsIndexProps) {
    const { locale } = await params;
    redirect(`/${locale}/settings/team`);
}
