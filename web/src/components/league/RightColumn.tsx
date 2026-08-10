"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { clsx } from "clsx";
import StandingsTable from "./StandingsTable";
import { TacticsEntryButton } from "@/components/tactics/shared/TacticsEntryButton";
import { MATCH_STATUS, type Standing, type Match } from "@/lib/api";

interface RightColumnProps {
  standings: Standing[];
  userTeamId?: string;
  allMatches?: Match[];
  locale?: string;
}

type TabKey = "standings" | "data" | "fixtures";

const TAB_ICONS: Record<TabKey, string> = {
  standings: "leaderboard",
  data: "analytics",
  fixtures: "event",
};

export default function RightColumn({
  standings,
  userTeamId,
  allMatches = [],
  locale = "en",
}: RightColumnProps) {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<TabKey>("standings");

  const tabs: { key: TabKey; label: string }[] = [
    { key: "standings", label: t("league.rightColumn.standings") },
    { key: "fixtures", label: t("league.rightColumn.fixtures") },
    { key: "data", label: t("league.rightColumn.data") },
  ];

  // Group matches by round/week
  const groupedMatches = allMatches.reduce(
    (acc, match) => {
      const round = match.round ?? match.week * 2;
      if (!acc[round]) acc[round] = [];
      acc[round].push(match);
      return acc;
    },
    {} as Record<number, Match[]>,
  );

  const sortedRounds = Object.keys(groupedMatches)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <div className="glass-panel rounded-2xl overflow-hidden flex flex-col self-start border border-white/5">
      {/* Segmented tab control */}
      <div className="px-3 pt-3 shrink-0">
        <div className="glass-panel rounded-full p-1 inline-flex items-center gap-1 w-full">
          {tabs.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={clsx(
                  'flex-1 inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-full',
                  'font-headline text-[11px] font-black uppercase tracking-[0.2em]',
                  'transition-all',
                  active
                    ? 'bg-primary text-on-primary shadow-[0_0_14px_rgba(0,228,121,0.45)]'
                    : 'text-on-surface-variant hover:text-on-surface',
                )}
              >
                <span className="material-symbols-outlined text-[14px]">
                  {TAB_ICONS[tab.key]}
                </span>
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content — natural height so the Standings tab is exactly 16 rows tall
          with no leftover empty space when the league has 16 teams. */}
      <div className="p-3 pt-2">
        {activeTab === "standings" && (
          <StandingsTable
            standings={standings}
            userTeamId={userTeamId}
            locale={locale}
          />
        )}

        {activeTab === "data" && <DataEmptyState t={t} />}

        {activeTab === "fixtures" && (
          <FixturesTab
            t={t}
            sortedRounds={sortedRounds}
            groupedMatches={groupedMatches}
            userTeamId={userTeamId}
            locale={locale}
          />
        )}
      </div>
    </div>
  );
}

function DataEmptyState({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center max-w-sm">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
          <span className="material-symbols-outlined text-4xl text-primary">
            analytics
          </span>
        </div>
        <p className="font-headline text-base font-black text-on-surface mb-1">
          {t('league.empty.dataTitle')}
        </p>
        <p className="font-body text-sm text-on-surface-variant">
          {t('league.empty.dataDesc')}
        </p>
      </div>
    </div>
  );
}

function FixturesTab({
  t,
  sortedRounds,
  groupedMatches,
  userTeamId,
  locale,
}: {
  t: ReturnType<typeof useTranslations>;
  sortedRounds: number[];
  groupedMatches: Record<number, Match[]>;
  userTeamId?: string;
  locale: string;
}) {
  const tCommon = useTranslations('common');

  if (sortedRounds.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
            <span className="material-symbols-outlined text-4xl text-primary">
              event_busy
            </span>
          </div>
          <p className="font-headline text-base font-black text-on-surface mb-1">
            {t('league.empty.fixturesTitle')}
          </p>
          <p className="font-body text-sm text-on-surface-variant">
            {t('league.empty.fixturesDesc')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto custom-scrollbar pr-1">
      <div className="space-y-3 pb-2">
        {sortedRounds.map((round) => {
          const matches = groupedMatches[round];
          const hasCompleted = matches.some((m) => m.status === MATCH_STATUS.COMPLETED);
          const hasUpcoming = matches.some(
            (m) => m.status === MATCH_STATUS.SCHEDULED || m.status === MATCH_STATUS.TACTICS_LOCKED,
          );

          return (
            <div
              key={round}
              className="glass-panel rounded-2xl p-3 border border-white/5"
            >
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="flex items-center gap-2">
                  <span className="font-label text-[9px] font-black uppercase tracking-[0.25em] text-primary">
                    {t('league.matchweek.thisRound', { round })}
                  </span>
                </div>
                {hasCompleted && (
                  <span className="font-label text-[9px] font-black uppercase tracking-widest px-2 py-0.5 bg-primary/10 text-primary rounded-full">
                    {t('league.matchweek.completed')}
                  </span>
                )}
                {hasUpcoming && !hasCompleted && (
                  <span className="font-label text-[9px] font-black uppercase tracking-widest px-2 py-0.5 bg-tertiary/10 text-tertiary rounded-full">
                    {t('league.matchweek.upcoming')}
                  </span>
                )}
              </div>

              <div className="space-y-1">
                {matches.map((match) => {
                  const isMatchCompleted = match.status === MATCH_STATUS.COMPLETED;
                  const isUpcoming = match.status === MATCH_STATUS.SCHEDULED || match.status === MATCH_STATUS.TACTICS_LOCKED;
                  const homeName = match.homeTeam?.name || tCommon('tbd');
                  const awayName = match.awayTeam?.name || tCommon('tbd');
                  const isUserHome = userTeamId && match.homeTeam?.id === userTeamId;
                  const isUserAway = userTeamId && match.awayTeam?.id === userTeamId;
                  const isUserMatch = Boolean(isUserHome || isUserAway);
                  const tacticsButton = isUpcoming && isUserMatch ? (
                    <TacticsEntryButton
                      matchId={match.id}
                      matchStatus={match.status}
                      scheduledAt={match.scheduledAt}
                      variant="icon"
                      locale={locale}
                    />
                  ) : null;

                  return (
                    <div
                      key={match.id}
                      className="flex items-center justify-between text-xs py-2 px-3 rounded-xl hover:bg-white/5 transition-colors"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span
                          className={clsx(
                            'font-headline font-bold truncate',
                            isUserHome ? 'text-primary' : 'text-on-surface',
                          )}
                        >
                          {homeName}
                        </span>
                        {tacticsButton && isUserHome && (
                          <div className="shrink-0">{tacticsButton}</div>
                        )}
                      </div>
                      <div
                        className={clsx(
                          'font-headline font-black px-2.5 py-0.5 rounded-md shrink-0 mx-2 min-w-[58px] text-center',
                          isMatchCompleted
                            ? 'bg-primary/15 text-primary'
                            : 'bg-white/5 text-on-surface-variant/60',
                        )}
                      >
                        {isMatchCompleted
                          ? `${match.homeScore ?? 0} - ${match.awayScore ?? 0}`
                          : tCommon('vs')}
                      </div>
                      <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                        {tacticsButton && isUserAway && (
                          <div className="shrink-0">{tacticsButton}</div>
                        )}
                        <span
                          className={clsx(
                            'font-headline font-bold truncate text-right',
                            isUserAway ? 'text-primary' : 'text-on-surface',
                          )}
                        >
                          {awayName}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}