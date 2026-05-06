'use client';

import { useEffect, useState, Suspense, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, type MatchStatsRes, type MatchEvent } from '@/lib/api';
import { useMatchLive } from '@/hooks/useMatchLive';
import type { MatchEvent as WsMatchEvent } from '@/hooks/useMatchLive';
import { LiveCommentary } from '@/components/match/LiveCommentary';
import { MatchStatsPanel } from '@/components/match/MatchStatsPanel';
import { TacticalZonesPanel } from '@/components/match/TacticalZonesPanel';

function LiveMatchContent() {
  const params = useParams();
  const locale = (params.locale as string) || 'en';
  const matchId = params.id as string;

  const [stats, setStats] = useState<MatchStatsRes | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

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
      setStatsError('Failed to load stats');
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

  // When match ends, redirect to completed match page
  useEffect(() => {
    if (matchState?.isComplete && matchId) {
      window.location.href = `/${locale}/matches/${matchId}`;
    }
  }, [matchState?.isComplete, matchId, locale]);

  const homeTeamName = matchState?.homeTeam.name || 'Home';
  const awayTeamName = matchState?.awayTeam.name || 'Away';
  const currentMinute = matchState?.currentMinute || 0;

  // Map WebSocket events to API MatchEvent format
  const mapWsEventToApiEvent = (wsEvent: WsMatchEvent): MatchEvent => ({
    id: `${wsEvent.type}-${wsEvent.minute}-${wsEvent.playerId || ''}-${wsEvent.teamId || ''}`,
    matchId: wsEvent.matchId,
    minute: wsEvent.minute,
    second: 0,
    type: wsEvent.type,
    typeName: wsEvent.type,
    teamId: wsEvent.teamId,
    playerId: wsEvent.playerId,
    data: wsEvent.data,
    isHome: wsEvent.teamId ? wsEvent.teamId === matchState?.homeTeam.id : undefined,
  });

  // Filter events to only show up to current minute and map to API format
  const visibleEvents: MatchEvent[] = events
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
                  connectionStatus === 'connected' ? 'bg-primary' : 'bg-error'
                }`}
              />
              <p className="text-sm text-on-surface-variant font-headline">
                {connectionStatus === 'connected' ? 'Connected' : 'Connecting...'}
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

      {/* Live Badge */}
      {matchState && (
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary border border-primary/20 rounded-full">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="font-headline font-bold text-sm uppercase tracking-wider">
            LIVE • {currentMinute}&apos;
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
