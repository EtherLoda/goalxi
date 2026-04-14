"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import StandingsTable from "./StandingsTable";
import type { Standing, Team } from "@/lib/api";

interface RightColumnProps {
  standings: Standing[];
  teams: Record<string, Team>;
  userTeamId?: string;
}

type TabKey = "standings" | "data" | "history";

export default function RightColumn({
  standings,
  teams,
  userTeamId,
}: RightColumnProps) {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<TabKey>("standings");

  const tabs: { key: TabKey; label: string }[] = [
    { key: "standings", label: t("league.rightColumn.standings") },
    { key: "data", label: t("league.rightColumn.data") },
    { key: "history", label: t("league.rightColumn.history") },
  ];

  return (
    <div className="bg-surface-container rounded-2xl overflow-hidden flex flex-col h-[calc(100vh-160px)] shadow-card border border-white/5">
      {/* Tab Headers */}
      <div className="flex border-b border-white/10 bg-surface-container-low/50 shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-3 font-headline text-[10px] font-bold uppercase tracking-widest transition-colors relative ${
              activeTab === tab.key
                ? "text-primary border-b-2 border-primary"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "standings" && (
          <StandingsTable
            standings={standings}
            teams={teams}
            userTeamId={userTeamId}
          />
        )}

        {activeTab === "data" && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <span className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-2">
                analytics
              </span>
              <p className="font-body text-sm text-on-surface-variant">
                {t("league.rightColumn.comingSoon")}
              </p>
            </div>
          </div>
        )}

        {activeTab === "history" && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <span className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-2">
                history
              </span>
              <p className="font-body text-sm text-on-surface-variant">
                {t("league.rightColumn.comingSoon")}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
