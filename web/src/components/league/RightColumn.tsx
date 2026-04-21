"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import StandingsTable from "./StandingsTable";
import type { Standing, Team, Match } from "@/lib/api";

interface RightColumnProps {
  standings: Standing[];
  teams: Record<string, Team>;
  userTeamId?: string;
  allMatches?: Match[];
}

type TabKey = "standings" | "data" | "fixtures";

export default function RightColumn({
  standings,
  teams,
  userTeamId,
  allMatches = [],
}: RightColumnProps) {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<TabKey>("standings");

  const tabs: { key: TabKey; label: string }[] = [
    { key: "standings", label: t("league.rightColumn.standings") },
    { key: "data", label: t("league.rightColumn.data") },
    { key: "fixtures", label: t("league.rightColumn.fixtures") },
  ];

  // Group matches by round/week
  const groupedMatches = allMatches.reduce((acc, match) => {
    const round = match.round ?? match.week * 2;
    if (!acc[round]) acc[round] = [];
    acc[round].push(match);
    return acc;
  }, {} as Record<number, Match[]>);

  const sortedRounds = Object.keys(groupedMatches)
    .map(Number)
    .sort((a, b) => a - b);

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

        {activeTab === "fixtures" && (
          <div className="h-full overflow-y-auto custom-scrollbar p-4">
            {sortedRounds.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <p className="font-body text-sm text-on-surface-variant">
                  {t("league.rightColumn.comingSoon")}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {sortedRounds.map((round, idx) => {
                  // Pair rounds: 0+1, 2+3, 4+5...
                  const pairIdx = Math.floor(idx / 2);
                  const isSecondInPair = idx % 2 === 1;
                  const firstRoundIdx = pairIdx * 2;

                  // Skip if this is the second in a pair (first one renders the full row)
                  if (isSecondInPair) return null;

                  const firstRound = sortedRounds[firstRoundIdx];
                  const secondRound = sortedRounds[firstRoundIdx + 1];
                  const firstMatches = groupedMatches[firstRound] || [];
                  const secondMatches = secondRound ? (groupedMatches[secondRound] || []) : [];

                  const firstCompleted = firstMatches.some((m) => m.status === "completed");
                  const secondCompleted = secondMatches.some((m) => m.status === "completed");
                  const firstUpcoming = firstMatches.some((m) => m.status === "scheduled" || m.status === "tactics_locked");
                  const secondUpcoming = secondMatches.some((m) => m.status === "scheduled" || m.status === "tactics_locked");

                  return (
                    <div key={firstRound} className="flex gap-4">
                      {/* Round column */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-headline font-black text-sm text-on-surface">
                            Round {firstRound}
                          </span>
                          {firstCompleted && (
                            <span className="text-[9px] px-2 py-0.5 bg-primary/10 text-primary font-label font-bold rounded-full">
                              {t("league.matchweek.completed")}
                            </span>
                          )}
                          {firstUpcoming && !firstCompleted && (
                            <span className="text-[9px] px-2 py-0.5 bg-white/10 text-on-surface-variant font-label font-bold rounded-full">
                              {t("league.matchweek.upcoming")}
                            </span>
                          )}
                        </div>
                        <div className="space-y-1">
                          {firstMatches.map((match) => {
                            const isMatchCompleted = match.status === "completed";
                            const isUpcoming = match.status === 'scheduled' || match.status === 'tactics_locked';
                            const homeName = match.homeTeam?.name || "TBD";
                            const awayName = match.awayTeam?.name || "TBD";
                            const isUserHome = userTeamId && match.homeTeam?.id === userTeamId;
                            const isUserAway = userTeamId && match.awayTeam?.id === userTeamId;
                            return (
                              <div
                                key={match.id}
                                className="flex items-center justify-between text-xs py-2 px-3 rounded-lg bg-surface hover:bg-surface/80 transition-colors"
                              >
                                <div className="flex items-center gap-1 flex-1">
                                  <span className="font-headline font-bold text-on-surface truncate">
                                    {homeName}
                                  </span>
                                  {isUpcoming && isUserHome && (
                                    <span className="material-symbols-outlined text-sm text-primary cursor-pointer hover:opacity-80">sports</span>
                                  )}
                                </div>
                                <div className="font-headline font-black bg-surface px-3 py-0.5 rounded text-on-surface shrink-0 mx-2">
                                  {isMatchCompleted
                                    ? `${match.homeScore ?? 0} - ${match.awayScore ?? 0}`
                                    : "vs"}
                                </div>
                                <div className="flex items-center gap-1 flex-1 justify-end">
                                  {isUpcoming && isUserAway && (
                                    <span className="material-symbols-outlined text-sm text-primary cursor-pointer hover:opacity-80">sports</span>
                                  )}
                                  <span className="font-headline font-bold text-on-surface truncate">
                                    {awayName}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Second round column */}
                      {secondRound && (
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-headline font-black text-sm text-on-surface">
                              Round {secondRound}
                            </span>
                            {secondCompleted && (
                              <span className="text-[9px] px-2 py-0.5 bg-primary/10 text-primary font-label font-bold rounded-full">
                                {t("league.matchweek.completed")}
                              </span>
                            )}
                            {secondUpcoming && !secondCompleted && (
                              <span className="text-[9px] px-2 py-0.5 bg-white/10 text-on-surface-variant font-label font-bold rounded-full">
                                {t("league.matchweek.upcoming")}
                              </span>
                            )}
                          </div>
                          <div className="space-y-1">
                            {secondMatches.map((match) => {
                              const isMatchCompleted = match.status === "completed";
                              const isUpcoming = match.status === 'scheduled' || match.status === 'tactics_locked';
                              const homeName = match.homeTeam?.name || "TBD";
                              const awayName = match.awayTeam?.name || "TBD";
                              const isUserHome = userTeamId && match.homeTeam?.id === userTeamId;
                              const isUserAway = userTeamId && match.awayTeam?.id === userTeamId;
                              return (
                                <div
                                  key={match.id}
                                  className="flex items-center justify-between text-xs py-2 px-3 rounded-lg bg-surface hover:bg-surface/80 transition-colors"
                                >
                                  <div className="flex items-center gap-1 flex-1">
                                    <span className="font-headline font-bold text-on-surface truncate">
                                      {homeName}
                                    </span>
                                    {isUpcoming && isUserHome && (
                                      <span className="material-symbols-outlined text-sm text-primary cursor-pointer hover:opacity-80">sports</span>
                                    )}
                                  </div>
                                  <div className="font-headline font-black bg-surface px-3 py-0.5 rounded text-on-surface shrink-0 mx-2">
                                    {isMatchCompleted
                                      ? `${match.homeScore ?? 0} - ${match.awayScore ?? 0}`
                                      : "vs"}
                                  </div>
                                  <div className="flex items-center gap-1 flex-1 justify-end">
                                    {isUpcoming && isUserAway && (
                                      <span className="material-symbols-outlined text-sm text-primary cursor-pointer hover:opacity-80">sports</span>
                                    )}
                                    <span className="font-headline font-bold text-on-surface truncate">
                                      {awayName}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
