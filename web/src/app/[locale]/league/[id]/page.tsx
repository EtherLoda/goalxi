"use client";

import { useEffect, useState, Suspense } from "react";
import { useTranslations } from "next-intl";
import { useParams, useSearchParams } from "next/navigation";
import LeftColumn from "@/components/league/LeftColumn";
import RightColumn from "@/components/league/RightColumn";
import { useAuth } from "@/contexts/AuthContext";
import { useGameStore } from "@/stores/gameStore";
import { api, type Standing, type Team, type Match, type LeagueNewsItem } from "@/lib/api";

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
  return (
    <Suspense fallback={<LeaguePageLoading />}>
      <LeaguePageContent />
    </Suspense>
  );
}

function LeaguePageContent() {
  const t = useTranslations();
  const params = useParams();
  const searchParams = useSearchParams();
  const { team: userTeam } = useAuth();
  const { setViewTeam } = useGameStore();
  const leagueId = params.id as string;

  // Force re-render when page is restored from bfcache (back navigation)
  const [bfcacheKey, setBfcacheKey] = useState(0);
  useEffect(() => {
    const handlePageshow = (event: Event) => {
      const e = event as { persisted?: boolean };
      if (e.persisted) {
        setBfcacheKey((k) => k + 1);
      }
    };
    window.addEventListener("pageshow", handlePageshow);
    return () => window.removeEventListener("pageshow", handlePageshow);
  }, []);

  // Sync URL params to Zustand on mount
  useEffect(() => {
    const urlTeamId = searchParams.get("team");
    if (urlTeamId) {
      setViewTeam(urlTeamId);
    }
  }, []);

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
  const [leagueNews, setLeagueNews] = useState<(LeagueNewsItem & { timeAgo: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Re-fetch when leagueId changes
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

        // Add timeAgo to news items
        const newsWithTimeAgo = (newsData?.items || []).map((item: LeagueNewsItem) => {
          const date = new Date(item.date);
          const now = new Date();
          const diffMs = now.getTime() - date.getTime();
          const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
          const diffDays = Math.floor(diffHours / 24);
          const timeAgo = diffDays > 0 ? `${diffDays}d ago` : diffHours > 0 ? `${diffHours}h ago` : 'Just now';
          return { ...item, timeAgo };
        });
        setLeagueNews(newsWithTimeAgo);
      } catch (error) {
        console.error("[LeaguePage] Failed to fetch league data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [leagueId, bfcacheKey]);

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
                locale={params.locale as string}
              />
            </div>
          </div>

          {/* Right Spacer */}
          <div className="flex-1" />
        </div>
    </>
  );
}

function LeaguePageLoading() {
  return (
    <div className="flex items-center justify-center h-full">
      <span className="material-symbols-outlined text-4xl text-primary animate-spin">
        progress_activity
      </span>
    </div>
  );
}
