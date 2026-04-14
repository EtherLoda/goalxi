"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

type Tab = "data" | "history" | "rules";

interface LeagueHeaderProps {
  leagueName: string;
  season: number;
  matchweek: number;
  totalMatchweeks: number;
}

export default function LeagueHeader({
  leagueName,
  season,
  matchweek,
  totalMatchweeks,
}: LeagueHeaderProps) {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<Tab>("data");

  const tabs: { key: Tab; label: string }[] = [
    { key: "data", label: t("league.tabs.data") },
    { key: "history", label: t("league.tabs.history") },
    { key: "rules", label: t("league.tabs.rules") },
  ];

  return (
    <header className="bg-surface/70 backdrop-blur-2xl border-b border-white/5">
      {/* Top row: title + season info */}
      <div className="h-16 flex items-center justify-between px-8 border-b border-white/5">
        <div className="flex items-center gap-8">
          <h1 className="font-headline font-black text-sm uppercase tracking-[0.2em] text-primary">
            {leagueName}
          </h1>
          <div className="flex items-center gap-6 h-full">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`relative h-full px-3 flex items-center font-headline text-xs font-bold uppercase tracking-widest transition-colors ${
                  activeTab === tab.key
                    ? "text-primary"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {tab.label}
                {activeTab === tab.key && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Season info badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container border border-white/5">
          <span className="font-label text-[10px] font-black uppercase tracking-widest text-primary">
            {t("league.season")} {season}
          </span>
          <span className="w-px h-3 bg-white/10" />
          <span className="font-label text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
            {t("league.matchweekShort")} {matchweek}/{totalMatchweeks}
          </span>
        </div>
      </div>
    </header>
  );
}
