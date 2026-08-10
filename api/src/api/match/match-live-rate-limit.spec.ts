import {
  DEFAULT_RATE_LIMIT_CONFIG,
  evaluateConnection,
  evaluateDisconnect,
} from './match-live-rate-limit';

/**
 * S2 spec — covers the pure rate-limit helper. The gateway's
 * `handleConnection` / `handleDisconnect` logic is mostly a thin
 * wrapper around this; pinning the helper in isolation means a
 * regression here fails fast, before we have to spin up socket.io
 * mocks in the gateway spec.
 */
describe('match-live-rate-limit (S2)', () => {
  const cfg = DEFAULT_RATE_LIMIT_CONFIG;

  describe('evaluateConnection', () => {
    it('accepts the very first connection from an IP and increments state', () => {
      const result = evaluateConnection(undefined, 1_000, cfg);
      expect(result.accept).toBe(true);
      if (result.accept) {
        expect(result.next.activeSocketCount).toBe(1);
        expect(result.next.connectTimestamps).toEqual([1_000]);
      }
    });

    it('rejects when the active-socket cap is hit, even if the rate window is empty', () => {
      // Cap-first ordering is load-bearing: a misbehaving client
      // shouldn't be able to keep the rate-limit window "full" by
      // hammering the cap repeatedly.
      const saturated = {
        connectTimestamps: [],
        activeSocketCount: cfg.maxActiveSockets,
      };
      const result = evaluateConnection(saturated, 2_000, cfg);
      expect(result).toEqual({ accept: false, reason: 'active_cap' });
    });

    it('rejects when the sliding-window rate is hit, but does not advance the window', () => {
      // 3 connects at t=0..2 already on the books. A 4th at t=2.5
      // should be rejected. Crucially the returned state should NOT
      // include the rejected attempt's timestamp, otherwise the
      // window would never drain.
      const state = {
        connectTimestamps: [0, 1_000, 2_000],
        activeSocketCount: 3,
      };
      const result = evaluateConnection(state, 2_500, cfg);
      expect(result).toEqual({ accept: false, reason: 'rate_limited' });
    });

    it('accepts a new connection once the sliding window has drained', () => {
      // Old attempts at t=0, 1_000, 2_000:
      //   t=5_500 - 0     = 5_500  → evict (>= windowMs)
      //   t=5_500 - 1_000 = 4_500  → keep
      //   t=5_500 - 2_000 = 3_500  → keep
      // so the new attempt at t=5_500 sees 2 entries still in window,
      // which is under maxConnectsPerWindow=3, and is accepted.
      const state = {
        connectTimestamps: [0, 1_000, 2_000],
        activeSocketCount: 3,
      };
      const result = evaluateConnection(state, 5_500, cfg);
      expect(result.accept).toBe(true);
      if (result.accept) {
        expect(result.next.connectTimestamps).toEqual([1_000, 2_000, 5_500]);
        expect(result.next.activeSocketCount).toBe(4);
      }
    });

    it('keeps partial history within the window and prunes the rest', () => {
      // t=0 is > 5s old at t=5_500, so it should be dropped; t=3_000
      // and t=4_000 stay; t=5_500 added.
      const state = {
        connectTimestamps: [0, 3_000, 4_000],
        activeSocketCount: 3,
      };
      const result = evaluateConnection(state, 5_500, cfg);
      expect(result.accept).toBe(true);
      if (result.accept) {
        expect(result.next.connectTimestamps).toEqual([3_000, 4_000, 5_500]);
        expect(result.next.activeSocketCount).toBe(4);
      }
    });
  });

  describe('evaluateDisconnect', () => {
    it('decrements the active-socket counter by 1', () => {
      const next = evaluateDisconnect({
        connectTimestamps: [1_000, 2_000],
        activeSocketCount: 4,
      });
      expect(next.activeSocketCount).toBe(3);
      // Timestamps are intentionally not pruned on disconnect — the
      // rate window should track attempt history regardless of how
      // many sockets are currently open. Window pruning happens on
      // the next `evaluateConnection` call.
      expect(next.connectTimestamps).toEqual([1_000, 2_000]);
    });

    it('floors at 0 to survive a stray double-disconnect', () => {
      // socket.io can fire `disconnect` after we already tore down
      // the socket on rate-limit rejection (the increment never
      // happened, so we'd be decrementing from 0).
      const next = evaluateDisconnect({
        connectTimestamps: [],
        activeSocketCount: 0,
      });
      expect(next.activeSocketCount).toBe(0);
    });
  });
});
