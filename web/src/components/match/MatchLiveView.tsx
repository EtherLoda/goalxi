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

import { AppIcon } from "@/components/icons/AppIcon";
import { GlassPanel } from '@/components/ui/GlassPanel';
import { useEffect, useMemo, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type Player, type Tactics, type Match } from '@/lib/api';
import { type MatchState, type WsMatchEvent } from '@/hooks/useMatchPage';
import { LiveCommentary } from './LiveCommentary';
import { MatchPitch } from './MatchPitch';
import { MatchPitchStage } from './MatchPitchStage';
import type { PitchMarkerMode } from './MatchPlayerMarker';
import { SubbedOffStrip } from './SubbedOffStrip';
import { subbedOffFrom } from './subbed-off';
import { MatchProgressRail } from './MatchProgressRail';
import { MatchScoreHero } from './bento/MatchScoreHero';
import { MatchPage } from './MatchPage';
import { closestSnapshotIndex, useInjuryWindows } from './match-timeline';
import { MatchInfoPanel } from './MatchInfoPanel';
import { KeyEventsToggle, MatchKeyEvents } from './MatchKeyEvents';
import { extractSidebarData } from './match-sidebar-data';
import { extractSnapshots, resolveAutoSnapIndex } from './snapshot-stats';
import { playerIdsToHighlight } from './involved-players';

const MATCH_END_REDIRECT_DELAY_MS = 2500;

/** Map a WebSocket event to the REST API MatchEvent shape.
 *
 * The WS gateway serialises `playerId` as a JSON string (e.g. `"42"`),
 * but the REST DTO + the DB column it mirrors are both `int`, so
 * `ApiMatchEvent.playerId` is `number | undefined`. Coerce here at
 * the transport boundary so the rest of the FE can rely on the
 * `String(playerId)`-friendly numeric shape and the key-events panel's
 * `rosterById.get(String(playerId))` lookup stays type-correct. A
 * missing / non-numeric payload is treated as "no player on the
 * event" and forwarded as `undefined` — the same contract the REST
 * path uses.
 */
