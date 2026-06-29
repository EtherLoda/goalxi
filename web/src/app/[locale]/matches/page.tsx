"use client";

import { useEffect, useState, Suspense } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { api, type Match, type Team } from "@/lib/api";
import Link from "next/link";
import { clsx } from "clsx";
import { useGameStore } from "@/stores/gameStore";
import { MatchdayHero } from "@/components/match/MatchdayHero";
import { FixtureTicket } from "@/components/match/FixtureTicket";
import { FormChipStrip, type FormResult } from "@/components/match/FormChipStrip";

interface MatchWithResult extends Match {
  result?: "W" | "D" | "L" | null;
  isUserHome?: boolean;
}

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

function MatchesPageContent() {
  const { team: myTeam } = useAuth();
  const params = useParams();
  const searchParams = useSearchParams();
  const locale = (params.locale as string) || "en";
  const t = useTranslations('matches');
  const { viewTeamId, teamId } = useGameStore();

  // Sync URL params to Zustand on mount. Read the store value via getState()
  // so we don't have to subscribe to it (and so we don't re-sync on store
  // changes that originate from this effect itself).
  useEffect(() => {
    const urlTeamId = searchParams.get("team");
    if (!urlTeamId) return;
    if (urlTeamId !== useGameStore.getState().viewTeamId) {
      useGameStore.getState().setViewTeam(urlTeamId);
    }
  }, [searchParams]);

  const myTeamFlag = viewTeamId === null || viewTeamId === teamId;

  const [viewedTeam, setViewedTeam] = useState<Team | null>(null);
  const currentTeam = myTeamFlag ? myTeam : viewedTeam;

  // Fetch viewed team info when teamId changes
  useEffect(() => {
    if (myTeamFlag) {
      setViewedTeam(null);
      return;
    }
    if (viewTeamId) {
      api.teams.getById(viewTeamId).then(setViewedTeam).catch(() => setViewedTeam(null));
    }
  }, [viewTeamId, myTeamFlag]);

  const [allUpcomingMatches, setAllUpcomingMatches] = useState<MatchWithResult[]>([]);
  const [recentMatches, setRecentMatches] = useState<MatchWithResult[]>([]);
  const [upcomingMatches, setUpcomingMatches] = useState<MatchWithResult[]>([]);
  const [liveMatch, setLiveMatch] = useState<MatchWithResult | null>(null);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [leagueName, setLeagueName] = useState<string>("");
  // Live `now` so the tactics entry button can re-render the lock countdown
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!currentTeam?.id || !currentTeam?.leagueId) return;

    const fetchMatches = async () => {
      setIsLoading(true);
      try {
        const [completedData, upcomingData, liveData, leagueData] = await Promise.all([
          api.matches.getByTeam(currentTeam.id, { status: "completed" }),
          api.matches.getByTeam(currentTeam.id, { status: "scheduled" }),
          api.matches.getByTeam(currentTeam.id, { status: "in_progress" }),
          api.leagues.getById(currentTeam.leagueId),
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
            const isHome = match.homeTeamId === currentTeam.id;
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
            isUserHome: match.homeTeamId === currentTeam.id,
          }));

        // Filter to next month for display
        const upcomingThisMonth = processedUpcoming.filter(
          (m: MatchWithResult) => new Date(m.scheduledAt).getTime() <= oneMonthLater
        );

        // Process live match
        const processedLive = liveData?.data?.[0]
          ? { ...liveData.data[0], isUserHome: liveData.data[0].homeTeamId === currentTeam.id }
          : null;

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
  }, [currentTeam?.id, currentTeam?.leagueId]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const getOpponentName = (match: MatchWithResult) => {
    return match.homeTeamId === currentTeam?.id ? match.awayTeam?.name : match.homeTeam?.name;
  };

  const isHomeMatch = (match: MatchWithResult) => match.homeTeamId === currentTeam?.id;

  // Get latest completed match
  const latestCompleted = recentMatches[0] || null;
  // Get next upcoming match
  const nextUpcoming = upcomingMatches[0] || null;
  // Live match takes priority over next upcoming
  const featuredRight = liveMatch || nextUpcoming;

  // Recent form chips (last 5 results, oldest → newest)
  const formResults: FormResult[] = recentMatches
    .slice()
    .reverse()
    .map((m) => m.result ?? 'pending');

  // Mini KPIs for the header strip
  const wins = recentMatches.filter((m) => m.result === 'W').length;
  const draws = recentMatches.filter((m) => m.result === 'D').length;
  const losses = recentMatches.filter((m) => m.result === 'L').length;

  if (isLoading) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto w-full">
        <div className="animate-pulse space-y-6">
          <div className="h-12 w-64 bg-surface-container rounded-lg" />
          <div className="h-[420px] bg-surface-container rounded-3xl" />
        </div>
      </div>
    );
  }

  const showHero = latestCompleted || featuredRight;

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto w-full">
      {/* Page Header */}
      <header className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div>
            <span className="font-label text-[10px] font-black uppercase tracking-[0.3em] text-primary">
              {leagueName || t('title')}
            </span>
            <h1 className="font-headline text-4xl md:text-5xl font-black tracking-tighter text-on-surface uppercase italic mt-1">
              {t('title')}
            </h1>
          </div>
          <Link
            href={`/${locale}/matches/archive`}
            className="group inline-flex items-center gap-2 h-10 px-4 rounded-full glass-panel hover:border-white/20 hover:shadow-[0_0_18px_rgba(0,228,121,0.15)] transition-all"
          >
            <span className="material-symbols-outlined text-[18px] text-primary">inventory_2</span>
            <span className="font-headline text-xs font-black uppercase tracking-[0.2em] text-on-surface">
              {t('archive')}
            </span>
            <span className="material-symbols-outlined text-base text-on-surface-variant opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all">
              arrow_forward
            </span>
          </Link>
        </div>

        {/* KPI strip — recent form + record */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Recent form */}
          <div className="glass-panel rounded-2xl p-4 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="font-label text-[9px] uppercase tracking-[0.25em] text-primary font-black mb-2">
                {t('kpi.recentForm')}
              </p>
              <FormChipStrip results={formResults} />
            </div>
          </div>
          {/* W / D / L record */}
          <div className="glass-panel rounded-2xl p-4 grid grid-cols-3 divide-x divide-white/5">
            <div className="px-2 text-center">
              <p className="font-label text-[9px] uppercase tracking-[0.25em] text-primary font-black">
                W
              </p>
              <p className="font-headline text-2xl font-black text-on-surface">{wins}</p>
            </div>
            <div className="px-2 text-center">
              <p className="font-label text-[9px] uppercase tracking-[0.25em] text-on-surface-variant font-black">
                D
              </p>
              <p className="font-headline text-2xl font-black text-on-surface">{draws}</p>
            </div>
            <div className="px-2 text-center">
              <p className="font-label text-[9px] uppercase tracking-[0.25em] text-error font-black">
                L
              </p>
              <p className="font-headline text-2xl font-black text-on-surface">{losses}</p>
            </div>
          </div>
          {/* Upcoming count + next opponent */}
          <div className="glass-panel rounded-2xl p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-primary">event</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-label text-[9px] uppercase tracking-[0.25em] text-primary font-black">
                {t('kpi.fixtures', { count: allUpcomingMatches.length })}
              </p>
              <p className="font-headline text-sm font-bold text-on-surface truncate">
                {t('kpi.nextOpponent')}: {nextUpcoming ? getOpponentName(nextUpcoming) : t('kpi.noMatchScheduled')}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Stadium hero — replaces the two-up featured cards */}
      {showHero && (
        <MatchdayHero
          latestCompleted={latestCompleted}
          featuredRight={featuredRight}
          currentTeam={currentTeam}
          leagueName={leagueName}
          locale={locale}
          now={now}
        />
      )}

      {/* Recent & Upcoming Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Recent Results List */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          <h2 className="font-headline text-xs font-black uppercase tracking-[0.25em] text-primary flex items-center gap-2 px-1">
            <span className="material-symbols-outlined text-base">history</span>
            {t('sections.recentResults')}
          </h2>

          {recentMatches.length === 0 ? (
            <div className="glass-panel rounded-2xl p-10 text-center">
              <span className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-2 block">
                history
              </span>
              <p className="text-on-surface-variant text-sm">{t('empty.noRecent')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentMatches.map((match) => {
                const userScore = match.isUserHome ? match.homeScore : match.awayScore;
                const opponentScore = match.isUserHome ? match.awayScore : match.homeScore;
                return (
                  <Link
                    key={match.id}
                    href={`/${locale}/matches/${match.id}`}
                    className="group flex items-center gap-3 p-3 glass-panel rounded-2xl hover:border-white/15 hover:shadow-[0_0_20px_rgba(0,228,121,0.12)] transition-all"
                  >
                    {/* Result indicator — glowing chip */}
                    <div
                      className={clsx(
                        'w-10 h-10 rounded-xl flex items-center justify-center font-headline font-black text-xs border shrink-0',
                        match.result === 'W' &&
                          'bg-primary text-on-primary border-primary shadow-[0_0_14px_rgba(0,228,121,0.45)]',
                        match.result === 'D' &&
                          'bg-white/5 text-on-surface-variant border-white/10',
                        match.result === 'L' &&
                          'bg-error/10 text-error border-error/30',
                        (!match.result) &&
                          'bg-white/5 text-on-surface-variant border-white/10',
                      )}
                    >
                      {match.result ?? '—'}
                    </div>
                    {/* Middle: date + teams */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-0.5">
                        <span>{formatDate(match.scheduledAt)}</span>
                        <span className="text-on-surface-variant/40">•</span>
                        <span
                          className={clsx(
                            'font-black',
                            isHomeMatch(match) ? 'text-primary' : 'text-on-surface-variant',
                          )}
                        >
                          {isHomeMatch(match) ? 'H' : 'A'}
                        </span>
                      </div>
                      <div className="font-headline text-sm font-bold text-on-surface truncate">
                        {match.homeTeam?.name} - {match.awayTeam?.name}
                      </div>
                    </div>
                    {/* Right: score */}
                    <div className="text-right shrink-0">
                      <p
                        className={clsx(
                          'font-headline text-lg font-black',
                          match.result === 'W' && 'text-primary',
                          match.result === 'L' && 'text-error',
                          match.result === 'D' && 'text-on-surface',
                          (!match.result) && 'text-on-surface-variant',
                        )}
                      >
                        {userScore ?? '-'} - {opponentScore ?? '-'}
                      </p>
                      <span className="material-symbols-outlined text-on-surface-variant/40 text-base group-hover:text-primary group-hover:translate-x-0.5 transition-all">
                        chevron_right
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Upcoming Fixtures — stadium "departure board" */}
        <div className="lg:col-span-7 flex flex-col gap-3">
          <h2 className="font-headline text-xs font-black uppercase tracking-[0.25em] text-primary flex items-center gap-2 px-1">
            <span className="material-symbols-outlined text-base">event</span>
            {t('sections.upcomingFixtures')}
            {allUpcomingMatches.length > upcomingMatches.length && (
              <button
                onClick={() => setShowAllUpcoming(!showAllUpcoming)}
                className="ml-auto flex items-center gap-1 text-[10px] font-label font-black uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors"
              >
                {showAllUpcoming ? (
                  <>
                    {t('showLess')}
                    <span className="material-symbols-outlined text-base">expand_less</span>
                  </>
                ) : (
                  <>
                    {t('showAll', { count: allUpcomingMatches.length })}
                    <span className="material-symbols-outlined text-base">expand_more</span>
                  </>
                )}
              </button>
            )}
          </h2>

          {upcomingMatches.length === 0 ? (
            <div className="glass-panel rounded-2xl p-10 text-center">
              <span className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-2 block">
                event_busy
              </span>
              <p className="text-on-surface-variant text-sm">{t('empty.noUpcoming')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(showAllUpcoming ? allUpcomingMatches : upcomingMatches).map((match) => (
                <FixtureTicket
                  key={match.id}
                  match={match}
                  isHome={isHomeMatch(match)}
                  currentTeam={currentTeam}
                  leagueName={leagueName}
                  locale={locale}
                  now={now}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MatchesPage() {
  return (
    <Suspense fallback={<MatchesPageLoading />}>
      <MatchesPageContent />
    </Suspense>
  );
}

function MatchesPageLoading() {
  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto w-full">
      <div className="animate-pulse space-y-6">
        <div className="h-12 w-64 bg-surface-container rounded-lg" />
        <div className="h-[420px] bg-surface-container rounded-3xl" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-2">
            <div className="h-6 w-40 bg-surface-container rounded mb-3" />
            <div className="h-16 bg-surface-container rounded-2xl" />
            <div className="h-16 bg-surface-container rounded-2xl" />
            <div className="h-16 bg-surface-container rounded-2xl" />
          </div>
          <div className="lg:col-span-7 space-y-2">
            <div className="h-6 w-40 bg-surface-container rounded mb-3" />
            <div className="h-20 bg-surface-container rounded-2xl" />
            <div className="h-20 bg-surface-container rounded-2xl" />
            <div className="h-20 bg-surface-container rounded-2xl" />
          </div>
        </div>
      </div>
    </div>
  );
}