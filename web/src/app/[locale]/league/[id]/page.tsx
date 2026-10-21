"use client";

import { AppIcon } from "@/components/icons/AppIcon";
import { useEffect, useMemo, useState, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import LeftColumn from "@/components/league/LeftColumn";
import RightColumn from "@/components/league/RightColumn";
import LeagueHeader from "@/components/league/LeagueHeader";
import { useAuth } from "@/contexts/AuthContext";
import { VisitTracker } from "@/components/visits/VisitTracker";
import { VisitorsPanel } from "@/components/visits/VisitorsPanel";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useGameStore } from "@/stores/gameStore";
import {
  api,
  type VisitList,
  MATCH_STATUS,
  type Standing,
  type Match,
  type LeagueNewsItem,
  type LeagueContext,
  type LeagueTeamStatusBoard,
} from "@/lib/api";
import type { LeagueZoneModel } from "@/lib/league-zones";
import {
  currentMatchweek,
  fixtureSeason,
  leagueFixtures,
  matchdayGroups,
  matchdayProgress,
} from "@/lib/league-fixtures";

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

function LeaguePage() {
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

  const [league, setLeague] = useState<{
    name: string;
    tier: number;
    maxTeams?: number;
    promotionSlots?: number;
    playoffSlots?: number;
    relegationSlots?: number;
  } | null>(null);
  /**
   * Pyramid position + neighbours, for the header's navigation strip. The
   * row's own `tier`/`tierDivision` are not enough: "level 4 of 4" and the
   * up/down links come from the whole pyramid, which the league row does not
   * know about.
   */
  const [leagueContext, setLeagueContext] = useState<LeagueContext | null>(
    null,
  );
  /**
   * Squad condition board. Fetched with the rest of the page rather than on
   * first tab open: it is one small indexed query, and a tab that has to spin
   * on click feels broken next to three that do not.
   */
  const [teamStatus, setTeamStatus] = useState<LeagueTeamStatusBoard | null>(
    null,
  );
  const [standings, setStandings] = useState<Standing[]>([]);
  // `week` is a MATCHWEEK (1..totalMatchweeks), not a matchday index.
  const [gameState, setGameState] = useState<{
    season: number;
    week: number;
    /** 1-based ordinal of the current matchday within the season. */
    current: number;
    /** Total matchdays in the season. */
    total: number;
    /** Matchdays already finished. */
    completed: number;
  } | null>(null);
  const [lastRoundResults, setLastRoundResults] = useState<MatchResult[]>([]);
  /**
   * Matchweek labels for the two result panels, read off the fixtures
   * themselves. The old code passed a single `currentRound` — a global
   * matchday index — and labelled the second panel `currentRound + 1`,
   * which is a fiction: the next matchday is usually in the SAME week as
   * the last one (three fixtures a week now), so "+1" pointed at a week
   * that had nothing to do with it.
   */
  const [lastMatchweek, setLastMatchweek] = useState<number | null>(null);
  const [nextMatchweek, setNextMatchweek] = useState<number | null>(null);
  const [nextRoundMatches, setNextRoundMatches] = useState<MatchResult[]>([]);
  const [allMatches, setAllMatches] = useState<Match[]>([]);
  const [leagueNews, setLeagueNews] = useState<(LeagueNewsItem & { timeAgo: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [visits, setVisits] = useState<VisitList | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [
          leagueData,
          standingsData,
          matchesData,
          newsData,
          contextData,
          teamStatusData,
          visitsData,
        ] = await Promise.all([
          api.leagues.getById(leagueId).catch(() => null),
          api.leagues.getStandings(leagueId).catch(() => []),
          api.matches
            .getByLeague(leagueId, {})
            .catch(() => ({ data: [] })),
          api.news
            .getLeagueNews(leagueId, { limit: 10 })
            .catch(() => ({ items: [] })),
          api.leagues.getContext(leagueId).catch(() => null),
          api.leagues.getTeamStatus(leagueId).catch(() => null),
          // Decoration: a Redis outage must not blank the league page.
          api.visits.list("league", leagueId).catch(() => null),
        ]);

        setLeague(leagueData);
        setStandings(standingsData);
        setLeagueContext(contextData);
        setTeamStatus(teamStatusData);
        setVisits(visitsData);

        // League fixtures only. The endpoint returns cup ties too, and a
        // cup row carries `week: 0` plus its own round number (0..11), so
        // mixing them in folds phantom cup rounds into the league ladder.
        const leagueMatches = leagueFixtures(
          matchesData.data || [],
          leagueId,
        );
        setAllMatches(leagueMatches);

        // Derived from the rows — see `lib/league-fixtures`. The previous
        // code computed a global matchday index as `m.round ?? m.week * 2`
        // and used it for sorting, grouping AND the "current week" field,
        // which is how this page came to render "Round 30 / 16" with a
        // permanently full progress bar.
        const { lastMatchday, nextMatchday } = matchdayGroups(leagueMatches, {
          completed: MATCH_STATUS.COMPLETED,
          upcoming: [MATCH_STATUS.SCHEDULED, MATCH_STATUS.TACTICS_LOCKED],
        });

        // Matchdays, not matchweeks: a matchweek holds three matchdays, so
        // the week count (10) is the wrong denominator for "已赛 1 / N".
        setGameState({
          season: fixtureSeason(leagueMatches) ?? 0,
          week: currentMatchweek(leagueMatches, MATCH_STATUS.COMPLETED),
          ...matchdayProgress(leagueMatches, MATCH_STATUS.COMPLETED),
        });

        setLastRoundResults(lastMatchday.map((m: Match) => matchToResult(m)));
        setNextRoundMatches(nextMatchday.map((m: Match) => matchToResult(m)));
        setLastMatchweek(lastMatchday[0]?.week ?? null);
        setNextMatchweek(nextMatchday[0]?.week ?? null);

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

  /**
   * The standings' promotion / relegation cut-offs. `tierCount` comes from
   * the context endpoint, so the top flight can be told apart from a middle
   * division — without it, position 1 would be painted as a promotion even
   * where there is nothing to be promoted to.
   */
  const zoneModel = useMemo<LeagueZoneModel | null>(() => {
    if (!league) return null;
    return {
      tier: league.tier,
      tierCount: leagueContext?.tierCount ?? league.tier,
      maxTeams: league.maxTeams ?? 16,
      promotionSlots: league.promotionSlots ?? 1,
      playoffSlots: league.playoffSlots ?? 4,
      relegationSlots: league.relegationSlots ?? 4,
    };
  }, [league, leagueContext]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <AppIcon name="progress_activity" className="text-4xl text-primary animate-spin" />
      </div>
    );
  }

  // From the fixture list, not a constant. This was a hardcoded 16 while
  // the page also passed a global matchday index (up to 30) as the current
  // value, so it rendered "Round 30 / 16" and a 100% progress bar.
  const matchdayCount = gameState?.total ?? 0;
  const matchdaysPlayed = gameState?.completed ?? 0;

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
      {/* League hero */}
      <LeagueHeader
        leagueName={league?.name || 'League'}
        season={gameState?.season || 0}
        matchweek={Math.max(1, gameState?.current ?? 1)}
        totalMatchweeks={matchdayCount}
        matchdaysPlayed={matchdaysPlayed}
        viewingTeamName={
          userTeam && standings.find((s) => s.teamId === userTeam.id)?.teamName
            ? standings.find((s) => s.teamId === userTeam.id)!.teamName
            : undefined
        }
        locale={locale}
        leagueId={leagueId}
        context={leagueContext}
      />

      {/* Main grid: Matchweek + Standings / Tabs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="flex flex-col gap-6 lg:col-span-5">
          <LeftColumn
            news={leagueNews}
            lastMatchweek={lastMatchweek}
            nextMatchweek={nextMatchweek}
            lastRoundResults={lastRoundResults}
            nextRoundMatches={nextRoundMatches}
            userTeamId={userTeam?.id}
            locale={locale}
          />
          <GlassPanel>
            <VisitorsPanel visits={visits} />
          </GlassPanel>
        </div>
        <div className="lg:col-span-7">
          <RightColumn
            standings={standings}
            userTeamId={userTeam?.id}
            allMatches={allMatches}
            locale={locale}
            zones={zoneModel}
            teamStatus={teamStatus}
          />
        </div>
      </div>

      <VisitTracker subjectType="league" subjectId={leagueId} />
    </div>
  );
}

function LeaguePageLoading() {
  return (
    <div className="flex items-center justify-center h-full">
      <AppIcon name="progress_activity" className="text-4xl text-primary animate-spin" />
    </div>
  );
}

export default function LeaguePageWrapper() {
  return (
    <Suspense fallback={null}>
      <LeaguePage />
    </Suspense>
  );
}
