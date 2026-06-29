"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import LeftColumn from "@/components/league/LeftColumn";
import RightColumn from "@/components/league/RightColumn";
import LeagueHeader from "@/components/league/LeagueHeader";
import LeagueKpiStrip from "@/components/league/LeagueKpiStrip";
import { useAuth } from "@/contexts/AuthContext";
import { useGameStore } from "@/stores/gameStore";
import { api, type Standing, type Match, type LeagueNewsItem } from "@/lib/api";

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

function toShortName(name: string): string {
  const teamMatch = name.match(/^Team\s+(\d+)$/i);
  if (teamMatch) {
    return `T${teamMatch[1]}`;
  }
  const words = name.split(' ');
  if (words.length === 1) return name.slice(0, 3).toUpperCase();
  return words.map(w => w[0]).join('').slice(0, 3).toUpperCase();
}

function matchToResult(match: Match): MatchResult {
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
  const params = useParams();
  const searchParams = useSearchParams();
  const { team: userTeam } = useAuth();
  const { setViewTeam } = useGameStore();
  const leagueId = params.id as string;
  const locale = (params.locale as string) || "en";

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
  }, [searchParams, setViewTeam]);

  const [league, setLeague] = useState<{ name: string; tier: number } | null>(null);
  const [standings, setStandings] = useState<Standing[]>([]);
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

  useEffect(() => {
    const fetchData = async () => {
      try {
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

        setGameState({ season: 2024, week: latestCompletedRound, round: latestCompletedRound });

        const lastMatches = completedMatches
          .filter((m: Match) => (m.round ?? m.week * 2) === latestCompletedRound)
          .map((m: Match) => matchToResult(m));
        setLastRoundResults(lastMatches);

        const nextMatches = scheduledMatches
          .filter((m: Match) => (m.round ?? m.week * 2) === nextScheduledRound)
          .map((m: Match) => matchToResult(m));
        setNextRoundMatches(nextMatches);

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
  const userTeamColor = userTeam?.jerseyColorPrimary || '#00E479';

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
      {/* League hero */}
      <LeagueHeader
        leagueName={league?.name || 'League'}
        season={gameState?.season || 2024}
        matchweek={Math.max(1, currentRound)}
        totalMatchweeks={totalMatchweeks}
        viewingTeamName={
          userTeam && standings.find((s) => s.teamId === userTeam.id)?.teamName
            ? standings.find((s) => s.teamId === userTeam.id)!.teamName
            : undefined
        }
      />

      {/* KPI strip */}
      <LeagueKpiStrip
        standings={standings}
        userTeamId={userTeam?.id}
        userTeamColor={userTeamColor}
      />

      {/* Main grid: Matchweek + Standings / Tabs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5">
          <LeftColumn
            news={leagueNews}
            currentRound={currentRound}
            lastRoundResults={lastRoundResults}
            nextRoundMatches={nextRoundMatches}
            userTeamId={userTeam?.id}
            userTeamColor={userTeamColor}
          />
        </div>
        <div className="lg:col-span-7">
          <RightColumn
            standings={standings}
            userTeamId={userTeam?.id}
            allMatches={allMatches}
            locale={locale}
          />
        </div>
      </div>
    </div>
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