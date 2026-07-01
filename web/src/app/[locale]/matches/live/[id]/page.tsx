'use client';

import { useEffect, useState, Suspense, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, type MatchStatsRes, type MatchEvent as ApiMatchEvent } from '@/lib/api';
import { useMatchLive, type MatchEvent } from '@/hooks/useMatchLive';
import { LiveCommentary } from '@/components/match/LiveCommentary';
import { MatchStatsPanel } from '@/components/match/MatchStatsPanel';
import { TacticalZonesPanel } from '@/components/match/TacticalZonesPanel';

const MATCH_END_REDIRECT_DELAY_MS = 2500;

function LiveMatchContent() {
  const params = useParams();
  const router = useRouter();
  const locale = (params.locale as string) || 'en';
  const matchId = params.id as string;

  const [stats, setStats] = useState<MatchStatsRes | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  // True once `match_end` fires; renders the "Match ended" overlay for
  // MATCH_END_REDIRECT_DELAY_MS, then router.push fires.
  const [matchEnded, setMatchEnded] = useState(false);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    connectionStatus,
    matchState,
    events,
    error: wsError,
  } = useMatchLive({
    matchId,
    token: typeof window !== 'undefined' ? localStorage.getItem('goalxi_token') : null,
    autoConnect: true,
  });

  // Fetch stats
  const fetchStats = useCallback(async () => {
    if (!matchId) return;
    try {
      const statsData = await api.matches.getStats(matchId);
      setStats(statsData);
      setStatsError(null);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
      setStatsError('Stats may be stale — retrying…');
    }
  }, [matchId]);

  // Initial stats fetch
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Poll stats every 5 seconds while live
  useEffect(() => {
    if (!matchState?.isComplete) {
      const interval = setInterval(fetchStats, 5000);
      return () => clearInterval(interval);
    }
  }, [fetchStats, matchState?.isComplete]);

  // Match end → show an "ended" overlay for a beat so the user understands
  // what just happened, then router.push to the match report. Previously this
  // used `window.location.href` which is a full reload — it dropped WS state,
  // scroll position, and felt jarring. The 2.5s delay gives the page time to
  // render the full-time state visibly.
  useEffect(() => {
    if (matchState?.isComplete && !matchEnded) {
      setMatchEnded(true);
      redirectTimer.current = setTimeout(() => {
        router.push(`/${locale}/matches/${matchId}`);
      }, MATCH_END_REDIRECT_DELAY_MS);
    }

    return () => {
      if (redirectTimer.current) {
        clearTimeout(redirectTimer.current);
        redirectTimer.current = null;
      }
    };
  }, [matchState?.isComplete, matchEnded, matchId, locale, router]);

  const homeTeamName = matchState?.homeTeam.name || 'Home';
  const awayTeamName = matchState?.awayTeam.name || 'Away';
  const currentMinute = matchState?.currentMinute || 0;
  const isConnected = connectionStatus === 'connected';

  // Map WebSocket events to the API/rest shape. Prefer backend-supplied fields
  // (entity UUID, isHome) — they were added in Phase 1 specifically so the
  // client doesn't have to guess from `teamId`. The composite `id` fallback
  // remains in case a pre-Phase-1 gateway is still deployed during the
  // rollout window; the dedupe key in useMatchLive shares the same tuple, so
  // formatter hashes and dedupe stay in sync.
  const mapWsEventToApiEvent = (wsEvent: MatchEvent): ApiMatchEvent => ({
    id:
      wsEvent.id ??
      `${wsEvent.type}-${wsEvent.minute}-${wsEvent.playerId || ''}-${wsEvent.teamId || ''}`,
    matchId: wsEvent.matchId,
    minute: wsEvent.minute,
    // Simulator doesn't persist sub-minute data yet — second stays 0 until a
    // simulator-side change lands (out of scope for this fix).
    second: wsEvent.second ?? 0,
    type: wsEvent.type,
    typeName: wsEvent.typeName ?? wsEvent.type,
    teamId: wsEvent.teamId,
    playerId: wsEvent.playerId,
    data: wsEvent.data,
    isHome: wsEvent.isHome,
  });

  // Filter events to only show up to current minute and map to API format
  const visibleEvents: ApiMatchEvent[] = events
    .filter((e) => e.minute <= currentMinute)
    .map(mapWsEventToApiEvent);

  // If not connected yet and no match state
  if (connectionStatus === 'disconnected' && !matchState && !wsError) {
    return <LiveMatchLoading />;
  }

  // Connection error state
  if (wsError && connectionStatus === 'disconnected') {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto w-full">
        <div className="bg-surface-container-low rounded-2xl p-12 text-center border border-error/20">
          <span className="material-symbols-outlined text-6xl text-error/50 mb-4 block">
            wifi_off
          </span>
          <p className="text-on-surface-variant text-lg font-medium mb-2">Connection lost</p>
          <p className="text-on-surface-variant/70 text-sm mb-4">{wsError}</p>
          <Link
            href={`/${locale}/matches`}
            className="inline-flex items-center gap-2 text-primary hover:underline mt-4"
          >
            <span className="material-symbols-outlined text-lg">arrow_back</span>
            Back to Matches
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6">
      {/* Match-end overlay — shown briefly so the user understands why the
          page is about to leave live mode, instead of jumping the URL. */}
      {matchEnded && matchState && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl bg-amber-500/10 border border-amber-500/40 px-5 py-4 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-amber-500">sports_score</span>
            <div>
              <p className="font-headline font-bold text-amber-500 uppercase tracking-wider text-sm">
                Full Time — Match Ended
              </p>
              <p className="text-on-surface-variant text-sm mt-0.5">
                {matchState.homeTeam.name} {matchState.homeScore} – {matchState.awayScore}{' '}
                {matchState.awayTeam.name}
              </p>
            </div>
          </div>
          <p className="text-xs text-on-surface-variant font-headline uppercase tracking-wider">
            Redirecting…
          </p>
        </div>
      )}

      {/* Page Header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href={`/${locale}/matches`}
            className="flex items-center justify-center w-10 h-10 bg-surface-container-low border border-outline-variant/30 text-on-surface-variant rounded-DEFAULT hover:bg-surface-container-high hover:text-on-surface transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          </Link>
          <div>
            <h1 className="font-headline text-2xl md:text-3xl font-black tracking-tight text-on-surface uppercase italic">
              Live Match
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className={`w-2 h-2 rounded-full animate-pulse ${
                  isConnected ? 'bg-primary' : 'bg-amber-500'
                }`}
              />
              <p className="text-sm text-on-surface-variant font-headline">
                {isConnected
                  ? 'Connected'
                  : connectionStatus === 'connecting'
                    ? 'Connecting…'
                    : 'Reconnecting…'}
              </p>
            </div>
          </div>
        </div>

        {/* Score Display */}
        {matchState && (
          <div className="flex items-center gap-4 bg-surface-container-low border border-outline-variant/30 rounded-DEFAULT px-5 py-3">
            <div className="text-center">
              <div className="text-2xl font-black font-headline text-on-surface">
                {matchState.homeTeam.name}
              </div>
              <div className="text-xs text-on-surface-variant font-headline">Home</div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-headline text-4xl font-black text-primary">
                {matchState.homeScore}
              </span>
              <span className="font-headline text-2xl text-on-surface-variant">-</span>
              <span className="font-headline text-4xl font-black text-secondary">
                {matchState.awayScore}
              </span>
            </div>
            <div className="text-center">
              <div className="text-2xl font-black font-headline text-on-surface">
                {matchState.awayTeam.name}
              </div>
              <div className="text-xs text-on-surface-variant font-headline">Away</div>
            </div>
          </div>
        )}
      </header>

      {/* Live Badge — dims when the socket is not currently connected so the
          user doesn't mistake a stale display for a live state. */}
      {matchState && (
        <div
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${
            isConnected
              ? 'bg-primary/10 text-primary border border-primary/20'
              : 'bg-amber-500/10 text-amber-500 border border-amber-500/30'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full animate-pulse ${
              isConnected ? 'bg-primary' : 'bg-amber-500'
            }`}
          />
          <span className="font-headline font-bold text-sm uppercase tracking-wider">
            {isConnected
              ? `Live • ${currentMinute}'`
              : `Offline • last seen ${currentMinute}'`}
          </span>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left Column: Live Commentary */}
        <div className="lg:col-span-3 space-y-6">
          <LiveCommentary
            events={visibleEvents}
            currentMinute={currentMinute}
            homeTeamName={homeTeamName}
            awayTeamName={awayTeamName}
          />
        </div>

        {/* Right Column: Stats + Tactical */}
        <div className="lg:col-span-2 space-y-6">
          {statsError && (
            <div
              role="status"
              aria-live="polite"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/30 text-xs font-headline uppercase tracking-wider"
            >
              <span className="material-symbols-outlined text-sm">sync_problem</span>
              {statsError}
            </div>
          )}
          {stats ? (
            <>
              <MatchStatsPanel
                stats={stats}
                homeTeamName={homeTeamName}
                awayTeamName={awayTeamName}
              />
              <TacticalZonesPanel
                stats={stats}
                homeTeamName={homeTeamName}
                awayTeamName={awayTeamName}
              />
            </>
          ) : (
            <>
              <LiveStatsPanelSkeleton />
              <LiveTacticalPanelSkeleton />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function LiveStatsPanelSkeleton() {
  return (
    <div className="rounded-DEFAULT border border-surface-container-high bg-surface-container-low overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-container-high">
        <div className="h-4 w-32 bg-surface-container animate-pulse rounded" />
      </div>
      <div className="px-4 py-4 space-y-4">
        <div className="h-20 bg-surface-container animate-pulse rounded-lg" />
        <div className="h-8 bg-surface-container animate-pulse rounded" />
        <div className="h-8 bg-surface-container animate-pulse rounded" />
        <div className="h-8 bg-surface-container animate-pulse rounded" />
        <div className="h-8 bg-surface-container animate-pulse rounded" />
      </div>
    </div>
  );
}

function LiveTacticalPanelSkeleton() {
  return (
    <div className="rounded-DEFAULT border border-surface-container-high bg-surface-container-low overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-container-high">
        <div className="h-4 w-32 bg-surface-container animate-pulse rounded" />
      </div>
      <div className="px-4 py-4">
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-16 bg-surface-container animate-pulse rounded-lg" />
              <div className="h-16 bg-surface-container animate-pulse rounded-lg" />
              <div className="h-16 bg-surface-container animate-pulse rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LiveMatchLoading() {
  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 bg-surface-container-low rounded-DEFAULT animate-pulse" />
        <div className="space-y-2">
          <div className="h-8 w-48 bg-surface-container-low rounded animate-pulse" />
          <div className="h-4 w-32 bg-surface-container-low rounded animate-pulse" />
        </div>
      </div>
      <div className="h-12 w-64 bg-surface-container-low rounded-full animate-pulse" />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <div className="h-96 bg-surface-container-low rounded-DEFAULT animate-pulse" />
        </div>
        <div className="lg:col-span-2 space-y-6">
          <div className="h-56 bg-surface-container-low rounded-DEFAULT animate-pulse" />
          <div className="h-48 bg-surface-container-low rounded-DEFAULT animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export default function LiveMatchPage() {
  return (
    <Suspense fallback={<LiveMatchLoading />}>
      <LiveMatchContent />
    </Suspense>
  );
}
