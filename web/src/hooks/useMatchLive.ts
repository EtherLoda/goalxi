'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { MatchEvent as ApiMatchEvent } from '@/lib/api';

/**
 * [WAVE B4] WebSocket-side `MatchEvent` shape.
 *
 * Identical to `@/lib/api`'s `MatchEvent` (the entity-rest DTO) plus two
 * transport-only fields the gateway emits: `eventScheduledTime` (reveal
 * timestamp in ms, used for sorting) and `playerName` (denormalized from
 * `data.playerName` at write time, no need for the client to look it up).
 *
 * `second` stays optional — the simulator never persists sub-minute data, so
 * the gateway doesn't emit it. `id` is required because the gateway now
 * forwards the entity UUID (Phase 1) which the formatter hashes for
 * deterministic tpl_* variation.
 */
export type MatchEvent = Omit<ApiMatchEvent, 'second'> & {
  second?: number;
  eventScheduledTime?: number;
  playerName?: string;
};

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

export interface LineupData {
  matchId: string;
  homeTeam: { id: string; name: string; logo?: string | null };
  awayTeam: { id: string; name: string; logo?: string | null };
  scheduledAt: string;
  events: Array<{
    minute: number;
    phase: string;
    isHome: boolean;
    data: any;
  }>;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3000';

/**
 * Stable composite key used to dedupe live events across reconnect/replay.
 *
 * Same tuple used by `commentary.ts`'s hash fallback for tpl_* variation,
 * so the formatter and the in-memory store agree on identity. Exposed here
 * (instead of inlined) so a unit spec can lock the contract.
 */
export function matchEventKey(event: MatchEvent): string {
  return `${event.type}-${event.minute}-${event.playerId ?? ''}-${event.teamId ?? ''}`;
}

/**
 * Merge an existing event list with newly-revealed events, dedupe by the
 * composite key (last write wins), and return sorted by `eventScheduledTime`
 * when both sides carry it, otherwise by `minute` ascending. Exported for
 * unit testing the dedupe + sort invariants without spinning up a socket.
 */
export function mergeAndSortMatchEvents(
  existing: MatchEvent[],
  incoming: MatchEvent[],
): MatchEvent[] {
  const map = new Map<string, MatchEvent>();
  for (const event of existing) {
    map.set(matchEventKey(event), event);
  }
  for (const event of incoming) {
    map.set(matchEventKey(event), event);
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.eventScheduledTime && b.eventScheduledTime) {
      return a.eventScheduledTime - b.eventScheduledTime;
    }
    return a.minute - b.minute;
  });
}

interface UseMatchLiveOptions {
  matchId: string;
  token?: string | null;
  autoConnect?: boolean;
}

export function useMatchLive({
  matchId,
  token,
  autoConnect = true,
}: UseMatchLiveOptions) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('disconnected');
  const [matchState, setMatchState] = useState<MatchState | null>(null);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [lineup, setLineup] = useState<LineupData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Use a ref to track the current socket so callbacks don't need socket as a dep
  const socketRef = useRef<Socket | null>(null);
  const eventsRef = useRef<Map<string, MatchEvent>>(new Map());

  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;

    setConnectionStatus('connecting');
    setError(null);

    // Socket.io handles reconnection cadence internally
    // (`reconnectionAttempts: maxReconnectAttempts`). No client-side counter
    // needed — leaving the UI with a stale "Reconnecting…" pill until the
    // status flips is fine; socket.io's transport hides transient failures.
    const newSocket = io(`${WS_URL}/matches`, {
      auth: { token: token || undefined },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    newSocket.on('connect', () => {
      setConnectionStatus('connected');
      setError(null);

      // Join the match room
      newSocket.emit('join_match', { matchId });
    });

    newSocket.on('disconnect', () => {
      setConnectionStatus('disconnected');
    });

    newSocket.on('connect_error', (err) => {
      setConnectionStatus('disconnected');
      setError(`Connection error: ${err.message}`);
    });

    newSocket.on('error', (data: { message: string }) => {
      setError(data.message);
    });

    // Match state update (initial state when joining)
    newSocket.on('match_state', (state: MatchState) => {
      setMatchState(state);
    });

    // match_events payload — emitted both on join (initial replay) and on
    // each 5-second reveal tick. The gateway adds a `timestamp` field on
    // subsequent ticks; we ignore it (client only cares about events).
    newSocket.on('match_events', (data: { matchId: string; events: MatchEvent[] }) => {
      if (data.events) {
        const next = mergeAndSortMatchEvents(
          Array.from(eventsRef.current.values()),
          data.events,
        );
        eventsRef.current = new Map(next.map((e) => [matchEventKey(e), e]));
        setEvents(next);
      }
    });

    // Score update (incremental). `currentMinute` is monotonic — never let
    // a stale reconnect-packet or out-of-order `score_update` rewind the
    // game clock, otherwise `events.filter(e => e.minute <= currentMinute)`
    // would suppress already-revealed events.
    newSocket.on('score_update', (data: {
      matchId: string;
      homeScore: number;
      awayScore: number;
      currentMinute: number;
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

    // Lineup update (5 min before kickoff)
    newSocket.on('lineup_update', (data: LineupData) => {
      setLineup(data);
    });

    // Match end
    newSocket.on('match_end', (data: {
      matchId: string;
      homeScore: number;
      awayScore: number;
      isComplete: boolean;
    }) => {
      setMatchState((prev) =>
        prev
          ? {
              ...prev,
              homeScore: data.homeScore,
              awayScore: data.awayScore,
              isComplete: data.isComplete,
            }
          : null,
      );
    });

    // Match left
    newSocket.on('match_left', () => {
      // Do nothing special on leave
    });

    // Pong response for latency measurement
    newSocket.on('pong', (data: { timestamp: number }) => {
      const latency = Date.now() - data.timestamp;
      // Could expose latency for debugging
    });

    setSocket(newSocket);
    socketRef.current = newSocket;
  }, [matchId, token]);

  const disconnect = useCallback(() => {
    const s = socketRef.current;
    if (s) {
      s.emit('leave_match', { matchId });
      s.disconnect();
      s.removeAllListeners();
      socketRef.current = null;
      setSocket(null);
      setConnectionStatus('disconnected');
    }
  }, [matchId]);

  const sendPing = useCallback(() => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('ping');
    }
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect && matchId) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, matchId, connect, disconnect]);

  return {
    socket,
    connectionStatus,
    matchState,
    events,
    lineup,
    error,
    connect,
    disconnect,
    sendPing,
  };
}
