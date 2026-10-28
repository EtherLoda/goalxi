"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { useAuth } from "@/contexts/AuthContext";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { api, type Team } from "@/lib/api";
import { useGameStore } from "@/stores/gameStore";
import { AppIcon } from "@/components/icons/AppIcon";

type Locale = "en" | "zh";

export default function Sidebar() {
  const t = useTranslations("dashboard.nav");
  const pathname = usePathname();
  const params = useParams();
  const { user, team, logout } = useAuth();
  const { viewTeamId } = useGameStore();

  const locale = (params.locale as Locale) || "en";
  const myTeam = viewTeamId === null || viewTeamId === team?.id;
  const currentTeamId = viewTeamId || team?.id;

  // Only the fetched club is state; whether we are viewing someone else is
  // derived. Keeping the two apart means the effect never has to reset state
  // (which React flags as a cascading render) and a stale club can never be
  // shown for one frame after leaving view mode.
  const [fetchedViewTeam, setFetchedViewTeam] = useState<Team | null>(null);
  const viewingOther = !!viewTeamId && !myTeam;

  useEffect(() => {
    if (!viewTeamId || !viewingOther) return;
    let cancelled = false;
    api.teams
      .getById(viewTeamId)
      .then((t) => {
        if (!cancelled) setFetchedViewTeam(t);
      })
      .catch(() => {
        if (!cancelled) setFetchedViewTeam(null);
      });
    return () => {
      cancelled = true;
    };
  }, [viewTeamId, viewingOther]);

  const viewedTeam = viewingOther ? fetchedViewTeam : null;
  const displayTeam = myTeam ? team : viewedTeam;

  // Grounds are addressed by their own id (`/stadium/:id`) so the link works
  // for a neutral-venue fixture too. Only the onboarding payload carries that
  // id on the team, so a club fetched through `teams/:id` falls back to the
  // team-scoped entry point, which resolves and redirects.
  const stadiumHref = displayTeam?.stadiumId
    ? `/${locale}/stadium/${displayTeam.stadiumId}`
    : `/${locale}/club/stadium?team=${currentTeamId}`;

  // In view mode every entry describes the club being viewed, so 经理档案
  // must open THAT club’s manager, not the logged-in user.
  const managerHref = myTeam
    ? user?.id
      ? `/${locale}/managers/${user.id}`
      : `/${locale}/dashboard`
    : displayTeam?.userId
      ? `/${locale}/managers/${displayTeam.userId}`
      : `/${locale}/teams/${currentTeamId}`;

  const navGroups = [
    {
      titleKey: "overview",
      items: [
        { labelKey: "dashboard", href: `/${locale}/dashboard?team=${currentTeamId}`, icon: "home" },
        { labelKey: "clubProfile", href: `/${locale}/teams/${currentTeamId}`, icon: "shield" },
        { labelKey: "managerProfile", href: managerHref, icon: "person" },
        { labelKey: "squad", href: `/${locale}/teams/squad?team=${currentTeamId}`, icon: "groups" },
        { labelKey: "stadium", href: stadiumHref, icon: "stadium" },
        { labelKey: "matches", href: `/${locale}/matches?team=${currentTeamId}`, icon: "calendar_month" },
        { labelKey: "league", href: displayTeam?.leagueId ? `/${locale}/league/${displayTeam.leagueId}?team=${currentTeamId}` : "#", icon: "emoji_events" },
        { labelKey: "cup", href: `/${locale}/cup`, icon: "workspace_premium" },
      ],
    },
    {
      titleKey: "operations",
      items: [
        { labelKey: "search", href: `/${locale}/search`, icon: "search" },
        { labelKey: "transfers", href: `/${locale}/transfers?team=${currentTeamId}`, icon: "swap_horiz" },
        { labelKey: "training", href: `/${locale}/training?team=${currentTeamId}`, icon: "fitness_center" },
        { labelKey: "medical", href: `/${locale}/club/medical?team=${currentTeamId}`, icon: "medical_services" },
        { labelKey: "finance", href: `/${locale}/club/finance?team=${currentTeamId}`, icon: "account_balance_wallet" },
      ],
    },
    {
      titleKey: "academy",
      // Youth mode is parked for a later iteration — only the
      // senior scouting inbox is reachable for now. Keep the
      // `academy` section title so the locale string stays in use.
      items: [
        { labelKey: "scouting", href: `/${locale}/scouts?team=${currentTeamId}`, icon: "travel_explore" },
      ],
    },
  ] as const;

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-surface-container-low border-r border-white/5 flex flex-col z-40">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-white/5">
        <Link
          href={
            myTeam
              ? `/${locale}/dashboard?team=${currentTeamId}`
              : `/${locale}/teams/${currentTeamId}`
          }
          className="flex items-center gap-2"
        >
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
                  const itemPath = item.href.split("?")[0];
                    const isActive =
                      pathname === itemPath || pathname.startsWith(itemPath + "/");
                  return (
                    <Link
                      key={item.labelKey}
                      href={item.href}
                      className={clsx(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg font-headline text-xs font-medium transition-all",
                        isActive
                          ? "bg-primary text-on-primary"
                          : "text-on-surface-variant hover:text-on-surface hover:bg-white/5"
                      )}
                    >
                      <AppIcon
                        name={item.icon}
                        fill={isActive}
                        className={clsx(
                          "text-lg",
                          isActive ? "" : "text-on-surface-variant/60"
                        )}
                      />
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
            .map((group) => ({
              ...group,
              items: group.items.filter((item) => item.labelKey !== "dashboard"),
            }))
            .map((group) => (
              <div key={group.titleKey}>
                <h4 className="font-label text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/50 mb-3 px-3">
                  {t(group.titleKey)}
                </h4>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const itemPath = item.href.split("?")[0];
                    const isActive =
                      pathname === itemPath || pathname.startsWith(itemPath + "/");
                    return (
                      <Link
                        key={item.labelKey}
                        href={item.href}
                        className={clsx(
                          "flex items-center gap-3 px-3 py-2.5 rounded-lg font-headline text-xs font-medium transition-all",
                          isActive
                            ? "bg-primary text-on-primary"
                            : "text-on-surface-variant hover:text-on-surface hover:bg-white/5"
                        )}
                        >
                          <AppIcon
                            name={item.icon}
                            fill={isActive}
                            className={clsx(
                              "text-lg",
                              isActive ? "" : "text-on-surface-variant/60"
                            )}
                          />
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
        <div className="flex gap-3">
          <button
            aria-label="Settings"
            className="flex-1 flex items-center justify-center py-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-white/5 transition-all"
          >
            <AppIcon name="settings" className="text-lg" />
          </button>
          <button
            aria-label="Help"
            className="flex-1 flex items-center justify-center py-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-white/5 transition-all"
          >
            <AppIcon name="help_outline" className="text-lg" />
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
              {/* Your club, not the one you are browsing. */}
              {team?.name || "No Team"}
            </div>
          </div>
          <button
            onClick={logout}
            aria-label="Log out"
            className="text-on-surface-variant hover:text-error transition-colors"
          >
            <AppIcon name="logout" className="text-base" />
          </button>
        </div>
      </div>
    </aside>
  );
}
