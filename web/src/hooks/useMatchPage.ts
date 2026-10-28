'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { api, MATCH_STATUS, type Match, type MatchEvent, type MatchStatsRes, type Player, type Tactics } from '@/lib/api';

/**
 * WebSocket-side MatchEvent shape (same as the REST type minus `second`).
 * Transport-only fields: `eventScheduledTime` (sort key), `playerName` (denormalized).
 */
export interface WsMatchEvent {
  id?: string;
  matchId: string;
  minute: number;
  second?: number;
  type: string;
  typeName?: string;
  teamId?: string;
  playerId?: string;
  /** Second player the event names (assister / interceptor) — see `relatedPlayerId` on `MatchEvent`. */
  relatedPlayerId?: number | string;
  data: Record<string, unknown>;
  isHome?: boolean;
  eventScheduledTime?: number;
  playerName?: string;
}

/** Matches the gateway's `match_state` payload. */
export interface MatchState {
  matchId: string;
  homeTeam: { id: string; name: string; logo: string | null };
  awayTeam: { id: string; name: string; logo: string | null };
  homeScore: number;
  awayScore: number;
  currentMinute: number;
  status: string;
  scheduledAt: string;
  isComplete: boolean;
}

/** Matches the gateway's `lineup_update` payload. */
export interface LineupData {
  matchId: string;
  homeTeam: { id: string; name: string; logo?: string | null };
  awayTeam: { id: string; name: string; logo?: string | null };
  scheduledAt: string;
  events: Array<{ minute: number; phase: string; isHome: boolean; data: unknown }>;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';
export type MatchPageMode = 'live' | 'report';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3000';

/** Stable composite key for WS event deduping (matches commentary.ts hash fallback). */
export function matchEventKey(event: WsMatchEvent): string {
  return `${event.type}-${event.minute}-${event.playerId ?? ''}-${event.teamId ?? ''}`;
}

/**
 * Coarse-grained sort key (seconds since kickoff). Used when one side
 * has `eventScheduledTime` and the other doesn't — keeps the relative
 * order meaningful instead of falling back to whole-minute comparison.
 */
function wsEventOrderKey(e: WsMatchEvent): number {
  return e.minute * 60 + (e.second ?? 0);
}

/** Merge + dedupe + sort events. Exported for unit testing. */
export function mergeAndSortMatchEvents(
  existing: WsMatchEvent[],
  incoming: WsMatchEvent[],
): WsMatchEvent[] {
  const map = new Map<string, WsMatchEvent>();
  for (const e of existing) map.set(matchEventKey(e), e);
  for (const e of incoming) map.set(matchEventKey(e), e);
  return Array.from(map.values()).sort((a, b) => {
    const at = a.eventScheduledTime;
    const bt = b.eventScheduledTime;
    // Both have scheduled time → sub-second precision wins.
    if (at != null && bt != null) return at - bt;
    // One has, one doesn't — use the scheduled time of the one that
    // does as the absolute anchor and compare with the other's
    // coarse key. Without this branch the comparator would fall back
    // to `a.minute - b.minute` (whole-minute granularity) and the
    // side with `eventScheduledTime` would be misordered against the
    // side without it.
    if (at != null) return at - wsEventOrderKey(b) * 1000;
    if (bt != null) return wsEventOrderKey(a) * 1000 - bt;
    return wsEventOrderKey(a) - wsEventOrderKey(b);
  });
}

interface UseMatchPageOptions {
  matchId: string;
  token?: string | null;
  /** Defaults to true. Pass false when the page manages its own connection lifecycle. */
  autoConnect?: boolean;
  /**
   * When provided, the hook skips the initial REST fetch and uses this match
   * to determine the initial mode. Useful when the page already has the match
   * data (e.g., from server-side props or a parent that fetched it first).
   */
  initialMatch?: Match | null;
}

export interface UseMatchPageReturn {
  /** 'live' when match is in_progress, 'report' otherwise. */
  mode: MatchPageMode;
  /** Current WebSocket connection status. Always 'connected' in report mode. */
  connectionStatus: ConnectionStatus;
  /** Live match state from WebSocket (null in report mode). */
  matchState: MatchState | null;
  /** Accumulated WebSocket events (empty in report mode). Kept as a separate
   *  field from `events` so callers that need the raw array (not filtered by
   *  minute) can access it. In live mode this is identical to `events`. */
  wsEvents: WsMatchEvent[];
  /** Alias for `wsEvents` in live mode (backwards-compatible with useMatchLive). */
  events: WsMatchEvent[];
  /** Lineup data from WebSocket (null in report mode). */
  lineup: LineupData | null;
  /** Error from WebSocket or REST fetch. */
  error: string | null;
  /** REST match data (always populated, regardless of mode). */
  match: Match | null;
  /** REST match events (always populated, regardless of mode). */
  restEvents: MatchEvent[];
  /** REST match stats (always populated, regardless of mode). */
  stats: MatchStatsRes | null;
  /** Home team tactics from REST. */
  homeTactics: Tactics | null;
  /** Away team tactics from REST. */
  awayTactics: Tactics | null;
  /** Home team roster from REST. */
  homeRoster: Player[];
  /** Away team roster from REST. */
  awayRoster: Player[];
  /** Whether initial REST fetch is still pending. */
  isLoading: boolean;
  connect: () => void;
  disconnect: () => void;
}

/**
 * Unified hook for the match page.
 *
 * Mode resolution:
 * - If `initialMatch` is passed, use its status to pick mode immediately.
 * - Otherwise fetch `match` from REST on mount and resolve from there.
 * - In 'live' mode: connect WebSocket; transition to 'report' when
 *   `matchState.isComplete` becomes true.
 * - In 'report' mode: no WebSocket; all data comes from REST.
 *
 * The hook always pre-fetches tactics + rosters via REST (needed by the
 * pitch regardless of mode) so the component never has to manage that itself.
 */
export function useMatchPage({
  matchId,
  token,
  autoConnect = true,
  initialMatch = null,
}: UseMatchPageOptions): UseMatchPageReturn {
  const [mode, setMode] = useState<MatchPageMode>(
    initialMatch?.status === MATCH_STATUS.IN_PROGRESS ? 'live' : 'report',
  );

  // ── REST data (always populated) ──────────────────────────────────────────
  const [match, setMatch] = useState<Match | null>(initialMatch);
  const [restEvents, setRestEvents] = useState<MatchEvent[]>([]);
  const [stats, setStats] = useState<MatchStatsRes | null>(null);
  const [homeTactics, setHomeTactics] = useState<Tactics | null>(null);
  const [awayTactics, setAwayTactics] = useState<Tactics | null>(null);
  const [homeRoster, setHomeRoster] = useState<Player[]>([]);
  const [awayRoster, setAwayRoster] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(!initialMatch);
  const [error, setError] = useState<string | null>(null);

  // ── WS data (only used in live mode) ─────────────────────────────────────
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [matchState, setMatchState] = useState<MatchState | null>(null);
  const [wsEvents, setWsEvents] = useState<WsMatchEvent[]>([]);
  const [lineup, setLineup] = useState<LineupData | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const eventsRef = useRef<Map<string, WsMatchEvent>>(new Map());

  // ── REST loader (initial mount + post-match refresh) ──────────────────────
  //
  // Called once on mount and again when the socket reports `match_end`.
  // The second call is the whole point of the extraction: the report renders
  // from `match` / `restEvents` / `stats`, all fetched *before* full time.
  // The per-team stats row in particular is only written by the settlement
  // transaction at the end of the simulation, so a page opened mid-match has
  // `stats === null` and an event list truncated at the moment of opening.
  // Without this refresh the report shows a kickoff-time snapshot — stale
  // score, half the events, no stats panel — until the user reloads.
  const loadRestData = useCallback(
    async (
      options: { silent?: boolean; isCancelled?: () => boolean } = {},
    ): Promise<Match | null> => {
      const { silent = false, isCancelled } = options;
      if (!silent) {
        setIsLoading(true);
        setError(null);
        // Drop the previous snapshot first so navigating to another fixture
        // never flashes the old match's events or stats.
        setRestEvents([]);
        setStats(null);
        // Same for the live slate: the event cache is keyed by match, so a
        // cache left behind by the previous fixture (or by a socket that is
        // about to be replaced) would be merged into the new match's feed.
        // The gateway replays the full visible list on `join_match`, so
        // nothing is lost by starting empty.
        eventsRef.current = new Map();
        setWsEvents([]);
        setMatchState(null);
        setLineup(null);
      }

      // Use allSettled so a failure in /events or /stats (e.g. stats 404 for
      // a scheduled match that hasn't started yet) doesn't kill the whole
      // page — the user can still see teams, schedule and other basic info.
      const [matchResult, eventsResult, statsResult] = await Promise.allSettled([
        api.matches.getById(matchId),
        api.matches.getEvents(matchId),
        api.matches.getStats(matchId),
      ]);
      if (isCancelled?.()) return null;

      if (matchResult.status === 'rejected') {
        setError('Failed to load match data');
        setIsLoading(false);
        return null;
      }

      const matchRes = matchResult.value;
      setMatch(matchRes);
      setRestEvents(eventsResult.status === 'fulfilled' ? eventsResult.value.events : []);
      setStats(statsResult.status === 'fulfilled' ? statsResult.value : null);
      setIsLoading(false);
      return matchRes;
    },
    [matchId],
  );

  // ── Initial REST fetch (when no initialMatch supplied) ────────────────────
  useEffect(() => {
    if (initialMatch) return; // Skip when page already has match data

    let cancelled = false;
    (async () => {
      const matchRes = await loadRestData({ isCancelled: () => cancelled });
      if (!matchRes || cancelled) return;
      setMode(matchRes.status === MATCH_STATUS.IN_PROGRESS ? 'live' : 'report');
    })();
    return () => { cancelled = true; };
  }, [loadRestData, initialMatch]);

  // ── REST: tactics + rosters (always needed by the pitch) ──────────────────
  useEffect(() => {
    const homeTeamId = match?.homeTeam?.id;
    const awayTeamId = match?.awayTeam?.id;

    let cancelled = false;
    (async () => {
      try {
        const [tacticsRes, homeRosterRes, awayRosterRes] = await Promise.all([
          api.matches.getTactics(matchId),
          homeTeamId ? api.players.getByTeam(homeTeamId) : Promise.resolve({ items: [] as Player[], meta: {} }),
          awayTeamId ? api.players.getByTeam(awayTeamId) : Promise.resolve({ items: [] as Player[], meta: {} }),
        ]);
        if (cancelled) return;
        setHomeTactics(tacticsRes.homeTactics);
        setAwayTactics(tacticsRes.awayTactics);
        setHomeRoster(homeRosterRes.items ?? []);
        setAwayRoster(awayRosterRes.items ?? []);
      } catch {
        // Swallow — pitch renders empty grid without tactics/roster
      }
    })();
    return () => { cancelled = true; };
  }, [matchId, match?.homeTeam?.id, match?.awayTeam?.id]);

  // ── WebSocket connection (live mode only) ─────────────────────────────────
  const connectWs = useCallback(() => {
    if (socketRef.current?.connected) return;

    const socket = io(`${WS_URL}/matches`, {
      auth: { token: token || undefined },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => {
      setConnectionStatus('connected');
      setError(null);
      socket.emit('join_match', { matchId });
    });

    socket.on('disconnect', () => setConnectionStatus('disconnected'));

    // socket.io retries on its own, so neither `connectWs` nor `connect` runs
    // again for a reconnect. Without this the status stayed 'disconnected' for
    // the whole backoff window and the hero's caption read "Connecting…"
    // instead of "Reconnecting…" (`isReconnecting` is derived from this state).
    //
    // The initial connect deliberately does NOT set 'connecting' here: doing
    // so synchronously inside `connectWs` (which an effect calls) is what the
    // `react-hooks/set-state-in-effect` rule flags, and the UI renders the
    // same "Connecting…" caption for 'disconnected' + no `matchState`.
    socket.io.on('reconnect_attempt', () => setConnectionStatus('connecting'));

    // After `reconnectionAttempts` the manager gives up and the socket stays
    // down. Without this the status would sit on 'connecting' forever and the
    // hero would keep advertising "Reconnecting…" with nothing in flight.
    socket.io.on('reconnect_failed', () => setConnectionStatus('disconnected'));

    socket.on('connect_error', (err) => {
      setConnectionStatus('disconnected');
      setError(`Connection error: ${err.message}`);
    });

    // Server-sent application error (a rejected `join_match`, for example
    // because the match is not yet available). Deliberately NOT
    // `socket.on('error', ...)`: socket.io reserves the bare `error` name
    // for transport events, so `client.emit('error', ...)` on the server
    // never reaches a client listener. The gateway emits `error_msg` — see
    // `match-live.gateway.ts` `handleJoinMatch`. Without this the user sits
    // on an empty 0-0 board with no explanation.
    socket.on('error_msg', (data: { message: string }) => setError(data.message));

    socket.on('match_state', (state: MatchState) => {
      setMatchState(state);
    });

    socket.on('match_events', (data: { matchId: string; events: WsMatchEvent[] }) => {
      if (data.events) {
        const next = mergeAndSortMatchEvents(
          Array.from(eventsRef.current.values()),
          data.events,
        );
        eventsRef.current = new Map(next.map((e) => [matchEventKey(e), e]));
        setWsEvents(next);
      }
    });

    socket.on('score_update', (data: {
      matchId: string; homeScore: number; awayScore: number; currentMinute: number;
    }) => {
      setMatchState((prev) =>
        prev
          ? {
              ...prev,
              homeScore: data.homeScore,
              awayScore: data.awayScore,
              currentMinute: Math.max(prev.currentMinute, data.currentMinute),
            }
          : null,
      );
    });

    socket.on('lineup_update', (data: LineupData) => setLineup(data));

    socket.on('match_end', (data: {
      matchId: string; homeScore: number; awayScore: number; isComplete: boolean;
    }) => {
      setMatchState((prev) =>
        prev
          ? { ...prev, homeScore: data.homeScore, awayScore: data.awayScore, isComplete: data.isComplete }
          : null,
      );
      // Flip the REST match row optimistically so the hand-over can't show a
      // kickoff-time 0-0 for the round-trip. The refresh below overwrites it
      // with the authoritative row (forfeit flags, venue, attendance, ...).
      setMatch((prev) =>
        prev
          ? {
              ...prev,
              homeScore: data.homeScore,
              awayScore: data.awayScore,
              status: MATCH_STATUS.COMPLETED,
            }
          : prev,
      );
      // The report reads `match` / `restEvents` / `stats` from REST. Those
      // were fetched at mount — i.e. before full time — so switching modes
      // without refetching renders a kickoff snapshot (stale scoreline,
      // truncated event list, no per-team stats; the stats row is only
      // written by the settlement transaction at the end of the simulation).
      // Failures are non-fatal: the optimistic row above still leaves the
      // user on a coherent report.
      void (async () => {
        await loadRestData({ silent: true });
        setMode('report');
      })();
    });

    socket.on('match_left', () => {/* no-op */});

    socketRef.current = socket;
  }, [matchId, token, loadRestData]);

  const disconnectWs = useCallback(() => {
    const s = socketRef.current;
    if (s) {
      s.emit('leave_match', { matchId });
      // The `disconnect` listener registered in `connectWs` flips
      // `connectionStatus` — deliberately not done inline here, because this
      // is called from the mode effect and a synchronous setState there is
      // exactly what `react-hooks/set-state-in-effect` rejects.
      s.disconnect();
      s.removeAllListeners();
      socketRef.current = null;
    }
  }, [matchId]);

  // Auto-connect/disconnect based on mode
  useEffect(() => {
    if (!autoConnect) return;
    if (mode === 'live') {
      connectWs();
    } else {
      disconnectWs();
    }
    return () => { disconnectWs(); };
  }, [mode, autoConnect, connectWs, disconnectWs]);

  // ── Derived events: in live mode use WS events; in report mode use REST ───
  // In live mode we still return the REST events as `restEvents` for cases
  // where the component needs the full historical event list.
  const events = mode === 'live' ? wsEvents : [];

  return {
    mode,
    connectionStatus,
    matchState,
    events,
    wsEvents,
    lineup,
    error,
    match,
    restEvents,
    stats,
    homeTactics,
    awayTactics,
    homeRoster,
    awayRoster,
    isLoading,
    connect: connectWs,
    disconnect: disconnectWs,
  };
}
