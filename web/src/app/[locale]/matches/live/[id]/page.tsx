'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { useMatchPage } from '@/hooks/useMatchPage';
import { MatchLiveView } from '@/components/match/MatchLiveView';

function LiveMatchContent() {
  const params = useParams();
  const locale = (params.locale as string) || 'en';
  const matchId = params.id as string;

  const {
    connectionStatus,
    matchState,
    wsEvents,
    homeTactics,
    awayTactics,
    homeRoster,
    awayRoster,
    match,
    error,
  } = useMatchPage({
    matchId,
    token: typeof window !== 'undefined' ? localStorage.getItem('goalxi_token') : null,
    autoConnect: true,
  });

  const isReconnecting = connectionStatus === 'connecting' && matchState !== null;

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto w-full">
      <MatchLiveView
        matchId={matchId}
        locale={locale}
        isReconnecting={isReconnecting}
        connectionStatus={connectionStatus}
        matchState={matchState}
        wsEvents={wsEvents}
        homeTactics={homeTactics}
        awayTactics={awayTactics}
        homeRoster={homeRoster}
        awayRoster={awayRoster}
        match={match}
        error={error}
        autoRedirectOnEnd={true}
      />
    </div>
  );
}

function LiveMatchLoading() {
  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto w-full space-y-4">
      <div className="h-20 rounded-2xl bg-surface-container animate-pulse" />
      <div className="h-16 rounded-2xl bg-surface-container animate-pulse" />
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
        <div className="h-96 rounded-2xl bg-surface-container animate-pulse" />
        <div className="flex flex-col gap-3">
          <div className="h-64 rounded-2xl bg-surface-container animate-pulse" />
          <div className="h-24 rounded-2xl bg-surface-container animate-pulse" />
        </div>
      </div>
      <div className="h-48 rounded-2xl bg-surface-container animate-pulse" />
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
