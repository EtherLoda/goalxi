"use client";

import { AppIcon } from "@/components/icons/AppIcon";
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useParams, useRouter } from "next/navigation";

export default function LeagueIndexPage() {
  const { team } = useAuth();
  const router = useRouter();
  const params = useParams();
  const locale = (params.locale as string) || "en";

  useEffect(() => {
    if (team?.leagueId) {
      router.replace(`/${locale}/league/${team.leagueId}`);
    } else if (!team) {
      // Not logged in, let the auth context handle redirect
    }
  }, [team, router, locale]);

  return (
    <div className="flex min-h-screen bg-surface items-center justify-center">
      <AppIcon name="progress_activity" className="text-4xl text-primary animate-spin" />
    </div>
  );
}
