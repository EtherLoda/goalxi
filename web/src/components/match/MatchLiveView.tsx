/**
 * MatchLiveView — self-contained live match view rendered inside the unified
 * match page when `mode === 'live'`.
 *
 * Owns all live-specific UI state:
 * - statsMode (pitch stats toggle)
 * - activeSnapshotIndex (timeline scrubber)
 * - matchEnded overlay + optional redirect to report mode
 *
 * Does NOT own the WebSocket connection — that is the domain of useMatchPage.
 * This component receives all data as props so it is also usable from the
 * standalone live page route if needed.
 */

'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type Player, type Tactics, type Match } from '@/lib/api';
import { type MatchState, type WsMatchEvent } from '@/hooks/useMatchPage';
import { LiveCommentary } from './LiveCommentary';
import { MatchPitch } from './MatchPitch';
import { MatchTimeline } from './MatchTimeline';
import { MatchScoreHero } from './bento/MatchScoreHero';
import { MatchPitchSidebar } from './MatchPitchSidebar';
import { extractSnapshots } from './snapshot-stats';

const MATCH_END_REDIRECT_DELAY_MS = 2500;

/** Map a WebSocket event to the REST API MatchEvent shape. */
function mapWsEventToApiEvent(wsEvent: WsMatchEvent) {
  return {
    id:
      wsEvent.id ??
      `${wsEvent.type}-${wsEvent.minute}-${wsEvent.playerId || ''}-${wsEvent.teamId || ''}`,
    matchId: wsEvent.matchId,
    minute: wsEvent.minute,
    second: wsEvent.second ?? 0,
    type: wsEvent.type,
    typeName: wsEvent.typeName ?? wsEvent.type,
    teamId: wsEvent.teamId,
    playerId: wsEvent.playerId,
    data: wsEvent.data,
    isHome: wsEvent.isHome,
  };
}

interface MatchLiveViewProps {
  matchId: string;
  locale: string;
  /** Whether the WS was previously connected and is now attempting to reconnect. */
  isReconnecting: boolean;
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
  matchState: MatchState | null;
  /** Raw WebSocket events (not yet filtered by minute). */
  wsEvents: WsMatchEvent[];
  homeTactics: Tactics | null;
  awayTactics: Tactics | null;
  homeRoster: Player[];
  awayRoster: Player[];
  /** Match metadata (used for venue/stadium in sidebar). */
  match: Match | null;
  error: string | null;
  /**
   * When true, the component shows a brief "Match ended" overlay and then
   * navigates to the report page (the same URL, since the match page
   * will render TacticalMatchDetail once mode transitions to 'report').
   * Defaults to false (no redirect — caller handles mode transition).
   */
  autoRedirectOnEnd?: boolean;
}

