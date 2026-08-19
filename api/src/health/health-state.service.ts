import { Injectable } from '@nestjs/common';

export type DependencyState = 'healthy' | 'failing' | 'unknown';

export interface DependencyStatus {
  state: DependencyState;
  consecutiveFailures: number;
  lastCheckedAt: number | null;
  lastError: string | null;
}

export interface HealthSnapshot {
  isReady: boolean;
  db: DependencyStatus;
  redis: DependencyStatus;
  checkedAt: number;
}

/**
 * In-memory cache of dependency liveness for the readiness probe +
 * fail-fast guard. The actual `SELECT 1` / `PING` calls run on a
 * background interval in `HealthProbeService`; this service just
 * stores the latest result and exposes it cheaply to the request path.
 *
 * Why in-memory and not per-request probing:
 *   - A request handler that does its own `SELECT 1` on every call
 *     multiplies DB load by `maxConnections × RPS` during an outage.
 *   - Per-request probing also adds 1-2s latency (the probe timeout)
 *     to every user request, not just the failing ones.
 *   - Probing on a 5s tick is enough granularity for K8s readiness
 *     (default probe period is 10s) and stays cheap.
 *
 * The threshold (3 consecutive failures = flip to 'failing') is
 * tuned so a single transient ECONNRESET doesn't take the service
 * down, but a ~15s outage (3 ticks × 5s) does.
 */
@Injectable()
export class HealthStateService {
  static readonly FAILURE_THRESHOLD = 3;

  private db: DependencyStatus = {
    state: 'unknown',
    consecutiveFailures: 0,
    lastCheckedAt: null,
    lastError: null,
  };
  private redis: DependencyStatus = {
    state: 'unknown',
    consecutiveFailures: 0,
    lastCheckedAt: null,
    lastError: null,
  };

  markDbSuccess(): void {
    this.db = {
      state: 'healthy',
      consecutiveFailures: 0,
      lastCheckedAt: Date.now(),
      lastError: null,
    };
  }

  markDbFailure(err: string): void {
    const next = this.db.consecutiveFailures + 1;
    this.db = {
      state:
        next >= HealthStateService.FAILURE_THRESHOLD
          ? 'failing'
          : this.db.state,
      consecutiveFailures: next,
      lastCheckedAt: Date.now(),
      lastError: err,
    };
  }

  markRedisSuccess(): void {
    this.redis = {
      state: 'healthy',
      consecutiveFailures: 0,
      lastCheckedAt: Date.now(),
      lastError: null,
    };
  }

  markRedisFailure(err: string): void {
    const next = this.redis.consecutiveFailures + 1;
    this.redis = {
      // Redis is a soft dependency — auction/notification/cache
      // can degrade without bringing the API down. We still track
      // failures for observability, but `isReady()` only consults
      // the DB status.
      state:
        next >= HealthStateService.FAILURE_THRESHOLD
          ? 'failing'
          : this.redis.state,
      consecutiveFailures: next,
      lastCheckedAt: Date.now(),
      lastError: err,
    };
  }

  /**
   * Hard-dependency gate: only DB readiness blocks incoming traffic.
   * The API can serve DB-backed reads/writes while Redis is down;
   * auction/notification routes will individually 503, but the bulk
   * of the surface stays available.
   */
  isReady(): boolean {
    return this.db.state !== 'failing';
  }

  getSnapshot(): HealthSnapshot {
    return {
      isReady: this.isReady(),
      db: { ...this.db },
      redis: { ...this.redis },
      checkedAt: Date.now(),
    };
  }

  /** Test-only: reset state between cases. */
  resetForTests(): void {
    this.db = {
      state: 'unknown',
      consecutiveFailures: 0,
      lastCheckedAt: null,
      lastError: null,
    };
    this.redis = {
      state: 'unknown',
      consecutiveFailures: 0,
      lastCheckedAt: null,
      lastError: null,
    };
  }
}
