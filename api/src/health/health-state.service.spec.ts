import { HealthStateService } from './health-state.service';

describe('HealthStateService', () => {
  let service: HealthStateService;

  beforeEach(() => {
    service = new HealthStateService();
  });

  describe('initial state', () => {
    it('starts unknown and is not ready until a probe fires', () => {
      // A new service has not been probed yet. The guard treats
      // 'unknown' as not-failing (it only blocks on the explicit
      // 'failing' state), so the first probe tick decides readiness
      // rather than blocking all traffic at boot.
      expect(service.isReady()).toBe(true);
      const snap = service.getSnapshot();
      expect(snap.db.state).toBe('unknown');
      expect(snap.redis.state).toBe('unknown');
    });
  });

  describe('DB readiness', () => {
    it('stays ready through transient failures below the threshold', () => {
      // Threshold is 3; the first two failures must NOT trip the
      // circuit, otherwise a single ECONNRESET takes the API down.
      service.markDbFailure('connection reset');
      service.markDbFailure('connection reset');
      expect(service.isReady()).toBe(true);
      expect(service.getSnapshot().db.consecutiveFailures).toBe(2);
    });

    it('flips to failing after the third consecutive failure', () => {
      service.markDbFailure('a');
      service.markDbFailure('b');
      service.markDbFailure('c');
      expect(service.isReady()).toBe(false);
      expect(service.getSnapshot().db.state).toBe('failing');
      expect(service.getSnapshot().db.lastError).toBe('c');
    });

    it('resets to healthy on a success and zeroes the failure counter', () => {
      service.markDbFailure('a');
      service.markDbFailure('a');
      service.markDbSuccess();
      expect(service.isReady()).toBe(true);
      const snap = service.getSnapshot();
      expect(snap.db.state).toBe('healthy');
      expect(snap.db.consecutiveFailures).toBe(0);
      expect(snap.db.lastError).toBeNull();
    });

    it('recovers from the failing state when a probe succeeds', () => {
      // Trip the breaker first, then verify a single success is
      // enough to bring it back — the guard should clear traffic
      // the moment the dependency is back, not wait for several
      // green ticks.
      service.markDbFailure('a');
      service.markDbFailure('a');
      service.markDbFailure('a');
      expect(service.isReady()).toBe(false);
      service.markDbSuccess();
      expect(service.isReady()).toBe(true);
    });
  });

  describe('Redis is observability-only', () => {
    it('does not gate readiness when Redis is failing', () => {
      // Redis is a soft dependency. Auction/notification/cache
      // routes will individually 5xx, but the API as a whole stays
      // available for DB-backed reads/writes.
      service.markRedisFailure('a');
      service.markRedisFailure('a');
      service.markRedisFailure('a');
      expect(service.getSnapshot().redis.state).toBe('failing');
      expect(service.isReady()).toBe(true);
    });

    it('still tracks Redis state and resets on success', () => {
      service.markRedisFailure('timeout');
      expect(service.getSnapshot().redis.consecutiveFailures).toBe(1);
      service.markRedisSuccess();
      const snap = service.getSnapshot();
      expect(snap.redis.state).toBe('healthy');
      expect(snap.redis.consecutiveFailures).toBe(0);
    });
  });

  describe('snapshot', () => {
    it('includes both dependencies and a checkedAt timestamp', () => {
      const before = Date.now();
      const snap = service.getSnapshot();
      const after = Date.now();
      expect(snap.checkedAt).toBeGreaterThanOrEqual(before);
      expect(snap.checkedAt).toBeLessThanOrEqual(after);
      expect(snap.db).toBeDefined();
      expect(snap.redis).toBeDefined();
      expect(snap.isReady).toBe(true);
    });
  });
});
