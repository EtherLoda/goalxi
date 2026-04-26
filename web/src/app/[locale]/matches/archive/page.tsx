"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useParams } from "next/navigation";
import { api, type Match } from "@/lib/api";
import Link from "next/link";
import { clsx } from "clsx";

interface MatchWithResult extends Match {
  result?: "W" | "D" | "L" | null;
  isUserHome?: boolean;
}

export default function ArchivedMatchesPage() {
  const { team } = useAuth();
  const params = useParams();
  const locale = (params.locale as string) || "en";

  const [currentSeason, setCurrentSeason] = useState<number>(1);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [seasons, setSeasons] = useState<number[]>([1]);
  const [matches, setMatches] = useState<MatchWithResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Get current season
    api.game.getCurrent().then((current) => {
      setCurrentSeason(current.season);
      setSelectedSeason(current.season);
      // Generate season options (current season down to 1)
      const seasonOptions = Array.from(
        { length: current.season },
        (_, i) => current.season - i
      );
      setSeasons(seasonOptions);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (!team?.id || !selectedSeason) return;

    const fetchMatches = async () => {
      setIsLoading(true);
      try {
        const completedData = await api.matches.getByTeam(team.id, {
          status: "completed",
          season: selectedSeason,
        });

        const processedMatches = (completedData?.data || [])
          .sort((a: Match, b: Match) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())
          .map((match: Match) => {
            const isHome = match.homeTeamId === team.id;
            const userScore = isHome ? match.homeScore : match.awayScore;
            const opponentScore = isHome ? match.awayScore : match.homeScore;

            let result: "W" | "D" | "L" | null = null;
            if (userScore !== null && opponentScore !== null) {
              if (userScore > opponentScore) result = "W";
              else if (userScore < opponentScore) result = "L";
              else result = "D";
            }

            return { ...match, result, isUserHome: isHome };
          });

        setMatches(processedMatches);
      } catch (error) {
        console.error("Failed to fetch matches:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMatches();
  }, [team?.id, selectedSeason]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const isHomeMatch = (match: MatchWithResult) => match.homeTeamId === team?.id;

  const getOpponentName = (match: MatchWithResult) => {
    return match.homeTeamId === team?.id
      ? match.awayTeam?.name
      : match.homeTeam?.name;
  };

  const getResultBadgeClass = (result: "W" | "D" | "L" | null | undefined) => {
    switch (result) {
      case "W":
        return "bg-primary/10 text-primary border-primary/20";
      case "D":
        return "bg-white/5 text-on-surface-variant border-white/10";
      case "L":
        return "bg-error/10 text-error border-error/20";
      default:
        return "bg-white/5 text-on-surface-variant border-white/10";
    }
  };

  // Group matches by season/competition for display
  const getSeasonStats = () => {
    const wins = matches.filter((m) => m.result === "W").length;
    const draws = matches.filter((m) => m.result === "D").length;
    const losses = matches.filter((m) => m.result === "L").length;
    return { wins, draws, losses, total: matches.length };
  };

  const stats = getSeasonStats();

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-4xl mx-auto w-full">
      {/* Page Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href={`/${locale}/matches`}
            className="flex items-center justify-center w-10 h-10 bg-surface-container-low border border-outline-variant/30 text-on-surface-variant rounded-DEFAULT hover:bg-surface-container-high hover:text-on-surface transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          </Link>
          <h1 className="font-headline text-4xl md:text-5xl font-black tracking-tight text-on-surface uppercase italic">
            Archived Matches
          </h1>
        </div>

        {/* Season Selector */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-on-surface-variant font-medium">Season:</span>
          <div className="relative">
            <select
              value={selectedSeason}
              onChange={(e) => setSelectedSeason(Number(e.target.value))}
              className="appearance-none bg-surface-container-low border border-outline-variant/30 text-on-surface rounded-DEFAULT px-4 py-2 pr-10 text-sm font-medium cursor-pointer hover:bg-surface-container-high focus:outline-none focus:border-primary/50 transition-all"
            >
              {seasons.map((season) => (
                <option key={season} value={season}>
                  Season {season}
                </option>
              ))}
            </select>
            <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none material-symbols-outlined text-sm text-on-surface-variant">
              expand_more
            </span>
          </div>
        </div>
      </header>

      {/* Season Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface-container-low rounded-xl border border-outline-variant/10 p-4 text-center">
          <div className="font-headline text-3xl font-black text-on-surface mb-1">
            {stats.total}
          </div>
          <div className="text-xs text-on-surface-variant uppercase tracking-wider">
            Matches
          </div>
        </div>
        <div className="bg-surface-container-low rounded-xl border border-outline-variant/10 p-4 text-center">
          <div className="font-headline text-3xl font-black text-primary mb-1">
            {stats.wins}
          </div>
          <div className="text-xs text-on-surface-variant uppercase tracking-wider">
            Wins
          </div>
        </div>
        <div className="bg-surface-container-low rounded-xl border border-outline-variant/10 p-4 text-center">
          <div className="font-headline text-3xl font-black text-on-surface-variant mb-1">
            {stats.draws}
          </div>
          <div className="text-xs text-on-surface-variant uppercase tracking-wider">
            Draws
          </div>
        </div>
        <div className="bg-surface-container-low rounded-xl border border-outline-variant/10 p-4 text-center">
          <div className="font-headline text-3xl font-black text-error mb-1">
            {stats.losses}
          </div>
          <div className="text-xs text-on-surface-variant uppercase tracking-wider">
            Losses
          </div>
        </div>
      </div>

      {/* Matches List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-20 bg-surface-container-low rounded-xl animate-pulse"
            />
          ))}
        </div>
      ) : matches.length === 0 ? (
        <div className="bg-surface-container-low rounded-xl border border-outline-variant/10 p-12 text-center">
          <span className="material-symbols-outlined text-6xl text-on-surface-variant/30 mb-4 block">
            event_busy
          </span>
          <p className="text-on-surface-variant text-lg font-medium mb-2">
            No matches found
          </p>
          <p className="text-on-surface-variant/60 text-sm">
            {selectedSeason === currentSeason
              ? "Current season has no completed matches yet."
              : `Season ${selectedSeason} has no match records.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {matches.map((match) => (
            <Link
              key={match.id}
              href={`/${locale}/matches/${match.id}`}
              className="block bg-surface-container-low rounded-xl border border-outline-variant/10 hover:bg-surface-container hover:border-outline-variant/20 transition-all group"
            >
              <div className="p-4 flex items-center justify-between">
                {/* Left: Date + Teams */}
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  {/* Result indicator */}
                  <div
                    className={clsx(
                      "w-1.5 h-14 rounded-full shrink-0",
                      match.result === "W"
                        ? "bg-primary"
                        : match.result === "L"
                        ? "bg-error"
                        : "bg-outline"
                    )}
                  />

                  {/* Match info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs text-on-surface-variant mb-1">
                      <span className="material-symbols-outlined text-[12px]">stadium</span>
                      <span>{formatDate(match.scheduledAt)}</span>
                      <span>•</span>
                      <span>{isHomeMatch(match) ? "Home" : "Away"}</span>
                    </div>
                    <div className="font-headline text-base font-bold text-on-surface truncate">
                      {match.homeTeam?.name} - {match.awayTeam?.name}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="px-2 py-0.5 bg-surface-variant rounded text-[10px] font-bold text-on-surface-variant uppercase">
                        {team?.leagueId ? "League" : "Match"}
                      </span>
                      <span className="text-xs text-on-surface-variant">
                        Round {match.round || "-"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Score + Result */}
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <div className="font-headline text-2xl font-black text-on-surface">
                      {match.homeScore ?? 0} - {match.awayScore ?? 0}
                    </div>
                    <div className="text-xs text-on-surface-variant mt-0.5">
                      {isHomeMatch(match)
                        ? (match.homeScore ?? 0) > (match.awayScore ?? 0)
                          ? "Victory"
                          : (match.homeScore ?? 0) < (match.awayScore ?? 0)
                          ? "Defeat"
                          : "Draw"
                        : (match.awayScore ?? 0) > (match.homeScore ?? 0)
                        ? "Victory"
                        : (match.awayScore ?? 0) < (match.homeScore ?? 0)
                        ? "Defeat"
                        : "Draw"}
                    </div>
                  </div>
                  <div
                    className={clsx(
                      "w-10 h-10 rounded-lg border flex items-center justify-center font-headline font-bold text-sm",
                      getResultBadgeClass(match.result)
                    )}
                  >
                    {match.result === "W" ? "W" : match.result === "L" ? "L" : "D"}
                  </div>
                  <span className="material-symbols-outlined text-xl text-on-surface-variant group-hover:text-primary transition-colors">
                    chevron_right
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Season Navigation */}
      {seasons.length > 1 && (
        <div className="flex justify-center gap-3 pt-4 border-t border-white/5">
          {seasons.map((season) => (
            <button
              key={season}
              onClick={() => setSelectedSeason(season)}
              className={clsx(
                "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                selectedSeason === season
                  ? "bg-primary text-on-primary"
                  : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container hover:text-on-surface border border-outline-variant/10"
              )}
            >
              Season {season}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
