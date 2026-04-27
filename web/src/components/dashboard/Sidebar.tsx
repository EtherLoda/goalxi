"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clsx } from "clsx";
import { useAuth } from "@/contexts/AuthContext";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { api, type Team } from "@/lib/api";
import { useGameStore } from "@/stores/gameStore";

type Locale = "en" | "zh";

export default function Sidebar() {
  const t = useTranslations("dashboard.nav");
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams();
  const { user, team, logout } = useAuth();
  const { viewTeamId, setViewTeam, clearViewTeam } = useGameStore();

  const locale = (params.locale as Locale) || "en";
  const myTeam = viewTeamId === null || viewTeamId === team?.id;
  const currentTeamId = viewTeamId || team?.id;

  const [viewedTeam, setViewedTeam] = useState<Team | null>(null);

  // Fetch viewed team when viewing another team (regardless of login status)
  useEffect(() => {
    if (!viewTeamId || myTeam) {
      setViewedTeam(null);
      return;
    }
    api.teams.getById(viewTeamId).then(setViewedTeam).catch(() => setViewedTeam(null));
  }, [viewTeamId, myTeam]);

  const displayTeam = myTeam ? team : viewedTeam;

  const navGroups = [
    {
      titleKey: "overview",
      items: [
        { labelKey: "dashboard", href: `/${locale}/dashboard?team=${currentTeamId}`, icon: "home" },
        { labelKey: "squad", href: `/${locale}/teams/squad?team=${currentTeamId}`, icon: "groups" },
        { labelKey: "matches", href: `/${locale}/matches?team=${currentTeamId}`, icon: "calendar_month" },
        { labelKey: "league", href: displayTeam?.leagueId ? `/${locale}/league/${displayTeam.leagueId}?team=${currentTeamId}` : "#", icon: "emoji_events" },
      ],
    },
    {
      titleKey: "operations",
      items: [
        { labelKey: "search", href: `/${locale}/search`, icon: "search" },
        { labelKey: "transfers", href: `/${locale}/transfers?team=${currentTeamId}`, icon: "swap_horiz" },
        { labelKey: "training", href: `/${locale}/training?team=${currentTeamId}`, icon: "fitness_center" },
        { labelKey: "finance", href: `/${locale}/club/finance?team=${currentTeamId}`, icon: "account_balance_wallet" },
        { labelKey: "scouting", href: `/${locale}/scouts?team=${currentTeamId}`, icon: "travel_explore" },
      ],
    },
    {
      titleKey: "academy",
      items: [
        { labelKey: "youthSquad", href: `/${locale}/youth/squad?team=${currentTeamId}`, icon: "child_care" },
        { labelKey: "youthMatches", href: `/${locale}/youth/matches?team=${currentTeamId}`, icon: "sports" },
      ],
    },
  ];

  const switchLocale = (nextLocale: Locale) => {
    const currentLocale = pathname.split("/")[1];
    const newPath = pathname.replace(`/${currentLocale}`, `/${nextLocale}`);
    router.push(newPath);
  };

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-surface-container-low border-r border-white/5 flex flex-col z-40">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-white/5">
        <Link href={`/${locale}/dashboard?team=${currentTeamId}`} className="flex items-center gap-2">
          <span className="font-headline font-black text-sm uppercase tracking-[0.15em] text-primary">
            GoalXi
          </span>
          <span className="font-label text-[10px] font-bold text-primary/50 bg-primary/10 px-1.5 py-0.5 rounded uppercase tracking-wider">
            MGR
          </span>
        </Link>
      </div>

      {/* Team Indicator */}
      <div className="px-3 py-3 border-b border-white/5 flex justify-center">
        <span className="font-headline font-black text-sm uppercase tracking-[0.2em] text-on-surface/70">
          {displayTeam?.name || "Team"}
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-6">
        {myTeam ? (
          navGroups.map((group) => (
            <div key={group.titleKey}>
              <h4 className="font-label text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/50 mb-3 px-3">
                {t(group.titleKey)}
              </h4>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={clsx(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg font-headline text-xs font-medium transition-all",
                        isActive
                          ? "bg-primary text-on-primary"
                          : "text-on-surface-variant hover:text-on-surface hover:bg-white/5"
                      )}
                    >
                      <span
                        className={clsx(
                          "material-symbols-outlined text-lg",
                          isActive ? "" : "text-on-surface-variant/60"
                        )}
                        style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}
                      >
                        {item.icon}
                      </span>
                      {t(item.labelKey)}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          navGroups
            .filter((g) => g.titleKey === "overview")
            .map((group) => (
              <div key={group.titleKey}>
                <h4 className="font-label text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/50 mb-3 px-3">
                  {t(group.titleKey)}
                </h4>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={clsx(
                          "flex items-center gap-3 px-3 py-2.5 rounded-lg font-headline text-xs font-medium transition-all",
                          isActive
                            ? "bg-primary text-on-primary"
                            : "text-on-surface-variant hover:text-on-surface hover:bg-white/5"
                        )}
                      >
                        <span
                          className={clsx(
                            "material-symbols-outlined text-lg",
                            isActive ? "" : "text-on-surface-variant/60"
                          )}
                          style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}
                        >
                          {item.icon}
                        </span>
                        {t(item.labelKey)}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))
        )}
      </nav>

      {/* Bottom */}
      <div className="p-4 border-t border-white/5 space-y-3">
        {/* Language Switcher */}
        <div className="flex gap-1">
          <button
            onClick={() => switchLocale("en")}
            disabled={locale === "en"}
            className={clsx(
              "flex-1 py-1.5 text-xs font-headline font-bold uppercase tracking-widest rounded-md border transition-all",
              locale === "en"
                ? "bg-primary text-on-primary border-primary"
                : "bg-surface-container-low text-on-surface-variant border-white/10 hover:border-primary hover:text-primary"
            )}
          >
            EN
          </button>
          <button
            onClick={() => switchLocale("zh")}
            disabled={locale === "zh"}
            className={clsx(
              "flex-1 py-1.5 text-xs font-headline font-bold uppercase tracking-widest rounded-md border transition-all",
              locale === "zh"
                ? "bg-primary text-on-primary border-primary"
                : "bg-surface-container-low text-on-surface-variant border-white/10 hover:border-primary hover:text-primary"
            )}
          >
            中文
          </button>
        </div>

        <div className="flex gap-3">
          <button className="flex-1 flex items-center justify-center py-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-white/5 transition-all">
            <span className="material-symbols-outlined text-lg">settings</span>
          </button>
          <button className="flex-1 flex items-center justify-center py-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-white/5 transition-all">
            <span className="material-symbols-outlined text-lg">help_outline</span>
          </button>
        </div>
        {/* User */}
        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
            <span className="font-headline font-black text-xs text-primary">
              {user?.nickname?.charAt(0) || "U"}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-headline text-xs font-bold text-on-surface truncate">
              {user?.nickname || "Manager"}
            </div>
            <div className="font-body text-[10px] text-on-surface-variant truncate">
              {team?.name || "No Team"}
            </div>
          </div>
          <button
            onClick={logout}
            className="text-on-surface-variant hover:text-error transition-colors"
          >
            <span className="material-symbols-outlined text-base">logout</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
