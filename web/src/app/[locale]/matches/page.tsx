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

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export default function MatchesPage() {
  const { team } = useAuth();
  const params = useParams();
  const locale = (params.locale as string) || "en";

  const [allRecentMatches, setAllRecentMatches] = useState<MatchWithResult[]>([]);
  const [allUpcomingMatches, setAllUpcomingMatches] = useState<MatchWithResult[]>([]);
  const [recentMatches, setRecentMatches] = useState<MatchWithResult[]>([]);
  const [upcomingMatches, setUpcomingMatches] = useState<MatchWithResult[]>([]);
  const [liveMatch, setLiveMatch] = useState<MatchWithResult | null>(null);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [leagueName, setLeagueName] = useState<string>("");

  useEffect(() => {
    if (!team?.id || !team?.leagueId) return;

    const fetchMatches = async () => {
      setIsLoading(true);
      try {
        const [completedData, upcomingData, liveData, leagueData] = await Promise.all([
          api.matches.getByTeam(team.id, { status: "completed" }),
          api.matches.getByTeam(team.id, { status: "scheduled" }),
          api.matches.getByTeam(team.id, { status: "in_progress" }),
          api.leagues.getById(team.leagueId),
        ]);

        setLeagueName(leagueData.name);

        const now = Date.now();
        const oneMonthAgo = now - ONE_MONTH_MS;
        const oneMonthLater = now + ONE_MONTH_MS;

        // Process completed matches and filter to last month
        const processedRecent = (completedData?.data || [])
          .filter((m: Match) => new Date(m.scheduledAt).getTime() >= oneMonthAgo)
          .sort((a: Match, b: Match) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())
          .slice(0, 5)
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

        // Process all upcoming matches
        const processedUpcoming = (upcomingData?.data || [])
          .sort((a: Match, b: Match) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
          .map((match: Match) => ({
            ...match,
            isUserHome: match.homeTeamId === team.id,
          }));

        // Filter to next month for display
        const upcomingThisMonth = processedUpcoming.filter(
          (m: MatchWithResult) => new Date(m.scheduledAt).getTime() <= oneMonthLater
        );

        // Process live match
        const processedLive = liveData?.data?.[0]
          ? { ...liveData.data[0], isUserHome: liveData.data[0].homeTeamId === team.id }
          : null;

        setAllRecentMatches(processedRecent);
        setAllUpcomingMatches(processedUpcoming);
        setUpcomingMatches(upcomingThisMonth);
        setRecentMatches(processedRecent);
        setLiveMatch(processedLive);
      } catch (error) {
        console.error("Failed to fetch matches:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMatches();
  }, [team?.id, team?.leagueId]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getOpponentName = (match: MatchWithResult) => {
    return match.homeTeamId === team?.id ? match.awayTeam?.name : match.homeTeam?.name;
  };

  const isHomeMatch = (match: MatchWithResult) => match.homeTeamId === team?.id;

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

  const getResultLabel = (result: "W" | "D" | "L" | null | undefined) => {
    switch (result) {
      case "W":
        return "W";
      case "D":
        return "D";
      case "L":
        return "L";
      default:
        return "-";
    }
  };

  const getTeamInitials = (name: string) => {
    const parts = name.split(" ");
    if (parts.length === 1) {
      // Single word like "Team1" or "Arsenal" - take first letter + any numbers
      const match = name.match(/^([A-Za-z])(\d*)$/);
      if (match) {
        return (match[1] + match[2]).toUpperCase().slice(0, 3);
      }
      return name.slice(0, 3).toUpperCase();
    }
    // Multiple words - take first letter of each word, include full numeric parts
    const initials = parts.map((word) => {
      // If word is purely numbers, keep them all
      if (/^\d+$/.test(word)) return word;
      // Otherwise take first letter
      return word[0];
    }).join("").toUpperCase();
    return initials.slice(0, 3);
  };

  const TeamLogo = ({ team }: { team: { name: string; logo: string | null } | undefined }) => {
    const initials = team ? getTeamInitials(team.name) : "??";

    if (team?.logo) {
      return (
        <div className="flex flex-col items-center gap-2">
          <img
            src={team.logo}
            alt={team.name}
            className="w-14 h-14 md:w-16 md:h-16 rounded-full object-cover bg-surface-container border border-outline-variant/20 shadow-lg"
          />
          <span className="font-headline font-semibold text-xs text-on-surface text-center truncate max-w-[80px]">
            {team.name}
          </span>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center gap-2">
        <div className="w-14 h-14 md:w-16 md:h-16 bg-surface-container rounded-full flex items-center justify-center border border-outline-variant/20 shadow-lg">
          <span className="font-headline font-bold text-lg md:text-xl text-on-surface">
            {initials}
          </span>
        </div>
        <span className="font-headline font-semibold text-xs text-on-surface text-center truncate max-w-[80px]">
          {team?.name || "Unknown"}
        </span>
      </div>
    );
  };

  // Get latest completed match
  const latestCompleted = recentMatches[0] || null;
  // Get next upcoming match
  const nextUpcoming = upcomingMatches[0] || null;
  // Live match takes priority over next upcoming
  const featuredRight = liveMatch || nextUpcoming;

  if (isLoading) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto w-full">
        <div className="animate-pulse space-y-6">
          <div className="h-12 w-64 bg-surface-container rounded-lg" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-48 bg-surface-container-highest rounded-2xl" />
            <div className="h-48 bg-surface-container-highest rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto w-full">
      {/* Page Header */}
      <header className="flex items-center justify-between">
        <h1 className="font-headline text-4xl md:text-5xl font-black tracking-tight text-on-surface uppercase italic">
          Matches
        </h1>
        <Link
          href={`/${locale}/matches/archive`}
          className="flex items-center gap-2 px-4 py-2 bg-surface-container-low border border-outline-variant/30 text-on-surface rounded-DEFAULT text-sm font-medium hover:bg-surface-container-high hover:border-primary/30 transition-all"
        >
          <span className="material-symbols-outlined text-[18px]">inventory_2</span>
          Archived Matches
        </Link>
      </header>

      {/* Featured Matches Grid: Left (Latest Finished) | Right (Live/Next) */}
      {(latestCompleted || featuredRight || recentMatches.length > 1 || upcomingMatches.length > 1) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Latest Completed Match */}
          <div>
            <h2 className="font-headline text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-lg">history</span>
              Latest Result
            </h2>
            {latestCompleted ? (
              <Link
                href={`/${locale}/matches/${latestCompleted.id}`}
                className="block bg-surface-container-highest/80 backdrop-blur-md rounded-DEFAULT p-4 md:p-5 relative overflow-hidden border border-outline-variant/15 hover:brightness-110 transition-all group"
              >
                {/* Top gradient bar */}
                <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-primary/60 to-transparent" />

                {/* Date & Venue */}
                <div className="flex items-center gap-2 text-xs text-on-surface-variant mb-3 relative z-10">
                  <span className="material-symbols-outlined text-[14px]">stadium</span>
                  <span>{formatDate(latestCompleted.scheduledAt)}</span>
                  <span>•</span>
                  <span>{isHomeMatch(latestCompleted) ? "Home" : "Away"}</span>
                  <span className="ml-auto px-1.5 py-0.5 bg-surface-variant rounded text-[10px] font-bold uppercase">
                    {latestCompleted.round ? `Round ${latestCompleted.round} • ` : ""}{leagueName}
                  </span>
                </div>

                {/* Teams & Score */}
                <div className="flex items-center justify-between relative z-10">
                  <div className="flex-1 flex items-center justify-center gap-4 md:gap-6">
                    <TeamLogo team={latestCompleted.homeTeam} />
                    <div className="flex flex-col items-center justify-center min-w-[80px] md:min-w-[100px]">
                      <div className="font-headline text-2xl md:text-3xl font-black text-on-surface">
                        {latestCompleted.homeScore} - {latestCompleted.awayScore}
                      </div>
                    </div>
                    <TeamLogo team={latestCompleted.awayTeam} />
                  </div>
                </div>

                {/* Hover indicator */}
                <div className="mt-2 pt-1.5 border-t border-white/5 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity relative z-10">
                  <span className="text-xs text-primary font-medium">View Match Report</span>
                  <span className="material-symbols-outlined text-primary text-lg">chevron_right</span>
                </div>
              </Link>
            ) : (
              <div className="block bg-surface-container-highest/80 backdrop-blur-md rounded-DEFAULT p-5 relative overflow-hidden border border-outline-variant/15">
                <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-primary/40 to-transparent" />
                <div className="text-center py-6 relative z-10">
                  <span className="material-symbols-outlined text-4xl text-on-surface-variant/30 mb-2 block">
                    history
                  </span>
                  <p className="text-on-surface-variant text-sm">No completed matches</p>
                </div>
              </div>
            )}
          </div>

          {/* Right: Live Match or Next Upcoming */}
          <div>
            <h2 className="font-headline text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-3 flex items-center gap-2">
              {liveMatch ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  Live Now
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-primary text-lg">event</span>
                  {nextUpcoming ? "Next Match" : "Upcoming"}
                </>
              )}
            </h2>
            {featuredRight ? (
              <Link
                href={liveMatch ? `/${locale}/matches/live/${featuredRight.id}` : `/${locale}/matches/${featuredRight.id}`}
                className={clsx(
                  "block rounded-DEFAULT p-4 md:p-5 relative overflow-hidden border hover:brightness-110 transition-all group",
                  liveMatch
                    ? "bg-surface-container-highest/80 backdrop-blur-md border-primary/30"
                    : "bg-surface-container-highest/80 backdrop-blur-md border-outline-variant/15"
                )}
              >
                {/* Top gradient bar */}
                <div className={clsx(
                  "absolute top-0 left-0 w-full h-0.5",
                  liveMatch ? "bg-gradient-to-r from-primary to-transparent" : "bg-gradient-to-r from-tertiary/60 to-transparent"
                )} />

                {/* Live Badge or Date */}
                <div className="flex items-center gap-2 text-xs mb-3 relative z-10">
                  {liveMatch ? (
                    <div className="inline-flex items-center gap-2 px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                      LIVE • {liveMatch.round || "?"}'
                    </div>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[14px]">stadium</span>
                      <span className="text-on-surface-variant">
                        {formatDate(featuredRight.scheduledAt)} • {formatTime(featuredRight.scheduledAt)}
                      </span>
                    </>
                  )}
                  <span className="ml-auto px-1.5 py-0.5 bg-surface-variant rounded text-[10px] font-bold uppercase">
                    {featuredRight.round ? `Round ${featuredRight.round} • ` : ""}{leagueName}
                  </span>
                </div>

                {/* Teams & Score or VS */}
                <div className="flex items-center justify-between relative z-10">
                  <div className="flex-1 flex items-center justify-center gap-4 md:gap-6">
                    <TeamLogo team={featuredRight.homeTeam} />
                    <div className="flex flex-col items-center justify-center min-w-[80px] md:min-w-[100px]">
                      {liveMatch ? (
                        <div className="font-headline text-2xl md:text-3xl font-black text-on-surface">
                          {liveMatch.homeScore ?? 0} - {liveMatch.awayScore ?? 0}
                        </div>
                      ) : (
                        <div className="text-center">
                          <div className="font-headline text-xs font-medium text-on-surface-variant mb-0.5">
                            {isHomeMatch(featuredRight) ? "Home" : "Away"}
                          </div>
                          <div className="font-headline text-2xl font-black text-on-surface">
                            VS
                          </div>
                        </div>
                      )}
                    </div>
                    <TeamLogo team={featuredRight.awayTeam} />
                  </div>
                </div>

                {/* Hover indicator */}
                <div className="mt-2 pt-1.5 border-t border-white/5 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity relative z-10">
                  <span className="text-xs text-primary font-medium">
                    {liveMatch ? "Enter Match Center" : "View Details"}
                  </span>
                  <span className="material-symbols-outlined text-primary text-lg">chevron_right</span>
                </div>
              </Link>
            ) : (
              <div className="block bg-surface-container-highest/80 backdrop-blur-md rounded-DEFAULT p-5 relative overflow-hidden border border-outline-variant/15">
                <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-tertiary/40 to-transparent" />
                <div className="text-center py-6 relative z-10">
                  <span className="material-symbols-outlined text-4xl text-on-surface-variant/30 mb-2 block">
                    event_busy
                  </span>
                  <p className="text-on-surface-variant text-sm">No upcoming matches</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recent & Upcoming Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Recent Results List */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          <h2 className="font-headline text-sm font-semibold text-on-surface-variant uppercase tracking-wider flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-lg">history</span>
            Recent Results
          </h2>

          {recentMatches.length === 0 ? (
            <div className="bg-surface-container-low rounded-xl p-6 text-center">
              <p className="text-on-surface-variant text-sm">No recent matches</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentMatches.map((match) => (
                <Link
                  key={match.id}
                  href={`/${locale}/matches/${match.id}`}
                  className="flex items-center justify-between p-3 bg-surface-container-low rounded-lg border border-outline-variant/10 hover:bg-surface-container transition-colors group"
                >
                  {/* Left: Date + Teams */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Result indicator */}
                    <div
                      className={clsx(
                        "w-1.5 h-10 rounded-full shrink-0",
                        match.result === "W" ? "bg-primary" :
                        match.result === "L" ? "bg-error" : "bg-outline"
                      )}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs text-on-surface-variant mb-0.5">
                        <span>{formatDate(match.scheduledAt)}</span>
                        <span>•</span>
                        <span>{isHomeMatch(match) ? "H" : "A"}</span>
                      </div>
                      <div className="font-headline text-sm font-medium text-on-surface truncate">
                        {match.homeTeam?.name} - {match.awayTeam?.name}
                      </div>
                    </div>
                  </div>

                  {/* Right: Score + Result */}
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-headline font-bold text-on-surface">
                      {match.homeScore} - {match.awayScore}
                    </span>
                    <div className={clsx(
                      "w-7 h-7 rounded-md border flex items-center justify-center font-headline font-bold text-xs",
                      getResultBadgeClass(match.result)
                    )}>
                      {getResultLabel(match.result)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Fixtures List */}
        <div className="lg:col-span-7 flex flex-col gap-3">
          <h2 className="font-headline text-sm font-semibold text-on-surface-variant uppercase tracking-wider flex items-center gap-2">
            <span className="material-symbols-outlined text-tertiary text-lg">event</span>
            Upcoming Fixtures
            {allUpcomingMatches.length > upcomingMatches.length && (
              <button
                onClick={() => setShowAllUpcoming(!showAllUpcoming)}
                className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline font-medium"
              >
                {showAllUpcoming ? (
                  <>
                    Show Less
                    <span className="material-symbols-outlined text-lg">expand_less</span>
                  </>
                ) : (
                  <>
                    All ({allUpcomingMatches.length})
                    <span className="material-symbols-outlined text-lg">expand_more</span>
                  </>
                )}
              </button>
            )}
          </h2>

          {upcomingMatches.length === 0 ? (
            <div className="bg-surface-container-low rounded-xl p-6 text-center">
              <p className="text-on-surface-variant text-sm">No upcoming matches</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(showAllUpcoming ? allUpcomingMatches : upcomingMatches).map((match) => (
                <Link
                  key={match.id}
                  href={`/${locale}/matches/${match.id}`}
                  className="flex items-center justify-between p-3 bg-surface-container-low rounded-lg border border-outline-variant/10 hover:bg-surface-container transition-colors group"
                >
                  {/* Left: Date + Teams */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Date badge */}
                    <div className="w-12 h-12 rounded-lg bg-surface-container flex flex-col items-center justify-center border border-outline-variant/20 shrink-0">
                      <span className="text-[10px] font-bold text-on-surface-variant uppercase">
                        {new Date(match.scheduledAt).toLocaleDateString("en-US", { month: "short" })}
                      </span>
                      <span className="font-headline font-bold text-on-surface">
                        {new Date(match.scheduledAt).getDate()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="px-1.5 py-0.5 bg-surface-variant rounded text-[10px] font-bold text-on-surface-variant uppercase">
                          {team?.leagueId ? "League" : "Match"}
                        </span>
                        <span className="text-xs text-on-surface-variant">
                          {formatTime(match.scheduledAt)}
                        </span>
                      </div>
                      <div className="font-headline text-sm font-medium text-on-surface">
                        {isHomeMatch(match) ? "vs" : "@"} {getOpponentName(match)}
                        <span className="ml-2 text-xs text-on-surface-variant font-normal">
                          {isHomeMatch(match) ? "Home" : "Away"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Arrow */}
                  <div className="shrink-0">
                    <span className="material-symbols-outlined text-xl text-on-surface-variant group-hover:text-primary transition-colors">
                      chevron_right
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
