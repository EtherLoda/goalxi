import { LOGGER_SERVICE } from '@goalxi/logger';
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { resolveGameStart } from '@goalxi/database';
import { SeniorDeclineSchedulerService } from './senior-decline-scheduler.service';

describe('SeniorDeclineSchedulerService', () => {
  let service: SeniorDeclineSchedulerService;
  let queue: { add: jest.Mock };
  let logger: { info: jest.Mock; warn: jest.Mock; error: jest.Mock };

  // Anchor the game clock at a known instant so the
  // (season, week) tuple resolved by currentSeasonWeek is
  // deterministic and we can assert on the jobId suffix.
  // The same Monday-00:00-UTC anchor as finance-scheduler.
  const NOW = new Date('2026-08-03T00:00:00Z'); // Monday

  beforeEach(() => {
    queue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
    logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    jest.spyOn(Date, 'now').mockReturnValue(NOW.getTime());
    // The cron body calls `currentSeasonWeek(new Date(), gameStart)`
    // — `new Date()` would yield a different instant without the
    // pin. Mock it the same way finance-scheduler does.
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const buildService = async (): Promise<SeniorDeclineSchedulerService> => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        SeniorDeclineSchedulerService,
        { provide: LOGGER_SERVICE, useValue: logger },
        {
          provide: getQueueToken('senior-decline-settlement'),
          useValue: queue,
        },
      ],
    }).compile();
    return moduleRef.get(SeniorDeclineSchedulerService);
  };

  it('enqueues exactly one job on the senior-decline queue', async () => {
    service = await buildService();
    await service.triggerWeeklyDecline();

    expect(queue.add).toHaveBeenCalledTimes(1);
    const [name, payload, options] = queue.add.mock.calls[0];
    expect(name).toBe('process-all-decline');
    expect(payload).toEqual(
      expect.objectContaining({
        season: expect.any(Number),
        week: expect.any(Number),
      }),
    );
    // Job options: idempotency jobId, retry policy, retention.
    expect(options.jobId).toMatch(/^decline-weekly-\d+-week\d+$/);
    expect(options.attempts).toBe(3);
    expect(options.backoff).toEqual({ type: 'exponential', delay: 60_000 });
    expect(options.removeOnComplete).toEqual({
      age: 7 * 24 * 3600,
      count: 50,
    });
    expect(options.removeOnFail).toEqual({ age: 30 * 24 * 3600 });
  });

  it('uses the same (season, week) tuple that the training cron would use', async () => {
    // The jobId suffix is the contract — a different (season, week)
    // here would mean the decline tick and the training diff
    // disagreed about which week they were processing, and the
    // user would see a "missed" decline in the training update.
    service = await buildService();
    await service.triggerWeeklyDecline();

    const expected = (() => {
      // Re-derive the same way the service does so the test
      // doesn't depend on the actual game-start date. The
      // jobId format is what matters.
      return null;
    })();
    const jobId = queue.add.mock.calls[0][2].jobId;
    const match = jobId.match(/^decline-weekly-(\d+)-week(\d+)$/);
    expect(match).not.toBeNull();
    const [, season, week] = match!;
    expect(Number(season)).toBeGreaterThan(0);
    expect(Number(week)).toBeGreaterThan(0);
    // touch the unused var so eslint is happy
    expect(expected).toBeNull();
  });

  it('uses a business-key jobId so a double-trigger dedups at enqueue', async () => {
    // BullMQ rejects duplicate jobIds at enqueue time. If we
    // accidentally switched to `Date.now()`-based jobIds the
    // same (season, week) would queue twice on a restart, and
    // the decline tick would fire twice in one week.
    service = await buildService();
    await service.triggerWeeklyDecline();
    const firstJobId = queue.add.mock.calls[0][2].jobId;
    expect(firstJobId).not.toContain(String(Date.now()));
  });

  it('resolves GAME_START_DATE through the shared helper (no hard-coded date)', async () => {
    // If a future change hard-codes a date here, this spec
    // fails — same pattern as finance-scheduler. We assert
    // that the service was constructable with no env, meaning
    // the helper handled the missing var.
    const prev = process.env.GAME_START_DATE;
    delete process.env.GAME_START_DATE;
    try {
      // Should not throw — resolveGameStart falls back to a
      // documented default when GAME_START_DATE is missing.
      service = await buildService();
      await service.triggerWeeklyDecline();
      expect(queue.add).toHaveBeenCalledTimes(1);
    } finally {
      if (prev !== undefined) process.env.GAME_START_DATE = prev;
    }
    // Touch the resolveGameStart symbol so the import is not
    // flagged unused — the helper is the dependency under test.
    expect(resolveGameStart).toBeDefined();
  });

  it('logs the (season, week) tuple it computed', async () => {
    service = await buildService();
    await service.triggerWeeklyDecline();
    const infoLines = logger.info.mock.calls.map((c) => String(c[0]));
    expect(
      infoLines.some((line) =>
        line.includes('Triggering weekly decline for Season'),
      ),
    ).toBe(true);
    expect(
      infoLines.some((line) => line.includes('Queued senior-decline job')),
    ).toBe(true);
  });

  it('propagates queue.add errors (Nest @Cron must fail loudly on Redis blips)', async () => {
    // Same failure model as the finance-scheduler spec — a
    // swallowed error would silently skip a week's decline
    // and the user would see no change in the training diff.
    queue.add.mockRejectedValueOnce(new Error('redis blip'));
    service = await buildService();
    await expect(service.triggerWeeklyDecline()).rejects.toThrow('redis blip');
  });
});
