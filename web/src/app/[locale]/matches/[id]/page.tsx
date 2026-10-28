'use client';

import { AppIcon } from "@/components/icons/AppIcon";
import { useEffect, useState, Suspense } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api, MATCH_STATUS } from '@/lib/api';
import { useMatchPage } from '@/hooks/useMatchPage';
import { MatchLiveView } from '@/components/match/MatchLiveView';
import { TacticalMatchDetail } from '@/components/match/TacticalMatchDetail';
import { TacticsEntryButton } from '@/components/tactics/shared/TacticsEntryButton';

function MatchPageContent() {
  const params = useParams();
  const locale = (params.locale as string) || 'en';
  const matchId = params.id as string;
  const tBento = useTranslations('matches.bento.report');

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
  } = useMatchPage({
    matchId,
    // Same handshake identity as the standalone live route. Without it the
    // two URLs would behave differently the moment `join_match` becomes
    // auth-gated.
    token: typeof window !== 'undefined' ? localStorage.getItem('goalxi_token') : null,
  });

  // Derive whether we are reconnecting (vs. initial connect).
  // We treat a 'connecting' state after the first successful connect as
  // reconnecting — but since the hook re-runs per mount, we approximate
  // by checking: was there a matchState already populated?
  const isReconnecting =
    connectionStatus === 'connecting' && matchState !== null;

  if (isLoading) {
    return <MatchPageLoading />;
  }

  // Only a missing REST row is terminal. A WebSocket error must NOT blow the
  // page away: `MatchLiveView` owns its own connection panel, and replacing
  // the whole document hid the scoreboard and the pitch behind a
  // "Back to Matches" card during a transient blip. The report route never
  // touches the socket, so it never reaches this branch either.
  if (!match) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto w-full">
        <div className="bg-surface-container-low rounded-2xl p-12 text-center border border-error/20">
          <AppIcon name="error" className="text-6xl text-error/50 mb-4 block" />
          <p className="text-on-surface-variant text-lg font-medium mb-2">
            {error ?? 'Match not found'}
          </p>
          <Link
            href={`/${locale}/matches`}
            className="inline-flex items-center gap-2 text-primary hover:underline mt-4"
          >
            <AppIcon name="arrow_back" className="text-lg" />
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
            className="flex items-center justify-center w-10 h-10 bg-surface-container-low border border-outline-variant/30 text-on-surface-variant rounded-lg hover:bg-surface-container-high hover:text-on-surface transition-all"
            aria-label={tBento('back')}
          >
            <AppIcon name="arrow_back" className="text-[18px]" />
          </Link>
          <div>
            <h1 className="font-headline text-2xl md:text-3xl font-black tracking-tight text-on-surface uppercase italic">
              {tBento('title')}
            </h1>
            <p className="text-sm text-on-surface-variant font-headline">
              {match.leagueId
                ? tBento('round', { round: match.round ?? '?', season: match.season })
                : match.cupRound !== null && match.cupRound !== undefined
                  ? `${tBento('cupRound', { round: match.cupRound + 1 })} · ${tBento('cupSeason', { season: match.season })}`
                  : ''}
            </p>
          </div>
        </div>
        {/* "View bracket" link — only for cup matches. The
            cupId+cupRound are populated by GET /matches/:id (the
            list endpoint omits them). The link lands on the cup
            bracket page with a hash anchor that scrolls the
            relevant round into view. */}
        {match.type === 'cup' && match.cupId && (
          <Link
            href={`/${locale}/cup/${match.cupId}${match.cupRound !== null && match.cupRound !== undefined ? `#round-${match.cupRound}` : ''}`}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-full glass-panel border border-signal-amber/30 hover:border-signal-amber/60 hover:shadow-[0_0_18px_rgba(251,191,36,0.15)] transition-all"
          >
            <AppIcon name="workspace_premium" className="text-[18px] text-amber-300" />
            <span className="font-label text-[10px] font-black uppercase tracking-widest text-amber-300">
              {tBento('viewBracket')}
            </span>
          </Link>
        )}

        {/* Tactics entry — only for scheduled (or in-lock-window) matches */}
        {match.status !== MATCH_STATUS.IN_PROGRESS && match.status !== MATCH_STATUS.COMPLETED && match.status !== MATCH_STATUS.CANCELLED && (
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
          // Competition context for the info card. Without these the card can
          // only say "League" (no name / matchday) and can't compute the
          // attendance fill percentage, because `capacity` lives on the
          // joined stadium row rather than on the match itself. The ids are
          // what turn the title and venue into links.
          type: match.type ?? null,
          leagueId: match.leagueId ?? null,
          cupId: match.cupId ?? null,
          season: match.season ?? null,
          leagueName: match.leagueName ?? null,
          round: match.round ?? null,
          cupRound: match.cupRound ?? null,
          capacity: match.capacity ?? null,
          ticketRevenue: match.ticketRevenue ?? null,
          stadiumId: match.stadiumId ?? null,
          homeScore: match.homeScore,
          awayScore: match.awayScore,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          status: match.status,
          scheduledAt: match.scheduledAt,
          homeForfeit: match.homeForfeit,
          awayForfeit: match.awayForfeit,
          venue: match.venue,
          weather: match.weather ?? null,
          attendance: match.attendance ?? null,
        }}
        events={restEvents}
        stats={stats}
        now={now}
      />
    </div>
  );
}

function MatchPageLoading() {
  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto w-full">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-10 h-10 bg-surface-container-low rounded-lg animate-pulse" />
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
