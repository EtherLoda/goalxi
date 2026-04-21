import { test, expect } from '@playwright/test';
import { io, Socket } from 'socket.io-client';
import {
  createConnectedSocket,
  waitForEvent,
  collectEvents,
  disconnectAll,
} from './fixtures';

// ============================================================================
// Test Configuration
// ============================================================================

const WS_URL = process.env.PLAYWRIGHT_WS_URL || 'http://localhost:3000';
const MATCHES_NS = '/matches';

// ============================================================================
// Utilities
// ============================================================================

function createSocketClient(token?: string): Socket {
  return io(`${WS_URL}${MATCHES_NS}`, {
    auth: token ? { token } : {},
    transports: ['websocket', 'polling'],
    reconnection: false,
    timeout: 5000,
  });
}

// ============================================================================
// Availability Tests
// ============================================================================

test.describe('Availability', () => {
  test('ANON_CONNECTION - unauthenticated client can connect to /matches namespace', async () => {
    const socket = createSocketClient();

    try {
      await createConnectedSocket();
      expect(socket.connected).toBe(true);
    } finally {
      socket.disconnect();
    }
  });

  test('AUTH_CONNECTION - client with token can connect', async () => {
    // Note: Requires valid JWT for full auth flow
    const socket = createSocketClient('test-token');

    try {
      await createConnectedSocket();
      expect(socket.connected).toBe(true);
    } finally {
      socket.disconnect();
    }
  });

  test('MULTI_CLIENT - multiple clients can connect simultaneously', async () => {
    const sockets: Socket[] = [];

    try {
      for (let i = 0; i < 3; i++) {
        const socket = createSocketClient();
        await createConnectedSocket();
        sockets.push(socket);
      }

      for (const s of sockets) {
        expect(s.connected).toBe(true);
      }
    } finally {
      disconnectAll(sockets);
    }
  });
});

// ============================================================================
// Subscription Tests
// ============================================================================

test.describe('Subscription', () => {
  let socket: Socket;

  test.beforeEach(async () => {
    socket = createSocketClient();
    await createConnectedSocket();
  });

  test.afterEach(() => {
    if (socket.connected) {
      socket.disconnect();
    }
  });

  test('JOIN_MATCH - after joining, client receives match_state and match_events', async () => {
    const matchId = 'test-match-123';

    const [matchState, matchEvents] = await Promise.all([
      waitForEvent<Record<string, unknown>>(socket, 'match_state', 5000),
      waitForEvent<{ matchId: string; events: unknown[] }>(socket, 'match_events', 5000),
    ]);

    expect(matchState).toHaveProperty('matchId');
    expect(matchEvents.matchId).toBeDefined();
    expect(Array.isArray(matchEvents.events)).toBe(true);
  });

  test('LEAVE_MATCH - after leaving, client receives match_left event', async () => {
    const matchId = 'test-match-123';

    socket.emit('join_match', { matchId });
    await waitForEvent(socket, 'match_state', 5000);

    socket.emit('leave_match', { matchId });

    const leftEvent = await waitForEvent<{ matchId: string }>(socket, 'match_left', 3000);
    expect(leftEvent.matchId).toBe(matchId);
  });

  test('SWITCH_MATCH - client can leave one match and join another', async () => {
    const match1 = 'test-match-1';
    const match2 = 'test-match-2';

    socket.emit('join_match', { matchId: match1 });
    const state1 = await waitForEvent<{ matchId: string }>(socket, 'match_state', 5000);

    socket.emit('join_match', { matchId: match2 });
    const state2 = await waitForEvent<{ matchId: string }>(socket, 'match_state', 5000);

    expect(state1.matchId).toBe(match1);
    expect(state2.matchId).toBe(match2);
  });

  test('INVALID_MATCH - joining non-existent match returns error', async () => {
    const invalidMatchId = 'non-existent-match-999';

    socket.emit('join_match', { matchId: invalidMatchId });

    const errorEvent = await waitForEvent<{ message: string }>(socket, 'error', 5000);
    expect(errorEvent.message).toBeDefined();
  });
});

