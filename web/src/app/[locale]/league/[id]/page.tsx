"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import LeagueHeader from "@/components/league/LeagueHeader";
import LeftColumn from "@/components/league/LeftColumn";
import RightColumn from "@/components/league/RightColumn";
import { useAuth } from "@/contexts/AuthContext";
import { api, type Standing, type Team } from "@/lib/api";

interface NewsItem {
  id: string;
  type: "manager" | "transfer" | "general";
  title: string;
  excerpt: string;
  timeAgo: string;
}

interface MatchResult {
  id: string;
  homeTeam: string;
  homeTeamShort: string;
  awayTeam: string;
  awayTeamShort: string;
  homeScore: number;
  awayScore: number;
}

// Mock data for demo - replace with API calls
const MOCK_NEWS: NewsItem[] = [
  {
    id: "1",
    type: "manager",
    title: "Pep Guardiola leaves Manchester City",
    excerpt:
      "Ending a historic 8-year tenure, the Catalan tactician steps down after claiming his 6th Premier League title.",
    timeAgo: "2h ago",
  },
  {
    id: "2",
    type: "transfer",
    title: "Arsenal signs new striker from Napoli",
    excerpt:
      "The Gunners have triggered the €110m release clause for Victor Osimhen to bolster their attacking line.",
    timeAgo: "5h ago",
  },
  {
    id: "3",
    type: "general",
    title: "Liverpool announce new training facility",
    excerpt:
      "The Reds unveil state-of-the-art training complex worth £50m as part of club's 10-year master plan.",
    timeAgo: "1d ago",
  },
];

const MOCK_MATCH_RESULTS: MatchResult[] = [
  {
    id: "1",
    homeTeam: "Manchester United",
    homeTeamShort: "MUN",
    awayTeam: "Liverpool",
    awayTeamShort: "LIV",
    homeScore: 1,
    awayScore: 2,
  },
  {
    id: "2",
    homeTeam: "Chelsea",
    homeTeamShort: "CHE",
    awayTeam: "Arsenal",
    awayTeamShort: "ARS",
    homeScore: 0,
    awayScore: 0,
  },
  {
    id: "3",
    homeTeam: "Tottenham",
    homeTeamShort: "TOT",
    awayTeam: "Newcastle",
    awayTeamShort: "NEW",
    homeScore: 3,
    awayScore: 1,
  },
  {
    id: "4",
    homeTeam: "Aston Villa",
    homeTeamShort: "AVL",
    awayTeam: "West Ham",
    awayTeamShort: "WHU",
    homeScore: 2,
    awayScore: 2,
  },
];

export default function LeaguePage() {
  const t = useTranslations();
  const params = useParams();
  const { team: userTeam } = useAuth();
  const leagueId = params.id as string;
  const [league, setLeague] = useState<{ name: string; tier: number } | null>(
    null
  );
  const [standings, setStandings] = useState<Standing[]>([]);
  const [teams, setTeams] = useState<Record<string, Team>>({});
  const [gameState, setGameState] = useState<{
    season: number;
    week: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [leagueData, standingsData, gameData] = await Promise.all([
          api.leagues.getById(leagueId).catch(() => null),
          api.leagues.getStandings(leagueId).catch(() => []),
          api.game.getCurrent().catch(() => ({ season: 2024, week: 24 })),
        ]);

        setLeague(leagueData);
        setStandings(standingsData);
        setGameState(gameData);

        // Build teams map from standings
        const teamsMap: Record<string, Team> = {};
        for (const s of standingsData) {
          if (!teamsMap[s.teamId]) {
            teamsMap[s.teamId] = {
              id: s.teamId,
              name: `Club ${s.teamId.slice(0, 6)}`,
              leagueId: s.leagueId,
              isBot: true,
              jerseyColorPrimary: "#00e479",
              jerseyColorSecondary: "#ffffff",
            };
          }
        }
        setTeams(teamsMap);
      } catch (error) {
        console.error("Failed to fetch league data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [leagueId]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen bg-surface">
        <Sidebar />
        <main className="flex-1 ml-64 flex items-center justify-center">
          <span className="material-symbols-outlined text-4xl text-primary animate-spin">
            progress_activity
          </span>
        </main>
      </div>
    );
  }

  const totalMatchweeks = 38;
  const currentMatchweek = gameState?.week || 24;

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar />

      <main className="flex-1 ml-64 flex flex-col overflow-hidden">
        {/* Header */}
        <Header title={t("dashboard.nav.league")} />

        {/* League Header with tabs */}
        <LeagueHeader
          leagueName={league?.name || "Premier Division"}
          season={gameState?.season || 2024}
          matchweek={currentMatchweek}
          totalMatchweeks={totalMatchweeks}
        />

        {/* Content Area */}
        <div className="flex-grow flex p-6 min-h-0">
          {/* Left Spacer */}
          <div className="flex-1" />

          {/* Main Content: max-width 1400px */}
          <div className="w-full max-w-[1400px] flex gap-6 shrink-0">
            {/* Left Column: 5/12 */}
            <div className="flex-1 min-w-0">
              <LeftColumn
                news={MOCK_NEWS}
                matchday={currentMatchweek}
                matchResults={MOCK_MATCH_RESULTS}
              />
            </div>

            {/* Gap */}
            <div className="w-6 shrink-0" />

            {/* Right Column: 7/12 */}
            <div className="flex-1 min-w-0">
              <RightColumn
                standings={standings}
                teams={teams}
                userTeamId={userTeam?.id}
              />
            </div>
          </div>

          {/* Right Spacer */}
          <div className="flex-1" />
        </div>
      </main>
    </div>
  );
}