function mapWsEventToApiEvent(wsEvent: WsMatchEvent) {
  const rawPlayerId = wsEvent.playerId;
  return {
    id:
      wsEvent.id ??
      `${wsEvent.type}-${wsEvent.minute}-${rawPlayerId || ''}-${wsEvent.teamId || ''}`,
    matchId: wsEvent.matchId,
    minute: wsEvent.minute,
    second: wsEvent.second ?? 0,
    type: wsEvent.type,
    typeName: wsEvent.typeName ?? wsEvent.type,
    teamId: wsEvent.teamId,
    playerId: rawPlayerId != null ? Number(rawPlayerId) : undefined,
    // Same coercion for the second player: the WS payload may serialise it as
    // a string, and the pitch spotlights by numeric id.
    relatedPlayerId:
      wsEvent.relatedPlayerId != null ? Number(wsEvent.relatedPlayerId) : undefined,
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
  const [pitchMode, setPitchMode] = useState<PitchMarkerMode>('lineup');
  // Compact list by default; the toggle reveals the chances that missed.
  const [showChances, setShowChances] = useState(false);
  // Cross-panel selection (strip glyph / key-events row → feed highlight).
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Show "Match ended" overlay + redirect when the match completes.
  // The `autoRedirectOnEnd` flag lets the standalone live page opt in to
  // navigation; the unified page skips it (the page itself transitions mode).
  useEffect(() => {
    if (!autoRedirectOnEnd) return;
    if (matchState?.isComplete && !matchEnded) {
      // Sync the local `matchEnded` flag with the external `matchState`
      // (driven by the socket's `match_end` event in useMatchPage). The
      // flag is what makes the overlay visible and gates the redirect
      // timer; setting it here is the natural place because the effect
      // is the boundary where external state (matchState) becomes
      // local UI state. Disabling the in-effect lint per the same
      // pattern used in `useCountUp` (hooks/useCountUp.ts).
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
  // Before `matchState` arrives (WS not yet round-tripped) currentMinute
  // is 0, which would silently drop every historical event. Until the
  // server tells us the real minute, render everything we have — once
  // matchState lands the filter snaps to the authoritative minute.
  const visibleEvents = useMemo(
    () => {
      const cap = matchState ? currentMinute : Infinity;
      return wsEvents
        .filter((e) => e.minute <= cap)
        .map(mapWsEventToApiEvent);
    },
    [wsEvents, currentMinute, matchState],
  );

  // Snapshots drive the scrubber. Default to latest snapshot.
  const snapshots = useMemo(() => extractSnapshots(visibleEvents), [visibleEvents]);
  const [activeSnapshotIndex, setActiveSnapshotIndex] = useState<number>(
    () => Math.max(0, snapshots.length - 1),
  );

  /**
   * Players on the pitch that the selected commentary line is about. The live
   * path rebuilds `MatchEvent`s from WS payloads, so the same helper as the
   * report page applies unchanged.
   */
  const highlightedPlayerIds = useMemo(
    () => playerIdsToHighlight(visibleEvents, selectedEventId),
    [visibleEvents, selectedEventId],
  );

  // String-keyed roster map for MatchKeyEvents.
  // MatchEvent.playerId is a string but Player.id is a number, so we
  // stringify at lookup time. Without this, the key events panel
  // can't resolve player names from the events.
  const rosterByIdForKeys = useMemo(() => {
    const map = new Map<string, { name: string }>();
    for (const p of homeRoster) map.set(String(p.id), { name: p.name });
    for (const p of awayRoster) map.set(String(p.id), { name: p.name });
    return map;
  }, [homeRoster, awayRoster]);

  // Auto-snap to the latest snapshot as new events arrive. The rail is
  // read-only, so there is no "scrubbing" state to respect any more:
  // clicking a goal pip only looks back, and the next event returns the
  // playhead to the latest frame.
  useEffect(() => {
    const next = resolveAutoSnapIndex(snapshots.length, false);
    // The snapshot array grows from polling — an external system — so advancing
    // the playhead here is synchronisation, not derived state. Live is a replay
    // that happens to be running.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (next !== null) setActiveSnapshotIndex(next);
  }, [snapshots.length]);

  // Same three panels the report renders, fed from the event stream
  // instead of the finished stats row. Weather and attendance only ever
  // exist as events, so both modes read them the same way.
  const { weather: sidebarWeather, attendance: sidebarAttendance } = useMemo(
    () => extractSidebarData(visibleEvents),
    [visibleEvents],
  );
  const injuryWindows = useInjuryWindows(visibleEvents);

  // ── Connection error state ─────────────────────────────────────────────────
  if (error && connectionStatus === 'disconnected' && !matchState) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto w-full">
        <GlassPanel className="border-error/20">
          <div className="p-12 text-center">
            <AppIcon name="wifi_off" className="text-6xl text-error/50 mb-4 block" />
            <p className="text-on-surface-variant text-lg font-medium mb-2">{t('connectionLost')}</p>
            <p className="text-on-surface-variant/70 text-sm mb-4">{error}</p>
          </div>
        </GlassPanel>
      </div>
    );
  }

  return (
    <MatchPage
      mode="live"
      banner={
        /* Match-end overlay — only when the caller opted into a redirect.
           The default is to stay put (the plan forbids pinning the user). */
        matchEnded && matchState ? (
          <div
            role="status"
            aria-live="polite"
            className="rounded-xl bg-signal-amber/10 border border-signal-amber/40 px-5 py-4 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3">
              <AppIcon name="sports_score" className="text-signal-amber" />
              <div>
                <p className="font-headline font-bold text-signal-amber uppercase tracking-wider text-sm">
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
        ) : null
      }
      hero={
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
      }
      main={
        <>
          <div className="mx-auto w-full max-w-[800px]">
            <MatchPitchStage
              clock={`${currentMinute}'`}
              mode={pitchMode}
              onModeChange={setPitchMode}
              progress={
                <MatchProgressRail
                  events={visibleEvents}
                  currentMinute={currentMinute}
                  selectedMinute={snapshots[activeSnapshotIndex]?.minute}
                  selectedEventId={selectedEventId}
                  onSelectEvent={setSelectedEventId}
                  onSelectMinute={(minute) =>
                    setActiveSnapshotIndex(closestSnapshotIndex(snapshots, minute))
                  }
                />
              }
              footer={<SubbedOffStrip players={subbedOffFrom(visibleEvents, match?.homeTeam?.id)} />}
            >
              <MatchPitch
                homeTactics={homeTactics}
                awayTactics={awayTactics}
                homeRoster={homeRoster}
                awayRoster={awayRoster}
                activeSnapshot={snapshots[activeSnapshotIndex] ?? null}
                mode={pitchMode}
                homeForfeit={match?.homeForfeit ?? false}
                awayForfeit={match?.awayForfeit ?? false}
                homeTeamName={homeTeamName}
                awayTeamName={awayTeamName}
                highlightedPlayerIds={highlightedPlayerIds}
              />
            </MatchPitchStage>
          </div>
        </>
      }
      timeline={null}
      commentary={
        <LiveCommentary
            typed
          events={visibleEvents}
          currentMinute={currentMinute}
          homeTeamName={homeTeamName}
          awayTeamName={awayTeamName}
          homeTeamId={match?.homeTeam?.id ?? null}
          awayTeamId={match?.awayTeam?.id ?? null}
          homeScore={matchState?.homeScore ?? 0}
          awayScore={matchState?.awayScore ?? 0}
          selectedEventId={selectedEventId}
          onSelectEvent={setSelectedEventId}
        />
      }
      aside={
        <>
          <GlassPanel className="p-4 shrink-0">
            <h3 className="font-headline font-bold text-kicker uppercase tracking-widest text-primary/80 mb-3 flex items-center gap-2">
              <AppIcon name="stadium" className="text-base" />
              {t('matchInfo')}
            </h3>
            <MatchInfoPanel
              match={{
                ...match,
                // Same fallback as the report page: the denormalised columns
                // are nullable, the simulator's `weather_announcement` /
                // `attendance_announcement` events are the second source.
                weather: match?.weather ?? sidebarWeather,
                attendance: match?.attendance ?? sidebarAttendance,
              }}
            />
          </GlassPanel>

          <GlassPanel className="p-4 flex flex-col min-h-[200px] max-h-[420px]">
            <h3 className="font-headline font-bold text-kicker uppercase tracking-widest text-primary/80 mb-3 flex items-center gap-2 shrink-0">
              <AppIcon name="history" className="text-base" />
              {t('keyEvents')}
              <KeyEventsToggle
                detailed={showChances}
                onToggle={() => setShowChances((v) => !v)}
                label={showChances ? t('highlightsOnly') : t('showChances')}
              />
            </h3>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <MatchKeyEvents
                events={visibleEvents}
                rosterById={rosterByIdForKeys}
                currentMinute={currentMinute}
                homeTeamId={match?.homeTeam?.id ?? null}
                awayTeamId={match?.awayTeam?.id ?? null}
                injuryWindows={injuryWindows}
                detailed={showChances}
                selectedEventId={selectedEventId}
                onSelectEvent={setSelectedEventId}
              />
            </div>
          </GlassPanel>
        </>
      }
      asideScroll
    />
  );
}
