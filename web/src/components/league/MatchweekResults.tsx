"use client";

import { useTranslations } from "next-intl";

interface MatchResult {
  id: string;
  homeTeam: string;
  homeTeamShort: string;
  awayTeam: string;
  awayTeamShort: string;
  homeScore: number;
  awayScore: number;
}

interface MatchweekResultsProps {
  matchday: number;
  results: MatchResult[];
}

export default function MatchweekResults({
  matchday,
  results,
}: MatchweekResultsProps) {
  const t = useTranslations();

  return (
    <div className="bg-surface-container rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <h4 className="text-[10px] font-headline font-bold uppercase tracking-widest text-on-surface-variant">
          {t("league.matchweek.results", { matchday })}
        </h4>
        <span className="text-[9px] px-2 py-0.5 bg-primary/10 text-primary font-label font-bold rounded-full">
          {t("league.matchweek.completed")}
        </span>
      </div>

      {/* Results */}
      <div className="p-3 space-y-2">
        {results.map((match) => (
          <div
            key={match.id}
            className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors"
          >
            {/* Home */}
            <div className="flex items-center gap-2 flex-1">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  backgroundColor:
                    match.homeScore > match.awayScore
                      ? "#00e479"
                      : match.homeScore < match.awayScore
                      ? "#ffb4ab"
                      : "#8b928f",
                }}
              />
              <span className="font-headline font-bold text-on-surface">
                {match.homeTeamShort}
              </span>
            </div>

            {/* Score */}
            <div className="font-headline font-black bg-surface px-3 py-0.5 rounded text-on-surface">
              {match.homeScore} - {match.awayScore}
            </div>

            {/* Away */}
            <div className="flex items-center gap-2 flex-1 justify-end">
              <span className="font-headline font-bold text-on-surface">
                {match.awayTeamShort}
              </span>
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  backgroundColor:
                    match.awayScore > match.homeScore
                      ? "#00e479"
                      : match.awayScore < match.homeScore
                      ? "#ffb4ab"
                      : "#8b928f",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
