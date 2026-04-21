"use client";

import { useTranslations } from "next-intl";

interface MatchResult {
  id: string;
  homeTeam: string;
  homeTeamShort: string;
  homeTeamId?: string;
  awayTeam: string;
  awayTeamShort: string;
  awayTeamId?: string;
  homeScore: number;
  awayScore: number;
  scheduledAt?: string;
  status?: string;
}

interface MatchweekResultsProps {
  currentRound: number;
  lastRoundResults: MatchResult[];
  nextRoundMatches: MatchResult[];
  userTeamId?: string;
}

function MatchRow({
  match,
  showScore,
  showIcon = false,
  isUserHome = false,
  isUserAway = false,
}: {
  match: MatchResult;
  showScore: boolean;
  showIcon?: boolean;
  isUserHome?: boolean;
  isUserAway?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors">
      {/* Home */}
      <div className="flex items-center gap-2 flex-1">
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{
            backgroundColor:
              showScore && match.homeScore > match.awayScore
                ? "#00e479"
                : showScore && match.homeScore < match.awayScore
                ? "#ffb4ab"
                : "#8b928f",
          }}
        />
        <span className="font-headline font-bold text-on-surface">
          {match.homeTeamShort}
        </span>
        {showIcon && isUserHome && (
          <span className="material-symbols-outlined text-sm text-primary cursor-pointer hover:opacity-80">sports</span>
        )}
      </div>

      {/* Score or VS */}
      <div className="font-headline font-black bg-surface px-3 py-0.5 rounded text-on-surface">
        {showScore ? `${match.homeScore} - ${match.awayScore}` : "vs"}
      </div>

      {/* Away */}
      <div className="flex items-center gap-2 flex-1 justify-end">
        {showIcon && isUserAway && (
          <span className="material-symbols-outlined text-sm text-primary cursor-pointer hover:opacity-80">sports</span>
        )}
        <span className="font-headline font-bold text-on-surface">
          {match.awayTeamShort}
        </span>
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{
            backgroundColor:
              showScore && match.awayScore > match.homeScore
                ? "#00e479"
                : showScore && match.awayScore < match.homeScore
                ? "#ffb4ab"
                : "#8b928f",
          }}
        />
      </div>
    </div>
  );
}

export default function MatchweekResults({
  currentRound,
  lastRoundResults,
  nextRoundMatches,
  userTeamId,
}: MatchweekResultsProps) {
  const t = useTranslations();

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* This Round (Last Completed) */}
      <div className="bg-surface-container rounded-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <h4 className="text-[10px] font-headline font-bold uppercase tracking-widest text-on-surface-variant">
            {t("league.matchweek.thisRound", { round: currentRound })}
          </h4>
          <span className="text-[9px] px-2 py-0.5 bg-primary/10 text-primary font-label font-bold rounded-full">
            {t("league.matchweek.completed")}
          </span>
        </div>

        {/* Results */}
        <div className="p-3 space-y-2">
          {lastRoundResults.length > 0 ? (
            lastRoundResults.map((match) => (
              <MatchRow key={match.id} match={match} showScore={true} />
            ))
          ) : (
            <div className="text-center py-4 text-on-surface-variant text-xs">
              {t("league.matchweek.noResults")}
            </div>
          )}
        </div>
      </div>

      {/* Next Round */}
      <div className="bg-surface-container rounded-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <h4 className="text-[10px] font-headline font-bold uppercase tracking-widest text-on-surface-variant">
            {t("league.matchweek.nextRound", { round: currentRound + 1 })}
          </h4>
          <span className="text-[9px] px-2 py-0.5 bg-white/10 text-on-surface-variant font-label font-bold rounded-full">
            {t("league.matchweek.upcoming")}
          </span>
        </div>

        {/* Upcoming Matches */}
        <div className="p-3 space-y-2">
          {nextRoundMatches.length > 0 ? (
            nextRoundMatches.map((match) => {
              const isUserHome = userTeamId && match.homeTeamId === userTeamId;
              const isUserAway = userTeamId && match.awayTeamId === userTeamId;
              return (
                <MatchRow key={match.id} match={match} showScore={false} showIcon={true} isUserHome={isUserHome} isUserAway={isUserAway} />
              );
            })
          ) : (
            <div className="text-center py-4 text-on-surface-variant text-xs">
              {t("league.matchweek.noUpcoming")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
