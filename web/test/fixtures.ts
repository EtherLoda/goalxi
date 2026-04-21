import { test as base } from '@playwright/test';
import { io, Socket } from 'socket.io-client';

const WS_URL = process.env.PLAYWRIGHT_WS_URL || 'http://localhost:3000';
const API_URL = process.env.PLAYWRIGHT_API_URL || 'http://localhost:3000/api/v1';

interface MatchInfo {
  id: string;
  homeTeam: { id: string; name: string };
  awayTeam: { id: string; name: string };
  scheduledAt: Date;
  status: string;
}

// ============================================================================
// Test Fixtures
// ============================================================================

export interface MatchLiveFixtures {
  testMatchId: string;
  inProgressMatchId: string;
  completedMatchId: string;
  testMatchState: MatchInfo;
}

/**
 * Fetch a test match from the API
 */
async function fetchTestMatch(status?: string): Promise<MatchInfo | null> {
  try {
    const url = status
      ? `${API_URL}/matches?status=${status}&limit=1`
      : `${API_URL}/matches?limit=1`;

    const response = await fetch(url);

    if (!response.ok) {
      console.warn(`Failed to fetch test match: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.data?.[0] || null;
  } catch (error) {
    console.warn('Failed to fetch test match:', error);
    return null;
  }
}

// ============================================================================
// Custom Test Extension
// ============================================================================

export const test = base.extend<MatchLiveFixtures>({
  /**
   * Provides a valid test match ID for testing
   */
  testMatchId: async ({}, use) => {
    // Try to get a real match from API first
    const match = await fetchTestMatch();

    if (match) {
      await use(match.id);
    } else {
      // Fallback to a placeholder for development
      // Tests requiring real match data will be skipped
      await use('test-match-placeholder');
    }
  },

  /**
   * Provides an in-progress match ID
   */
  inProgressMatchId: async ({}, use) => {
    const match = await fetchTestMatch('IN_PROGRESS');

    if (match) {
      await use(match.id);
    } else {
      await use('in-progress-match-placeholder');
    }
  },

  /**
   * Provides a completed match ID for replay testing
   */
  completedMatchId: async ({}, use) => {
    const match = await fetchTestMatch('COMPLETED');

    if (match) {
      await use(match.id);
    } else {
      await use('completed-match-placeholder');
    }
  },

  /**
   * Provides full match info for a test match
   */
  testMatchState: async ({}, use) => {
    const match = await fetchTestMatch();

    if (match) {
      await use(match);
    } else {
      await use({
        id: 'test-match-placeholder',
        homeTeam: { id: 'home-1', name: 'Test Home FC' },
        awayTeam: { id: 'away-1', name: 'Test Away United' },
        scheduledAt: new Date(),
        status: 'IN_PROGRESS',
      });
    }
  },
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates a connected socket client
 */
export async function createConnectedSocket(token?: string): Promise<Socket> {
  const socket = io(`${WS_URL}/matches`, {
    auth: token ? { token } : {},
    transports: ['websocket', 'polling'],
    reconnection: false,
    timeout: 5000,
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Socket connection timeout'));
    }, 5000);

    socket.on('connect', () => {
      clearTimeout(timeout);
      resolve();
    });

    socket.on('connect_error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  return socket;
}

/**
 * Wait for socket event with timeout
 */
export async function waitForEvent<T>(
  socket: Socket,
  event: string,
  timeoutMs = 5000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for event: ${event}`));
    }, timeoutMs);

    socket.on(event, (data: T) => {
      clearTimeout(timeout);
      resolve(data);
    });
  });
}

/**
 * Collect events over a duration
 */
export async function collectEvents<T>(
  socket: Socket,
  event: string,
  durationMs: number,
): Promise<T[]> {
  const events: T[] = [];

  return new Promise((resolve) => {
    const handler = (data: T) => {
      events.push(data);
    };

    socket.on(event, handler);

    setTimeout(() => {
      socket.off(event, handler);
      resolve(events);
    }, durationMs);
  });
}

/**
 * Disconnect all sockets in an array
 */
export function disconnectAll(sockets: Socket[]): void {
  sockets.forEach((socket) => {
    if (socket.connected) {
      socket.disconnect();
    }
  });
}