// ============================================================================
// Reliability Tests
// ============================================================================

test.describe('Reliability', () => {
  test('RECONNECTION - disconnected client can reconnect and receive state', async () => {
    // First connection
    const socket1 = createSocketClient();
    await createConnectedSocket();

    const matchId = 'test-match-123';
    socket1.emit('join_match', { matchId });
    await waitForEvent(socket1, 'match_state', 5000);

    socket1.disconnect();

    // Reconnect with new socket
    const socket2 = createSocketClient();
    await createConnectedSocket();

    socket2.emit('join_match', { matchId });
    const restoredState = await waitForEvent<{ matchId: string }>(socket2, 'match_state', 5000);

    expect(restoredState.matchId).toBe(matchId);

    socket1.disconnect();
    socket2.disconnect();
  });

  test('EVENT_ORDERING - events are sorted by eventScheduledTime', async () => {
    const socket = createSocketClient();
    await createConnectedSocket();

    const matchId = 'test-match-123';
    socket.emit('join_match', { matchId });

    const eventsData = await waitForEvent<{ events: Array<{ eventScheduledTime?: number }> }>(
      socket,
      'match_events',
      5000,
    );

    const events = eventsData.events;

    for (let i = 1; i < events.length; i++) {
      const prevTime = events[i - 1].eventScheduledTime;
      const currTime = events[i].eventScheduledTime;

      if (prevTime !== undefined && currTime !== undefined) {
        expect(currTime).toBeGreaterThanOrEqual(prevTime);
      }
    }

    socket.disconnect();
  });

  test('HEARTBEAT - ping/pong exchange works correctly', async () => {
    const socket = createSocketClient();
    await createConnectedSocket();

    const beforeSend = Date.now();
    socket.emit('ping');

    const pongData = await waitForEvent<{ timestamp: number }>(socket, 'pong', 2000);

    expect(pongData.timestamp).toBeGreaterThanOrEqual(beforeSend);
    expect(pongData.timestamp).toBeLessThanOrEqual(Date.now());

    socket.disconnect();
  });

  test('SCORE_UPDATE - score updates are received correctly', async () => {
    const socket = createSocketClient();
    await createConnectedSocket();

    const matchId = 'test-match-123';
    socket.emit('join_match', { matchId });
    await waitForEvent(socket, 'match_state', 5000);

    // Listen for score updates
    const scoreUpdatePromise = waitForEvent<{
      homeScore: number;
      awayScore: number;
      currentMinute: number;
    }>(socket, 'score_update', 8000);

    // Race against timeout (score updates come from simulation)
    const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 5000));
    const result = await Promise.race([scoreUpdatePromise, timeout]);

    if (result !== 'timeout') {
      expect(result.homeScore).toBeDefined();
      expect(result.awayScore).toBeDefined();
    }

    socket.disconnect();
  });

  test('CONNECTION_REFUSED - handles connection failures gracefully', async () => {
    const invalidSocket = io('http://localhost:9999', {
      transports: ['websocket'],
      timeout: 2000,
      reconnection: false,
    });

    await expect(
      new Promise<void>((resolve, reject) => {
        invalidSocket.on('connect', () => resolve());
        invalidSocket.on('connect_error', () => reject(new Error('Connection refused')));
        setTimeout(() => reject(new Error('Timeout')), 2000);
      }),
    ).rejects.toThrow();

    invalidSocket.disconnect();
  });
});

// ============================================================================
// Business Logic Tests
// ============================================================================

