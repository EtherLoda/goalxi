/**
 * match-live-rate-limit.ts — per-IP connection rate limit + active socket
 * cap for the live match WebSocket gateway.
 *
 * S2 from the live page review: the gateway previously accepted any
 * number of new connections from the same IP and let any single IP
 * hold an arbitrary number of open sockets. A misbehaving client (or
 * a small botnet) could open thousands of sockets and tie up gateway
 * resources + force repeated `getMatchState` / `getVisibleEvents` DB
 * reads on `join_match`.
 *
 * This module is a pure helper — no I/O, no socket reference — so the
 * rate-limit rules are testable without a live socket.io client. The
 * gateway owns the in-memory `Map<ip, IpState>` and calls into these
 * functions on connect / disconnect.
 *
 * Note on multi-instance deployments: the rate limit is in-memory per
 * Nest process. A 3-replica deployment therefore allows up to
 * `RATE_LIMIT_MAX_CONNECTS * 3` new connections per IP per window.
 * That's still bounded (a few dozen per 5s) and is a deliberate
 * trade-off vs. adding a Redis-backed counter. Revisit when gateway
 * scales beyond 2-3 instances.
 */

export interface IpRateState {
  /** Timestamps of recent `handleConnection` invocations (oldest first). */
  connectTimestamps: number[];
  /** Currently-open sockets from this IP. Decremented in `handleDisconnect`. */
  activeSocketCount: number;
}

export interface RateLimitConfig {
  /** Sliding-window length, in milliseconds. */
  windowMs: number;
  /** Max new connections allowed within `windowMs` per IP. */
  maxConnectsPerWindow: number;
  /** Max simultaneously-open sockets allowed per IP. */
  maxActiveSockets: number;
}

export type AcceptResult =
  | { accept: true; next: IpRateState }
  | { accept: false; reason: 'rate_limited' | 'active_cap' };

/**
 * Decide whether a new connection from `ip` should be accepted and
 * return the updated state in one pass. Pure: the caller owns the
 * `Map<ip, IpRateState>` and persists `next` back into it.
 *
 * Rules (in evaluation order):
 *   1. Active socket cap — if the IP already has `maxActiveSockets`
 *      open, reject immediately. Done first so an attacker can't
 *      keep rotating the rate-limit window.
 *   2. Sliding-window rate — count `connectTimestamps` falling
 *      within the last `windowMs`. If the count is at
 *      `maxConnectsPerWindow`, reject. Otherwise record this attempt
 *      and accept.
 *
 * Returning `accept: false` does NOT mutate the caller's map — the
 * caller is expected to leave the previous state alone (active count
 * never went up; rate window was not advanced because we never got
 * the chance to record the would-be attempt).
 */
export function evaluateConnection(
  current: IpRateState | undefined,
  now: number,
  config: RateLimitConfig,
): AcceptResult {
  const prev: IpRateState = current ?? {
    connectTimestamps: [],
    activeSocketCount: 0,
  };

  // Rule 1: active socket cap. Checked first so the rate-limit
  // window doesn't get "burned" by a connection we never accepted.
  if (prev.activeSocketCount >= config.maxActiveSockets) {
    return { accept: false, reason: 'active_cap' };
  }

  // Rule 2: sliding-window rate. Drop expired timestamps first so
  // the array doesn't grow unboundedly for long-lived clients.
  const fresh = prev.connectTimestamps.filter(
    (t) => now - t < config.windowMs,
  );
  if (fresh.length >= config.maxConnectsPerWindow) {
    return { accept: false, reason: 'rate_limited' };
  }

  return {
    accept: true,
    next: {
      connectTimestamps: [...fresh, now],
      activeSocketCount: prev.activeSocketCount + 1,
    },
  };
}

/**
 * Decrement the active-socket counter on disconnect. Pure: the caller
 * is expected to persist `next` back into the map. The active-socket
 * cap floor at 0 protects against a stray double-disconnect (socket.io
 * can fire `disconnect` after the server has already torn down the
 * socket on rate-limit rejection).
 */
export function evaluateDisconnect(current: IpRateState): IpRateState {
  return {
    connectTimestamps: current.connectTimestamps,
    activeSocketCount: Math.max(0, current.activeSocketCount - 1),
  };
}

/**
 * Default config used by the gateway. Exported so the spec can assert
 * the values without duplicating magic numbers in tests.
 */
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  windowMs: 5_000,
  maxConnectsPerWindow: 3,
  maxActiveSockets: 5,
};
