"use client";

import { AppIcon, type MaterialIconName } from "@/components/icons/AppIcon";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { clsx } from "clsx";
import StandingsTable from "./StandingsTable";
import { TacticsEntryButton } from "@/components/tactics/shared/TacticsEntryButton";
import { MATCH_STATUS, type Standing, type Match } from "@/lib/api";
import { matchdayKey } from "@/lib/league-fixtures";

interface RightColumnProps {
  standings: Standing[];
  userTeamId?: string;
  allMatches?: Match[];
  locale?: string;
}

type TabKey = "standings" | "data" | "fixtures";

const TAB_ICONS: Record<TabKey, MaterialIconName> = {
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

  /**
   * Group fixtures into matchdays.
   *
   * This used to key on `match.round ?? match.week * 2`. `round` is the
   * matchday index WITHIN a week (1..ROUNDS_PER_WEEK), so keying on it
   * alone collapsed every week of the season into one group per round —
   * three groups for a ten-week season, two before it. Grouping on the
   * `(week, round)` tuple is what actually identifies a matchday.
   *
   * Groups are ordered by their earliest kickoff, not by their label, so a
   * rescheduled fixture cannot reorder the list.
   */
  const groupedMatches = allMatches.reduce(
    (acc, match) => {
      const key = matchdayKey(match);
      if (!acc[key]) acc[key] = [];
      acc[key].push(match);
      return acc;
    },
    {} as Record<string, Match[]>,
  );

  const sortedMatchdays = Object.entries(groupedMatches)
    .map(([key, matches]) => ({
      key,
      week: matches[0]?.week ?? 0,
      matches,
      firstKickoff: matches.reduce(
        (min, m) => (m.scheduledAt < min ? m.scheduledAt : min),
        matches[0]?.scheduledAt ?? "",
      ),
    }))
    .sort((a, b) => a.firstKickoff.localeCompare(b.firstKickoff));

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
                <AppIcon name={TAB_ICONS[tab.key]} className="text-[14px]" />
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
            sortedMatchdays={sortedMatchdays}
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
          <AppIcon name="analytics" className="text-4xl text-primary" />
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
  sortedMatchdays,
  userTeamId,
  locale,
}: {
  t: ReturnType<typeof useTranslations>;
  sortedMatchdays: {
    key: string;
    week: number;
    matches: Match[];
    firstKickoff: string;
  }[];
  userTeamId?: string;
  locale: string;
}) {
  const tCommon = useTranslations('common');

  if (sortedMatchdays.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
            <AppIcon name="event_busy" className="text-4xl text-primary" />
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
        {sortedMatchdays.map(({ key, week, matches }) => {
          const hasCompleted = matches.some((m) => m.status === MATCH_STATUS.COMPLETED);
          const hasUpcoming = matches.some(
            (m) => m.status === MATCH_STATUS.SCHEDULED || m.status === MATCH_STATUS.TACTICS_LOCKED,
          );

          return (
            <div
              key={key}
              className="glass-panel rounded-2xl p-3 border border-white/5"
            >
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="flex items-center gap-2">
                  <span className="font-label text-[9px] font-black uppercase tracking-[0.25em] text-primary">
                    {t('league.matchweek.thisRound', { round: week })}
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
                          'font-headline font-black px-2.5 py-0.5 rounded-lg shrink-0 mx-2 min-w-[58px] text-center',
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