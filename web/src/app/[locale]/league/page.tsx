"use client";

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
      <span className="material-symbols-outlined text-4xl text-primary animate-spin">
        progress_activity
      </span>
    </div>
  );
}
