'use client';

import { useEffect, useState, Suspense } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useMatchPage } from '@/hooks/useMatchPage';
import { MatchLiveView } from '@/components/match/MatchLiveView';
import { TacticalMatchDetail } from '@/components/match/TacticalMatchDetail';
import { TacticsEntryButton } from '@/components/tactics/shared/TacticsEntryButton';

function MatchPageContent() {
  const params = useParams();
  const locale = (params.locale as string) || 'en';
  const matchId = params.id as string;

  const [now, setNow] = useState(() => Date.now());

  // Keep the lock countdown current in the browser
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const {
    mode,
    connectionStatus,
    matchState,
    wsEvents,
    match,
    restEvents,
    stats,
    homeTactics,
    awayTactics,
    homeRoster,
    awayRoster,
    isLoading,
    error,
  } = useMatchPage({ matchId });

  // Derive whether we are reconnecting (vs. initial connect).
  // We treat a 'connecting' state after the first successful connect as
  // reconnecting — but since the hook re-runs per mount, we approximate
  // by checking: was there a matchState already populated?
  const isReconnecting =
    connectionStatus === 'connecting' && matchState !== null;

  if (isLoading) {
    return <MatchPageLoading />;
  }

  if (error || !match) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto w-full">
        <div className="bg-surface-container-low rounded-2xl p-12 text-center border border-error/20">
          <span className="material-symbols-outlined text-6xl text-error/50 mb-4 block">
            error
          </span>
          <p className="text-on-surface-variant text-lg font-medium mb-2">
            {error ?? 'Match not found'}
          </p>
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

  // ── LIVE MODE ────────────────────────────────────────────────────────────────
  if (mode === 'live') {
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
          autoRedirectOnEnd={false}
        />
      </div>
    );
  }

  // ── REPORT MODE ─────────────────────────────────────────────────────────────
  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto w-full">
      {/* Page header */}
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            href={`/${locale}/matches`}
            className="flex items-center justify-center w-10 h-10 bg-surface-container-low border border-outline-variant/30 text-on-surface-variant rounded-DEFAULT hover:bg-surface-container-high hover:text-on-surface transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          </Link>
          <div>
            <h1 className="font-headline text-2xl md:text-3xl font-black tracking-tight text-on-surface uppercase italic">
              Match Report
            </h1>
            <p className="text-sm text-on-surface-variant font-headline">
              {match.leagueId ? `Round ${match.round || '?'} • Season ${match.season}` : ''}
            </p>
          </div>
        </div>

        {/* Tactics entry — only for scheduled (or in-lock-window) matches */}
        {match.status !== 'in_progress' && match.status !== 'completed' && match.status !== 'cancelled' && (
          <TacticsEntryButton
            matchId={match.id}
            matchStatus={match.status}
            scheduledAt={match.scheduledAt}
            variant="full"
            locale={locale}
            now={now}
          />
        )}
      </header>

      <TacticalMatchDetail
        matchId={match.id}
        match={{
          homeScore: match.homeScore,
          awayScore: match.awayScore,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          status: match.status,
          scheduledAt: match.scheduledAt,
          homeForfeit: match.homeForfeit,
          awayForfeit: match.awayForfeit,
        }}
        events={restEvents}
        stats={stats!}
      />
    </div>
  );
}

function MatchPageLoading() {
  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto w-full">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-10 h-10 bg-surface-container-low rounded-DEFAULT animate-pulse" />
        <div className="space-y-2">
          <div className="h-8 w-48 bg-surface-container-low rounded animate-pulse" />
          <div className="h-4 w-32 bg-surface-container-low rounded animate-pulse" />
        </div>
      </div>
      <div className="h-[600px] bg-surface-container-low rounded-2xl animate-pulse" />
    </div>
  );
}

export default function MatchDetailPage() {
  return (
    <Suspense fallback={<MatchPageLoading />}>
      <MatchPageContent />
    </Suspense>
  );
}
