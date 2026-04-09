"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

type NavItem = {
  label: string;
  href: string;
  icon: string; // material symbol name
  activeIcon?: string;
};

const navGroups: { title: string; items: NavItem[] }[] = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: "home" },
      { label: "Squad", href: "/teams/my-team", icon: "groups" },
      { label: "Matches", href: "/matches", icon: "calendar_month" },
      { label: "League", href: "/league/elite", icon: "emoji_events" },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Transfers", href: "/transfer", icon: "swap_horiz" },
      { label: "Finance", href: "/club/finance", icon: "account_balance_wallet" },
      { label: "Scouting", href: "/scouts", icon: "travel_explore" },
    ],
  },
  {
    title: "Academy",
    items: [
      { label: "Youth Squad", href: "/youth/squad", icon: "child_care" },
      { label: "Youth Matches", href: "/youth/matches", icon: "sports" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-surface-container-low border-r border-white/5 flex flex-col z-40">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-white/5">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="font-headline font-black text-sm uppercase tracking-[0.15em] text-primary">
            GoalXi
          </span>
          <span className="font-label text-[10px] font-bold text-primary/50 bg-primary/10 px-1.5 py-0.5 rounded uppercase tracking-wider">
            MGR
          </span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-6">
        {navGroups.map((group) => (
          <div key={group.title}>
            <h4 className="font-label text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/50 mb-3 px-3">
              {group.title}
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
                      {isActive && item.activeIcon ? item.activeIcon : item.icon}
                    </span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="p-4 border-t border-white/5 space-y-3">
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
            <span className="font-headline font-black text-xs text-primary">A</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-headline text-xs font-bold text-on-surface truncate">
              Alex Ferguson
            </div>
            <div className="font-body text-[10px] text-on-surface-variant truncate">
              Elite FC
            </div>
          </div>
          <button className="text-on-surface-variant hover:text-error transition-colors">
            <span className="material-symbols-outlined text-base">logout</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
