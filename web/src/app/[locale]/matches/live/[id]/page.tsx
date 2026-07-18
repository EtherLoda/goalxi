'use client';

import { useEffect, useMemo, useState, Suspense, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  api,
  type MatchEvent as ApiMatchEvent,
  type Player,
  type Tactics,
} from '@/lib/api';
import { useMatchLive, type MatchEvent } from '@/hooks/useMatchLive';
import { LiveCommentary } from '@/components/match/LiveCommentary';
import { MatchPitch } from '@/components/match/MatchPitch';
import { MatchTimeline } from '@/components/match/MatchTimeline';
import { MatchBentoLayout } from '@/components/match/bento/MatchBentoLayout';
import { MatchScoreHero } from '@/components/match/bento/MatchScoreHero';
import { extractSnapshots } from '@/components/match/snapshot-stats';

const MATCH_END_REDIRECT_DELAY_MS = 2500;

function LiveMatchContent() {
  const params = useParams();
  const router = useRouter();
  const locale = (params.locale as string) || 'en';
  const matchId = params.id as string;
  const t = useTranslations('matches.live');

  // Lane-strength data (stats) used to be polled every 5s and rendered
  // in a sidebar bento. The sidebar was removed in favour of a pitch-
  // level stats-mode toggle (PitchStatsOverlay), which reads the same
  // `ls` lane strengths already carried in the WebSocket snapshots —
  // so the dedicated REST fetch is no longer needed. Leaving the
  // existing matchEnded/match-end redirect machinery below untouched.

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

  // Match end → show an "ended" overlay for a beat so the user understands
  // what just happened, then router.push to the match report. The 2.5s delay
  // gives the page time to render the full-time state visibly.
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

  // Pitch stats overlay toggle — when true, the pitch swaps player
  // markers for the 3×3 zone grid (PitchStatsOverlay). Default off;
  // local component state so the toggle survives snapshot scrub but
  // resets on a hard refresh (intentional — no URL param).
  const [statsMode, setStatsMode] = useState(false);

  // Pitch + zone panel data — fetched via REST because the WS stream
  // doesn't carry tactics or roster details (only the simulator's per-
  // match report does). Same fetch pattern as TacticalMatchDetail on
  // the match report page; if the WS ever starts pushing these, swap
  // out the REST call without changing the consumers.
  const homeTeamId = matchState?.homeTeam?.id;
  const awayTeamId = matchState?.awayTeam?.id;
  const [homeTactics, setHomeTactics] = useState<Tactics | null>(null);
  const [awayTactics, setAwayTactics] = useState<Tactics | null>(null);
  const [homeRoster, setHomeRoster] = useState<Player[]>([]);
  const [awayRoster, setAwayRoster] = useState<Player[]>([]);

  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;
    (async () => {
      try {
        const tacticsPromise = api.matches.getTactics(matchId);
        const homeRosterPromise = homeTeamId
          ? api.players.getByTeam(homeTeamId)
          : Promise.resolve({ items: [] as Player[], meta: {} });
        const awayRosterPromise = awayTeamId
          ? api.players.getByTeam(awayTeamId)
          : Promise.resolve({ items: [] as Player[], meta: {} });
        const [tactics, homeR, awayR] = await Promise.all([
          tacticsPromise,
          homeRosterPromise,
          awayRosterPromise,
        ]);
        if (cancelled) return;
        setHomeTactics(tactics.homeTactics);
        setAwayTactics(tactics.awayTactics);
        setHomeRoster(homeR.items ?? []);
        setAwayRoster(awayR.items ?? []);
      } catch {
        // Swallow — the pitch renders an empty grid + the zone panel
        // shows "No snapshot data yet" if the snapshot list is also
        // empty. Don't block the live commentary on REST hiccups.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [matchId, homeTeamId, awayTeamId]);

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

  // Snapshots drive the scrubber + zone panel. WS events accumulate
  // over the course of the match, so this list grows as the live
  // simulation runs. The active index defaults to the latest
  // snapshot — pre-scrubber behavior — and the panel's onChange
  // commits a new index on mouseup / touchend.
  //
  // We extract from `visibleEvents` (filtered to `minute <= currentMinute`
  // by the LiveCommentary pipeline above) so the scrubber never shows
  // snapshots from minutes the user hasn't "watched" yet. The conversion
  // through `mapWsEventToApiEvent` is also where the optional WS fields
  // (`second`, `eventScheduledTime`, `playerName`) get coerced to the
  // shape `extractSnapshots` expects.
  const snapshots = useMemo(
    () => extractSnapshots(visibleEvents),
    [visibleEvents],
  );
  const [activeSnapshotIndex, setActiveSnapshotIndex] = useState<number>(
    () => Math.max(0, snapshots.length - 1),
  );
  // Live mode — every new WS snapshot snaps the scrubber to "now"
  // unless the user is actively viewing an earlier moment. The match
  // report page skips this effect because once a match is over, no
  // new snapshots arrive.
  useEffect(() => {
    setActiveSnapshotIndex((idx) => Math.max(0, snapshots.length - 1));
  }, [snapshots.length]);
  const activeSnapshot = snapshots[activeSnapshotIndex] ?? null;

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
          <p className="text-on-surface-variant text-lg font-medium mb-2">{t('connectionLost')}</p>
          <p className="text-on-surface-variant/70 text-sm mb-4">{wsError}</p>
          <Link
            href={`/${locale}/matches`}
            className="inline-flex items-center gap-2 text-primary hover:underline mt-4"
          >
            <span className="material-symbols-outlined text-lg">arrow_back</span>
            {t('backToMatches')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto w-full space-y-6">
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
                {t('fullTimeTitle')}
              </p>
              <p className="text-on-surface-variant text-sm mt-0.5">
                {t('fullTimeScore', {
                  home: matchState.homeTeam.name,
                  homeScore: matchState.homeScore,
                  awayScore: matchState.awayScore,
                  away: matchState.awayTeam.name,
                })}
              </p>
            </div>
          </div>
          <p className="text-xs text-on-surface-variant font-headline uppercase tracking-wider">
            {t('redirecting')}
          </p>
        </div>
      )}

      {/* Bento layout — Score / Timeline / Pitch (full-width) / Commentary.
          Sidebar removed: zone data + xG live on the pitch itself in
          stats mode (toggle above the pitch). */}
      <MatchBentoLayout
        scoreHero={
          <MatchScoreHero
            locale={locale}
            matchId={matchId}
            homeTeamName={homeTeamName}
            awayTeamName={awayTeamName}
            homeScore={matchState?.homeScore ?? 0}
            awayScore={matchState?.awayScore ?? 0}
            currentMinute={currentMinute}
            isComplete={matchState?.isComplete ?? false}
            isConnected={isConnected}
          />
        }
        timeline={
          <MatchTimeline
            events={visibleEvents}
            snapshots={snapshots}
            currentMinute={currentMinute}
            activeIndex={activeSnapshotIndex}
            onChange={setActiveSnapshotIndex}
          />
        }
        pitch={
          <div className="relative">
            {/* Stats toggle chip — sits OUTSIDE the pitch surface in
                document flow so it can never be clipped by overflow-hidden.
                The chip is positioned just above the pitch's top-right
                corner; the pitch itself is positioned relative so the
                absolute-positioned `PitchStatsOverlay` (rendered inside
                MatchPitch) still anchors correctly. */}
            <div className="flex justify-end mb-2">
              <button
                type="button"
                onClick={() => setStatsMode((v) => !v)}
                aria-pressed={statsMode}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-headline font-bold text-sm transition-all ring-2 shadow-lg ${
                  statsMode
                    ? 'bg-primary text-on-primary ring-primary shadow-[0_0_16px_rgba(0,228,121,0.45)]'
                    : 'bg-surface-container-low text-on-surface ring-primary/60 hover:bg-surface-container-high shadow-md'
                }`}
                data-testid="pitch-stats-toggle"
              >
                <span className="material-symbols-outlined text-base">
                  {statsMode ? 'group' : 'monitoring'}
                </span>
                <span>
                  {statsMode
                    ? '球员视图'
                    : '数据视图'}
                </span>
              </button>
            </div>
            <MatchPitch
              homeTactics={homeTactics}
              awayTactics={awayTactics}
              homeRoster={homeRoster}
              awayRoster={awayRoster}
              activeSnapshot={activeSnapshot}
              statsMode={statsMode}
              onToggleStatsMode={() => setStatsMode((v) => !v)}
              homeForfeit={false}
              awayForfeit={false}
              homeTeamName={homeTeamName}
              awayTeamName={awayTeamName}
            />
          </div>
        }
        sidebar={null}
        commentary={
          <LiveCommentary
            events={visibleEvents}
            currentMinute={currentMinute}
            homeTeamName={homeTeamName}
            awayTeamName={awayTeamName}
          />
        }
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
