import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Logger } from '@nestjs/common';
import { MatchCacheService } from './match-cache.service';

/**
 * Regression spec for the fail-CLOSED `isMatchProcessed` change.
 *
 * Before the fix, a cache error caused `isMatchProcessed` to return
 * `false` (fail-open), which made the dedup check miss on transient
 * Redis blips. The match-completion service then re-ran on an
 * already-processed match and double-counted every player's
 * goals/assists/yellow/red cards in `careerStats.club`. The fix
 * flips this to fail-CLOSED: on any cache error, return `true` and
 * skip the match. Skipping a match that hasn't been processed yet
 * is recoverable (manual re-enqueue once Redis is back); double-
 * counting requires a DB cleanup pass to undo. We pick the
 * recoverable failure mode.
 */
describe('MatchCacheService.isMatchProcessed (fail-CLOSED)', () => {
  let service: MatchCacheService;
  let cacheGet: jest.Mock;

  // Silence the noisy error log; we expect it to fire in the
  // error-path test and want the test output to stay readable.
  const loggerErrorSpy = jest
    .spyOn(Logger.prototype, 'error')
    .mockImplementation(() => undefined);

  beforeEach(async () => {
    cacheGet = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchCacheService,
        { provide: CACHE_MANAGER, useValue: { get: cacheGet } },
      ],
    }).compile();
    service = module.get<MatchCacheService>(MatchCacheService);
    loggerErrorSpy.mockClear();
  });

  afterAll(() => {
    loggerErrorSpy.mockRestore();
  });

  it('returns true when the cache flag is set', async () => {
    cacheGet.mockResolvedValue(true);
    await expect(service.isMatchProcessed('match-A')).resolves.toBe(true);
    expect(cacheGet).toHaveBeenCalledWith('match_stats_processed:match-A');
  });

  it('returns false when the cache flag is missing', async () => {
    cacheGet.mockResolvedValue(undefined);
    await expect(service.isMatchProcessed('match-B')).resolves.toBe(false);
  });

  it('returns false when the cache flag is explicitly falsy', async () => {
    cacheGet.mockResolvedValue(null);
    await expect(service.isMatchProcessed('match-C')).resolves.toBe(false);
  });

  // The behavioural test for the fix. A Redis blip during dedup
  // MUST NOT cause a re-run. If anyone ever flips this back to
  // `return false`, the next flush of Redis will double-count every
  // player stat in production.
  it('returns true (fail-CLOSED) when the cache throws', async () => {
    cacheGet.mockRejectedValue(new Error('Redis ECONNREFUSED'));
    await expect(service.isMatchProcessed('match-D')).resolves.toBe(true);
    // The error must be logged loudly so the operator notices the
    // dedup bypass rather than silently skipping matches.
    expect(loggerErrorSpy).toHaveBeenCalled();
    const logged = loggerErrorSpy.mock.calls[0][0] as string;
    expect(logged).toMatch(/match-D/);
    expect(logged).toMatch(/CLOSED/);
  });

  it('still skips matches when the cache key is genuinely absent (regression guard)', async () => {
    // Sanity check that the fail-CLOSED branch is reached only on
    // thrown errors, not on every "key not present" case. Without
    // this test a future refactor could over-broaden the catch and
    // skip processing for every match.
    cacheGet.mockResolvedValue(undefined);
    await expect(service.isMatchProcessed('match-E')).resolves.toBe(false);
  });
});
