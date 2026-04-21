'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

export interface MatchEvent {
  type: string;
  matchId: string;
  minute: number;
  teamId?: string;
  playerId?: string;
  playerName?: string;
  data?: any;
  eventScheduledTime?: number;
}

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

  const eventsRef = useRef<Map<string, MatchEvent>>(new Map());
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  const connect = useCallback(() => {
    if (socket?.connected) return;

    setConnectionStatus('connecting');
    setError(null);

    const newSocket = io(`${WS_URL}/matches`, {
      auth: { token: token || undefined },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    newSocket.on('connect', () => {
      setConnectionStatus('connected');
      setError(null);
      reconnectAttemptsRef.current = 0;

      // Join the match room
      newSocket.emit('join_match', { matchId });
    });

    newSocket.on('disconnect', () => {
      setConnectionStatus('disconnected');
    });

    newSocket.on('connect_error', (err) => {
      setConnectionStatus('disconnected');
      setError(`Connection error: ${err.message}`);
      reconnectAttemptsRef.current++;
    });

    newSocket.on('error', (data: { message: string }) => {
      setError(data.message);
    });

    // Match state update (initial state when joining)
    newSocket.on('match_state', (state: MatchState) => {
      setMatchState(state);
    });

    // Initial events batch
    newSocket.on('match_events', (data: { matchId: string; events: MatchEvent[] }) => {
      if (data.events) {
        const newEvents = new Map(eventsRef.current);
        for (const event of data.events) {
          // Use event key to avoid duplicates
          const eventKey = `${event.type}-${event.minute}-${event.playerId || ''}-${event.teamId || ''}`;
          newEvents.set(eventKey, event);
        }
        eventsRef.current = newEvents;
        setEvents(Array.from(newEvents.values()).sort((a, b) => {
          if (a.eventScheduledTime && b.eventScheduledTime) {
            return a.eventScheduledTime - b.eventScheduledTime;
          }
          return a.minute - b.minute;
        }));
      }
    });

    // Score update (incremental)
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
              currentMinute: data.currentMinute,
            }
          : null,
      );
    });

    // New events revealed
    newSocket.on('match_events', (data: {
      matchId: string;
      events: MatchEvent[];
      timestamp?: number;
    }) => {
      if (data.events && data.events.length > 0) {
        const newEvents = new Map(eventsRef.current);
        for (const event of data.events) {
          const eventKey = `${event.type}-${event.minute}-${event.playerId || ''}-${event.teamId || ''}`;
          newEvents.set(eventKey, event);
        }
        eventsRef.current = newEvents;
        setEvents(
          Array.from(newEvents.values()).sort((a, b) => {
            if (a.eventScheduledTime && b.eventScheduledTime) {
              return a.eventScheduledTime - b.eventScheduledTime;
            }
            return a.minute - b.minute;
          }),
        );
      }
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
  }, [matchId, token]);

  const disconnect = useCallback(() => {
    if (socket) {
      socket.emit('leave_match', { matchId });
      socket.disconnect();
      socket.removeAllListeners();
      setSocket(null);
      setConnectionStatus('disconnected');
    }
  }, [socket, matchId]);

  const sendPing = useCallback(() => {
    if (socket?.connected) {
      socket.emit('ping');
    }
  }, [socket]);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect && matchId) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, matchId, connect, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
      }
    };
  }, [socket]);

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