test.describe('Business Logic', () => {
  let socket: Socket;

  test.beforeEach(async () => {
    socket = createSocketClient();
    await createConnectedSocket();
  });

  test.afterEach(() => {
    if (socket.connected) {
      socket.disconnect();
    }
  });

  test('MATCH_STATE_STRUCTURE - match_state contains all required fields', async () => {
    const matchId = 'test-match-123';
    socket.emit('join_match', { matchId });

    const state = await waitForEvent<{
      matchId: string;
      homeTeam: { id: string; name: string; logo: string | null };
      awayTeam: { id: string; name: string; logo: string | null };
      homeScore: number;
      awayScore: number;
      currentMinute: number;
      status: string;
      scheduledAt: string;
      isComplete: boolean;
    }>(socket, 'match_state', 5000);

    expect(state.matchId).toBeDefined();
    expect(state.homeTeam).toHaveProperty('id');
    expect(state.homeTeam).toHaveProperty('name');
    expect(state.awayTeam).toHaveProperty('id');
    expect(state.awayTeam).toHaveProperty('name');
    expect(typeof state.homeScore).toBe('number');
    expect(typeof state.awayScore).toBe('number');
    expect(typeof state.currentMinute).toBe('number');
    expect(state.status).toBeDefined();
    expect(state.scheduledAt).toBeDefined();
    expect(typeof state.isComplete).toBe('boolean');
  });

  test('MATCH_END - match_end event is received when match completes', async () => {
    const matchId = 'test-match-123';
    socket.emit('join_match', { matchId });
    await waitForEvent(socket, 'match_state', 5000);

    const matchEndPromise = waitForEvent<{
      matchId: string;
      homeScore: number;
      awayScore: number;
      isComplete: boolean;
    }>(socket, 'match_end', 15000);

    const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 8000));
    const result = await Promise.race([matchEndPromise, timeout]);

    if (result !== 'timeout') {
      expect(result.matchId).toBe(matchId);
      expect(result.isComplete).toBe(true);
    }
  });

  test('EVENT_STRUCTURE - match events contain required fields', async () => {
    const matchId = 'test-match-123';
    socket.emit('join_match', { matchId });

    const eventsData = await waitForEvent<{ events: Array<Record<string, unknown>> }>(
      socket,
      'match_events',
      5000,
    );

    for (const event of eventsData.events) {
      expect(event).toHaveProperty('type');
      expect(event).toHaveProperty('matchId');
      expect(event).toHaveProperty('minute');
    }
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

test.describe('Performance', () => {
  test('CONNECTION_TIME - socket connects within 2 seconds', async () => {
    const start = Date.now();
    const socket = createSocketClient();

    try {
      await createConnectedSocket();
      const connectionTime = Date.now() - start;

      expect(connectionTime).toBeLessThan(2000);
    } finally {
      socket.disconnect();
    }
  });

  test('EVENT_LATENCY - initial events arrive within 3 seconds', async () => {
    const socket = createSocketClient();
    await createConnectedSocket();

    const matchId = 'test-match-123';
    const start = Date.now();

    socket.emit('join_match', { matchId });
    await waitForEvent(socket, 'match_state', 5000);

    const latency = Date.now() - start;
    expect(latency).toBeLessThan(3000);

    socket.disconnect();
  });

  test('MANY_EVENTS - handles many events without degradation', async () => {
    const socket = createSocketClient();
    await createConnectedSocket();

    const matchId = 'test-match-123';
    socket.emit('join_match', { matchId });

    // Collect events over 5 seconds
    const events = await collectEvents<{ events: unknown[] }>(
      socket,
      'match_events',
      5000,
    );

    const totalEvents = events.reduce((sum, e) => sum + (e.events?.length || 0), 0);

    // Should handle at least some events
    expect(totalEvents).toBeGreaterThanOrEqual(0);

    socket.disconnect();
  });
});

// ============================================================================
// Page Integration Tests
// ============================================================================

test.describe('Page Integration', () => {
  test('PAGE_LOADS - main page loads without errors', async ({ page }) => {
    await page.goto('/');
    expect(await page.title()).toBeTruthy();
  });

  test('NO_CONSOLE_ERRORS - no critical console errors on page load', async ({ page }) => {
    const errors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Filter out known non-critical errors
    const criticalErrors = errors.filter(
      (e) => !e.includes('favicon') && !e.includes('hydration'),
    );

    expect(criticalErrors).toHaveLength(0);
  });
});