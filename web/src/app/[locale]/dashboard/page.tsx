"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { api, type Standing, type Match } from "@/lib/api";

export default function DashboardPage() {
  const t = useTranslations();
  const params = useParams();
  const { user, team, isLoading: authLoading } = useAuth();
  const [standings, setStandings] = useState<Standing[]>([]);
  const [upcomingMatch, setUpcomingMatch] = useState<Match | null>(null);
  const [recentMatches, setRecentMatches] = useState<Match[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!team?.leagueId) return;

    setIsLoading(true);

    Promise.all([
      api.leagues.getStandings(team.leagueId),
      api.matches.getByTeam(team.id, { status: "scheduled" }),
      api.matches.getByTeam(team.id, { status: "completed", season: 1 }),
    ])
      .then(([standingsData, upcomingData, recentData]) => {
        setStandings(standingsData);
        const upcoming = upcomingData?.data?.[0] || null;
        setUpcomingMatch(upcoming);
        // Get last 5 completed matches for form
        const recent = (recentData?.data || [])
          .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())
          .slice(0, 5);
        setRecentMatches(recent);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [team?.leagueId, team?.id]);

  const userStanding = standings.find((s) => s.teamId === team?.id);

  const getFormResults = () => {
    return recentMatches.map((match) => {
      const isHome = match.homeTeamId === team?.id;
      const userScore = isHome ? match.homeScore : match.awayScore;
      const opponentScore = isHome ? match.awayScore : match.homeScore;

      if (userScore === null || opponentScore === null) return { result: "-", type: "pending" as const };
      if (userScore > opponentScore) return { result: "W", type: "win" as const };
      if (userScore < opponentScore) return { result: "L", type: "loss" as const };
      return { result: "D", type: "draw" as const };
    });
  };

  const formResults = getFormResults();

  const getOpponentName = (match: Match) => {
    if (!team) return "";
    return match.homeTeamId === team.id ? match.awayTeamName : match.homeTeamName;
  };

  const getOpponentInitials = (name: string) => {
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
          {/* Hero Grid: Next Match */}
          <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Next Match Card */}
            <div className="xl:col-span-2 glass-panel rounded-2xl overflow-hidden p-8 relative">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent" />
              <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                {/* Left info */}
                <div className="flex-1 space-y-4 text-center md:text-left">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    <span className="font-label text-[10px] font-black uppercase tracking-[0.2em] text-primary">
                      {t("dashboard.matchday")} {upcomingMatch?.matchday || "--"}
                    </span>
                  </div>
                  <h2 className="font-headline text-5xl font-black tracking-tighter text-on-surface">
                    {upcomingMatch ? getOpponentName(upcomingMatch).toUpperCase() : "NO MATCHES"}
                  </h2>
                  <p className="font-body text-sm text-on-surface-variant max-w-sm leading-relaxed">
                    {upcomingMatch
                      ? `${t("dashboard.venue")}: ${upcomingMatch.venue || "TBD"}`
                      : "No upcoming matches scheduled"}
                  </p>
                  <div className="flex flex-wrap gap-6 pt-2 justify-center md:justify-start">
                    <div className="flex flex-col">
                      <span className="font-label text-[9px] uppercase tracking-[0.2em] text-primary font-black mb-1">
                        {t("dashboard.kickoff")}
                      </span>
                      <span className="font-headline font-bold text-on-surface">
                        {upcomingMatch ? formatDate(upcomingMatch.scheduledAt) : "-- : --"}
                      </span>
                    </div>
                    <div className="w-px h-8 bg-white/10" />
                    <div className="flex flex-col">
                      <span className="font-label text-[9px] uppercase tracking-[0.2em] text-primary font-black mb-1">
                        {t("dashboard.venue")}
                      </span>
                      <span className="font-headline font-bold text-on-surface">
                        {upcomingMatch?.venue || "TBD"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* VS Block */}
                <div className="flex items-center gap-6 px-8 py-6 rounded-3xl bg-surface-container-low/80 backdrop-blur-md border border-white/5">
                  <div className="text-center space-y-2">
                    <div
                      className="w-16 h-16 rounded-full border-2 flex items-center justify-center"
                      style={{
                        backgroundColor: `${team?.jerseyColorPrimary || "#00E479"}20`,
                        borderColor: team?.jerseyColorPrimary || "#00E479",
                      }}
                    >
                      <span
                        className="font-headline font-black text-lg"
                        style={{ color: team?.jerseyColorPrimary || "#00E479" }}
                      >
                        {team?.name?.slice(0, 2).toUpperCase() || "EF"}
                      </span>
                    </div>
                    <span className="font-label text-[10px] font-black text-secondary uppercase tracking-widest">
                      {t("dashboard.home")}
                    </span>
                  </div>
                  <div className="font-headline font-black text-2xl text-on-surface-variant/30">VS</div>
                  <div className="text-center space-y-2">
                    <div className="w-16 h-16 rounded-full bg-error/10 border-2 border-error/30 flex items-center justify-center">
                      <span className="font-headline font-black text-lg text-error">
                        {upcomingMatch ? getOpponentInitials(getOpponentName(upcomingMatch)) : "TBD"}
                      </span>
                    </div>
                    <span className="font-label text-[10px] font-black text-error uppercase tracking-widest">
                      {t("dashboard.away")}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Squad Status */}
            <div className="glass-panel rounded-2xl p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-headline font-black text-xs uppercase tracking-[0.2em] text-primary">
                    {t("dashboard.squadStatus")}
                  </h3>
                  <span className="font-label text-[9px] font-black text-on-surface-variant uppercase tracking-widest">
                    {team?.name || "Loading..."}
                  </span>
                </div>
                <div className="flex items-center gap-4 mb-6">
                  <span className="font-headline text-6xl font-black text-on-surface tracking-tighter">
                    {userStanding ? `#${userStanding.position}` : "--"}
                  </span>
                  <div className="space-y-1">
                    {userStanding && userStanding.position <= 4 ? (
                      <div className="flex items-center gap-2 text-primary">
                        <span className="material-symbols-outlined text-sm">trending_up</span>
                        <span className="font-label text-[10px] font-black uppercase tracking-wider">
                          Playoff Zone
                        </span>
                      </div>
                    ) : userStanding && userStanding.position > 12 ? (
                      <div className="flex items-center gap-2 text-error">
                        <span className="material-symbols-outlined text-sm">trending_down</span>
                        <span className="font-label text-[10px] font-black uppercase tracking-wider">
                          Relegation Zone
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-on-surface-variant">
                        <span className="material-symbols-outlined text-sm">trending_flat</span>
                        <span className="font-label text-[10px] font-black uppercase tracking-wider">
                          Mid Table
                        </span>
                      </div>
                    )}
                    <p className="font-body text-[10px] text-on-surface-variant font-bold uppercase tracking-widest">
                      {userStanding
                        ? `${userStanding.points} ${t("dashboard.points")} | ${userStanding.played} ${t("dashboard.games")}`
                        : "Loading..."}
                    </p>
                  </div>
                </div>
              </div>

              {/* Recent Form */}
              <div className="space-y-3">
                <p className="font-label text-[9px] uppercase tracking-[0.2em] text-primary font-black">
                  {t("dashboard.recentForm")}
                </p>
                <div className="flex gap-2">
                  {formResults.length > 0 ? (
                    formResults.map((r, i) => (
                      <div
                        key={i}
                        className={`w-9 h-9 rounded-lg flex items-center justify-center font-headline font-black text-xs border ${
                          r.type === "win"
                            ? "bg-primary text-on-primary border-primary shadow-[0_0_12px_rgba(0,228,121,0.3)]"
                            : r.type === "draw"
                            ? "bg-white/5 text-on-surface-variant border-white/10"
                            : r.type === "loss"
                            ? "bg-error/10 text-error border-error/20"
                            : "bg-white/5 text-on-surface-variant border-white/10"
                        }`}
                      >
                        {r.result}
                      </div>
                    ))
                  ) : (
                    <div className="text-on-surface-variant text-sm">No recent matches</div>
                  )}
                </div>
                <div className="pt-3 border-t border-white/5 flex justify-between items-center">
                  <span className="font-label text-[10px] text-on-surface-variant font-bold uppercase">
                    {upcomingMatch
                      ? `Next: ${getOpponentName(upcomingMatch)}`
                      : "No upcoming matches"}
                  </span>
                  <a href="#" className="font-label text-[10px] font-black text-primary uppercase tracking-widest hover:underline">
                    Full Table →
                  </a>
                </div>
              </div>
            </div>
          </section>

          {/* Second Grid */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Action Required */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-headline font-black text-xs uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg">assignment_late</span>
                  {t("dashboard.actionRequired")}
                </h3>
                <span className="font-label text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                  0 Active
                </span>
              </div>
              <div className="glass-panel rounded-2xl p-8 text-center">
                <span className="material-symbols-outlined text-4xl text-on-surface-variant/30 mb-2">
                  check_circle
                </span>
                <p className="font-body text-sm text-on-surface-variant">
                  No pending actions at this time
                </p>
              </div>
            </div>

            {/* Official News */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-headline font-black text-xs uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>campaign</span>
                  {t("dashboard.officialNews")}
                </h3>
                <a href="#" className="font-label text-[10px] font-black text-on-surface-variant uppercase tracking-widest hover:text-primary transition-colors">
                  Archive
                </a>
              </div>
              <div className="glass-panel rounded-2xl p-8 text-center">
                <span className="material-symbols-outlined text-4xl text-on-surface-variant/30 mb-2">
                  newsmode
                </span>
                <p className="font-body text-sm text-on-surface-variant">
                  No news at this time
                </p>
              </div>
            </div>
          </section>
        </div>
  );
}