export function MatchLiveView({
  matchId,
  locale,
  isReconnecting,
  connectionStatus,
  matchState,
  wsEvents,
  homeTactics,
  awayTactics,
  homeRoster,
  awayRoster,
  match,
  error,
  autoRedirectOnEnd = false,
}: MatchLiveViewProps) {
  const router = useRouter();
  const t = useTranslations('matches.live');

  const [matchEnded, setMatchEnded] = useState(false);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [statsMode, setStatsMode] = useState(false);

  // Show "Match ended" overlay + redirect when the match completes.
  // The `autoRedirectOnEnd` flag lets the standalone live page opt in to
  // navigation; the unified page skips it (the page itself transitions mode).
  useEffect(() => {
    if (!autoRedirectOnEnd) return;
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
  }, [matchState?.isComplete, matchEnded, matchId, locale, router, autoRedirectOnEnd]);

  const homeTeamName = matchState?.homeTeam.name || 'Home';
  const awayTeamName = matchState?.awayTeam.name || 'Away';
  const currentMinute = matchState?.currentMinute || 0;
  const isConnected = connectionStatus === 'connected';

  // Map WS events → API format and filter to visible minute window.
  const visibleEvents = useMemo(
    () =>
      wsEvents
        .filter((e) => e.minute <= currentMinute)
        .map(mapWsEventToApiEvent),
    [wsEvents, currentMinute],
  );

  // Snapshots drive the scrubber. Default to latest snapshot.
  const snapshots = useMemo(() => extractSnapshots(visibleEvents), [visibleEvents]);
  const [activeSnapshotIndex, setActiveSnapshotIndex] = useState<number>(
    () => Math.max(0, snapshots.length - 1),
  );

  // String-keyed roster map for MatchPitchSidebar → MatchKeyEvents.
  // MatchEvent.playerId is a string but Player.id is a number, so we
  // stringify at lookup time. Without this, the key events panel
  // can't resolve player names from the events.
  const rosterByIdForKeys = useMemo(() => {
    const map = new Map<string, { name: string }>();
    for (const p of homeRoster) map.set(String(p.id), { name: p.name });
    for (const p of awayRoster) map.set(String(p.id), { name: p.name });
    return map;
  }, [homeRoster, awayRoster]);

  // Auto-snap to the latest snapshot as new events arrive, unless the user
  // is actively scrubbing through history.
  useEffect(() => {
    setActiveSnapshotIndex((idx) => Math.max(0, snapshots.length - 1));
  }, [snapshots.length]);

  // ── Connection error state ─────────────────────────────────────────────────
  if (error && connectionStatus === 'disconnected' && !matchState) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto w-full">
        <div className="bg-surface-container-low rounded-2xl p-12 text-center border border-error/20">
          <span className="material-symbols-outlined text-6xl text-error/50 mb-4 block">
            wifi_off
          </span>
          <p className="text-on-surface-variant text-lg font-medium mb-2">{t('connectionLost')}</p>
          <p className="text-on-surface-variant/70 text-sm mb-4">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Match-end overlay — visible when autoRedirectOnEnd is true and
          the match has just ended. */}
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

      {/* Score Hero */}
      <MatchScoreHero
        locale={locale}
        matchId={matchId}
        homeTeamName={homeTeamName}
        awayTeamName={awayTeamName}
        homeScore={matchState?.homeScore ?? 0}
        awayScore={matchState?.awayScore ?? 0}
        currentMinute={currentMinute}
        isComplete={matchState?.isComplete ?? false}
        isReconnecting={isReconnecting}
        isConnected={isConnected}
      />

      {/* Timeline */}
      <MatchTimeline
        events={visibleEvents}
        snapshots={snapshots}
        currentMinute={currentMinute}
        activeIndex={activeSnapshotIndex}
        onChange={setActiveSnapshotIndex}
      />

      {/* Custom grid: pitch takes 3/4, sidebar takes 1/4 */}
      <div className="grid grid-cols-1 lg:grid-cols-[4fr_1fr] gap-4 items-start">
        {/* LEFT — pitch + stats toggle */}
        <div className="space-y-3">
          {/* Stats toggle */}
          <div className="flex justify-end">
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
              <span>{statsMode ? '球员视图' : '数据视图'}</span>
            </button>
          </div>
          <MatchPitch
            homeTactics={homeTactics}
            awayTactics={awayTactics}
            homeRoster={homeRoster}
            awayRoster={awayRoster}
            activeSnapshot={snapshots[activeSnapshotIndex] ?? null}
            statsMode={statsMode}
            onToggleStatsMode={() => setStatsMode((v) => !v)}
            homeForfeit={false}
            awayForfeit={false}
            homeTeamName={homeTeamName}
            awayTeamName={awayTeamName}
          />
        </div>

        {/* RIGHT — sidebar */}
        <div className="flex flex-col gap-3 lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto">
          <MatchPitchSidebar
            events={visibleEvents}
            currentMinute={currentMinute}
            stadium={match?.venue ?? undefined}
            homeTeamId={match?.homeTeam?.id ?? null}
            awayTeamId={match?.awayTeam?.id ?? null}
            rosterById={rosterByIdForKeys}
          />
        </div>
      </div>

      {/* Commentary — full width below */}
      <LiveCommentary
        events={visibleEvents}
        currentMinute={currentMinute}
        homeTeamName={homeTeamName}
        awayTeamName={awayTeamName}
        homeTeamId={match?.homeTeam?.id ?? null}
        awayTeamId={match?.awayTeam?.id ?? null}
        homeScore={matchState?.homeScore ?? 0}
        awayScore={matchState?.awayScore ?? 0}
      />
    </div>
  );
}
