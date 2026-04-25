"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import LeftColumn from "@/components/league/LeftColumn";
import RightColumn from "@/components/league/RightColumn";
import { useAuth } from "@/contexts/AuthContext";
import { api, type Standing, type Team, type Match, type LeagueNewsItem } from "@/lib/api";

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
  homeTeamId?: string;
  awayTeam: string;
  awayTeamShort: string;
  awayTeamId?: string;
  homeScore: number;
  awayScore: number;
  scheduledAt?: string;
  status?: string;
}

// Mock news data - replace with API when news endpoint is available
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

// Helper to shorten team name to 3-letter code
function toShortName(name: string): string {
  // Handle "Team X" pattern -> "TX"
  const teamMatch = name.match(/^Team\s+(\d+)$/i);
  if (teamMatch) {
    return `T${teamMatch[1]}`;
  }
  // Handle "Team XX" (two digit) -> "TXX"
  const words = name.split(' ');
  if (words.length === 1) return name.slice(0, 3).toUpperCase();
  return words.map(w => w[0]).join('').slice(0, 3).toUpperCase();
}

// Transform API match to MatchResult
function matchToResult(match: Match, isCompleted: boolean): MatchResult {
  return {
    id: match.id,
    homeTeam: match.homeTeam.name,
    homeTeamShort: toShortName(match.homeTeam.name),
    homeTeamId: match.homeTeam.id,
    awayTeam: match.awayTeam.name,
    awayTeamShort: toShortName(match.awayTeam.name),
    awayTeamId: match.awayTeam.id,
    homeScore: match.homeScore ?? 0,
    awayScore: match.awayScore ?? 0,
    scheduledAt: match.scheduledAt,
    status: match.status,
  };
}

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
    round: number;
  } | null>(null);
  const [lastRoundResults, setLastRoundResults] = useState<MatchResult[]>([]);
  const [nextRoundMatches, setNextRoundMatches] = useState<MatchResult[]>([]);
  const [allMatches, setAllMatches] = useState<Match[]>([]);
  const [leagueNews, setLeagueNews] = useState<NewsItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch league data, standings, and all matches in parallel
        const [leagueData, standingsData, matchesData, newsData] = await Promise.all([
          api.leagues.getById(leagueId).catch(() => null),
          api.leagues.getStandings(leagueId).catch(() => []),
          api.matches.getByLeague(leagueId, {}).catch(() => ({ data: [] })),
          api.news.getLeagueNews(leagueId, { limit: 10 }).catch(() => ({ items: [] })),
        ]);

        setLeague(leagueData);
        setStandings(standingsData);

        const matches = matchesData.data || [];
        setAllMatches(matches);
        console.log(`[LeaguePage] leagueId=${leagueId}, totalMatches=${matches.length}, rounds found:`, [...new Set(matches.map((m: Match) => m.round))]);

        // Find the latest completed round (this round with results)
        const completedMatches = matches
          .filter((m: Match) => m.status === 'completed')
          .sort((a: Match, b: Match) => {
            const roundA = a.round ?? a.week * 2;
            const roundB = b.round ?? b.week * 2;
            return roundB - roundA;
          });

        const latestCompletedRound = completedMatches.length > 0
          ? (completedMatches[0].round ?? completedMatches[0].week * 2)
          : 0;

        // Find next scheduled round (next round with no results yet)
        const scheduledMatches = matches
          .filter((m: Match) => m.status === 'scheduled' || m.status === 'tactics_locked')
          .sort((a: Match, b: Match) => {
            const roundA = a.round ?? a.week * 2;
            const roundB = b.round ?? b.week * 2;
            return roundA - roundB;
          });

        const nextScheduledRound = scheduledMatches.length > 0
          ? (scheduledMatches[0].round ?? scheduledMatches[0].week * 2)
          : latestCompletedRound + 1;

        // Set current round for display
        setGameState({ season: 2024, week: latestCompletedRound, round: latestCompletedRound });

        // Transform last round matches (this round = latest completed)
        const lastMatches = completedMatches
          .filter((m: Match) => (m.round ?? m.week * 2) === latestCompletedRound)
          .map((m: Match) => matchToResult(m, true));
        setLastRoundResults(lastMatches);

        // Transform next round matches (next scheduled round)
        const nextMatches = scheduledMatches
          .filter((m: Match) => (m.round ?? m.week * 2) === nextScheduledRound)
          .map((m: Match) => matchToResult(m, false));
        setNextRoundMatches(nextMatches);

        // Build teams map from standings
        const teamsMap: Record<string, Team> = {};
        for (const s of standingsData) {
          if (!teamsMap[s.teamId]) {
            teamsMap[s.teamId] = {
              id: s.teamId,
              name: s.teamName || `Club ${s.teamId.slice(0, 6)}`,
              leagueId: s.leagueId,
              isBot: true,
              jerseyColorPrimary: "#00e479",
              jerseyColorSecondary: "#ffffff",
            };
          }
        }
        setTeams(teamsMap);

        // Transform league news to NewsItem format
        const transformedNews: NewsItem[] = (newsData?.items || []).map((item: LeagueNewsItem) => {
          let type: "manager" | "transfer" | "general" = "general";
          let title = item.title;
          let excerpt = item.description;

          if (item.type === 'TRANSFER') {
            type = "transfer";
            title = item.playerName ? `Transfer: ${item.playerName}` : 'Player Transfer';
          } else if (item.type === 'MATCH_RESULT') {
            type = "general";
            title = `Match Result: ${item.homeTeam?.name || 'Home'} vs ${item.awayTeam?.name || 'Away'}`;
            excerpt = `${item.homeScore} - ${item.awayScore}`;
          } else if (item.type === 'PRIZE_MONEY') {
            type = "general";
            title = 'Prize Money Awarded';
          }

          // Calculate time ago from date
          const date = new Date(item.date);
          const now = new Date();
          const diffMs = now.getTime() - date.getTime();
          const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
          const diffDays = Math.floor(diffHours / 24);
          const timeAgo = diffDays > 0 ? `${diffDays}d ago` : diffHours > 0 ? `${diffHours}h ago` : 'Just now';

          return {
            id: item.id,
            type,
            title,
            excerpt,
            timeAgo,
          };
        });
        setLeagueNews(transformedNews);
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
      <div className="flex items-center justify-center min-h-screen">
        <span className="material-symbols-outlined text-4xl text-primary animate-spin">
          progress_activity
        </span>
      </div>
    );
  }

  const totalMatchweeks = 16;
  const currentRound = gameState?.round || 0;

  return (
    <>
      {/* Content Area */}
      <div className="flex-grow flex p-6 min-h-0">
          {/* Left Spacer */}
          <div className="flex-1" />

          {/* Main Content: max-width 1400px */}
          <div className="w-full max-w-[1400px] flex gap-6 shrink-0">
            {/* Left Column: 5/12 */}
            <div className="flex-1 min-w-0">
              <LeftColumn
                news={leagueNews.length > 0 ? leagueNews : []}
                currentRound={currentRound}
                lastRoundResults={lastRoundResults}
                nextRoundMatches={nextRoundMatches}
                userTeamId={userTeam?.id}
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
                allMatches={allMatches}
              />
            </div>
          </div>

          {/* Right Spacer */}
          <div className="flex-1" />
        </div>
    </>
  );
}
