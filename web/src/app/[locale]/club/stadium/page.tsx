"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrentTeamId } from "@/stores/gameStore";
import { api } from "@/lib/api";

type Locale = "en" | "zh";

/**
 * Entry point for "my stadium".
 *
 * The stadium page itself is addressed by the ground (`/stadium/:stadiumId`)
 * because a ground can outlive a club's tenure at it, and a neutral-venue
 * fixture belongs to neither finalist. This route exists so older links —
 * `?team=<teamId>`, the sidebar fallback, bookmarks, the club profile's
 * stadium row — keep working: it resolves the club to its ground and
 * redirects, instead of duplicating the page.
 */
export default function StadiumEntryPage() {
  const t = useTranslations("club.stadium");
  const params = useParams();
  const router = useRouter();
  const { team, isLoading: authLoading } = useAuth();
  const currentTeamId = useCurrentTeamId();
  const locale = (params.locale as Locale) || "en";

  // `?team=` may point at a club we are only visiting, so it wins over the
  // signed-in manager's own team when present.
  const requestedTeamId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("team")
      : null;
  const targetTeamId = requestedTeamId || currentTeamId;
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!targetTeamId) return;

    // Already know our own ground (onboarding hands it to the auth layer) —
    // skip the round trip.
    if (!requestedTeamId && team?.stadiumId) {
      router.replace(`/${locale}/stadium/${team.stadiumId}`);
      return;
    }

    let cancelled = false;
    void (async () => {
      const summary = await api.stadium.getSummary(targetTeamId);
      if (cancelled) return;
      if (summary?.id) {
        router.replace(`/${locale}/stadium/${summary.id}`);
        return;
      }
      // A club with no stadium row yet — say so instead of spinning forever.
      setMissing(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [locale, requestedTeamId, router, targetTeamId, team?.stadiumId]);

  if (!missing) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="font-headline text-sm font-bold uppercase tracking-widest text-on-surface-variant animate-pulse">
          Loading…
        </div>
      </div>
    );
  }

  if (authLoading) return null;

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-6">
      <div className="text-center space-y-2">
        <p className="font-headline text-sm font-bold uppercase tracking-widest text-on-surface-variant">
          {t("none")}
        </p>
        {targetTeamId && (
          <Link
            href={`/${locale}/teams/${targetTeamId}`}
            className="inline-block font-body text-sm text-primary hover:underline"
          >
            {team?.name ?? ""}
          </Link>
        )}
      </div>
    </div>
  );
}
