import { LOGGER_SERVICE } from '@goalxi/logger';
import { getQueueToken } from '@nestjs/bullmq';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { PlayerEntity } from '@goalxi/database';
import { PlayerWageSchedulerService } from './player-wage-scheduler.service';

describe('PlayerWageSchedulerService (regression for #A — jobId dedup)', () => {
  let service: PlayerWageSchedulerService;
  let queue: { add: jest.Mock };
  let playerRepo: { createQueryBuilder: jest.Mock };
  let logger: { info: jest.Mock; warn: jest.Mock; error: jest.Mock };

  // Anchor the game-clock at a known instant so the test
  // doesn't drift on the day it runs.
  const NOW = new Date('2026-08-06T00:00:00Z');
  const TODAY_GAME_DAY = Math.floor(
    (NOW.getTime() - Date.UTC(1970, 0, 1)) / 86_400_000,
  );

  const buildQueryBuilder = (
    rows: Array<{ id: number; name: string }>,
    birthdayGameDays?: Record<number, number>,
  ) => {
    // Defaults: every row's birthday falls on TODAY_GAME_DAY.
    const map: Record<number, number> =
      birthdayGameDays ??
      Object.fromEntries(rows.map((r) => [r.id, TODAY_GAME_DAY]));

    const qb: any = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getRawAndEntities: jest.fn().mockResolvedValue({
        entities: rows,
        raw: rows.map((r) => ({
          player_id: r.id,
          birthdayGameDay: map[r.id],
        })),
      }),
      getMany: jest.fn().mockResolvedValue(rows),
    };
    return qb;
  };

  beforeEach(() => {
    queue = { add: jest.fn().mockResolvedValue({ id: 'job' }) };
    playerRepo = { createQueryBuilder: jest.fn() };
    logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    // Pin the wall clock to the anchored NOW so the service's
    // computeTodayGameDay() resolves to TODAY_GAME_DAY. Without
    // this, gameDay would drift to whatever real day the test
    // runs on and break the jobId suffix assertion.
    jest.spyOn(Date, 'now').mockReturnValue(NOW.getTime());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const buildService = async (): Promise<PlayerWageSchedulerService> => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayerWageSchedulerService,
        { provide: LOGGER_SERVICE, useValue: logger },
        { provide: getQueueToken('player-wage'), useValue: queue },
        {
          provide: getRepositoryToken(PlayerEntity),
          useValue: playerRepo,
        },
      ],
    }).compile();
    return moduleRef.get(PlayerWageSchedulerService);
  };

  it('uses a business jobId (playerId + gameDay), not Date.now()', async () => {
    playerRepo.createQueryBuilder.mockReturnValueOnce(buildQueryBuilder([]));
    service = await buildService();

    await service.processBirthdayWageUpdates();

    // No players with a birthday today -> no `add` call at all.
    // (Different assertion shape from the other tests; this
    // one is about the empty path, not about jobId content.)
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('emits one job per birthday player, all with the same gameDay suffix', async () => {
    const players = [
      { id: 101, name: 'Alice' },
      { id: 102, name: 'Bob' },
      { id: 103, name: 'Carlos' },
    ];
    playerRepo.createQueryBuilder.mockReturnValueOnce(
      buildQueryBuilder(players),
    );
    service = await buildService();

    await service.processBirthdayWageUpdates();

    expect(queue.add).toHaveBeenCalledTimes(3);
    const jobIds = queue.add.mock.calls.map((c) => c[2].jobId);
    expect(jobIds).toEqual([
      `birthday-wage-101-${TODAY_GAME_DAY}`,
      `birthday-wage-102-${TODAY_GAME_DAY}`,
      `birthday-wage-103-${TODAY_GAME_DAY}`,
    ]);
    // No timestamp leakage.
    for (const id of jobIds) {
      expect(id).not.toMatch(/^\d{10,}$/);
    }
  });

  it('different gameDays produce different jobIds for the same player', async () => {
    // Sanity check on the dedup boundary: yesterday's
    // jobId and today's jobId for the same player must be
    // distinct so a stale queued job can't resurrect.
    const yesterday = TODAY_GAME_DAY - 1;
    const today = TODAY_GAME_DAY;
    expect(`birthday-wage-1-${yesterday}`).not.toBe(`birthday-wage-1-${today}`);
  });

  it('attaches attempts + backoff so a transient DB blip retries', async () => {
    playerRepo.createQueryBuilder.mockReturnValueOnce(
      buildQueryBuilder([{ id: 1, name: 'A' }]),
    );
    service = await buildService();

    await service.processBirthdayWageUpdates();

    const opts = queue.add.mock.calls[0][2];
    expect(opts.attempts).toBe(3);
    expect(opts.backoff).toEqual({ type: 'exponential', delay: 30_000 });
  });

  it('reports a partial enqueue at ERROR so the miss is visible', async () => {
    playerRepo.createQueryBuilder.mockReturnValueOnce(
      buildQueryBuilder([{ id: 1, name: 'A' }]),
    );
    queue.add.mockRejectedValueOnce(new Error('redis is down'));
    service = await buildService();

    await expect(service.processBirthdayWageUpdates()).resolves.toBeUndefined();

    // Partial enqueue means these players' wages stay stale, so it
    // is reported at ERROR (not WARN) and names the recovery path.
    const errCalls = logger.error.mock.calls.map((c) => String(c[0]));
    expect(
      errCalls.some(
        (line) =>
          line.includes('Partial enqueue') && line.includes('catch-up'),
      ),
    ).toBe(true);
  });

  it('surfaces a player-query failure instead of swallowing it', async () => {
    playerRepo.createQueryBuilder.mockReturnValueOnce({
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getRawAndEntities: jest
        .fn()
        .mockRejectedValue(new Error('postgres gone')),
    });
    service = await buildService();

    // The old code wrapped the whole cron body in
    // catch { logger.error(...) }, so a DB blip at 00:00 was invisible
    // and the game-day's birthdays were lost for 112 game-days. It
    // now propagates so the failure is reportable, and the scan's
    // catch-up window recovers the missed players on the next runs.
    await expect(service.processBirthdayWageUpdates()).rejects.toThrow(
      'postgres gone',
    );

    expect(queue.add).not.toHaveBeenCalled();
  });

  it('REGRESSION: scans a catch-up window, not just today', async () => {
    // The scan trigger was an exact modulus and `@Cron` has no retry,
    // so one DB blip at 00:00 meant that game-day's birthdays were lost
    // for 112 game-days. The window makes the miss self-healing.
    const rows = [{ id: 1, name: 'Today' }, { id: 2, name: 'Yesterday' }];
    const qb = buildQueryBuilder(rows, {
      1: TODAY_GAME_DAY,
      2: TODAY_GAME_DAY - 1,
    });
    playerRepo.createQueryBuilder.mockReturnValueOnce(qb);
    service = await buildService();

    await service.processBirthdayWageUpdates();

    // The WHERE must be a window, not an equality.
    const whereSql = qb.where.mock.calls[0][0] as string;
    expect(whereSql).toContain('BETWEEN');
    expect(whereSql).not.toMatch(/112\)\s*=\s*0/);

    // The catch-up player is queued, keyed on its OWN birthday
    // game-day so it dedupes against the run that missed it.
    expect(queue.add).toHaveBeenCalledTimes(2);
    const jobIds = queue.add.mock.calls.map((c) => c[2].jobId);
    expect(jobIds).toContain(`birthday-wage-2-${TODAY_GAME_DAY - 1}`);

    // And the recovery path is logged.
    const infoCalls = logger.info.mock.calls.map((c) => String(c[0]));
    expect(infoCalls.some((l) => l.includes('Catch-up'))).toBe(true);
  });

  it('REGRESSION: filters BOT teams at the enqueue side', async () => {
    // The processor skips BOT players, but the enqueue filter only
    // checked `is_youth = false`. With ~70% of the pyramid being BOT,
    // ~70% of every daily enqueue was a dead job.
    const rows = [{ id: 1, name: 'A' }];
    const qb = buildQueryBuilder(rows);
    playerRepo.createQueryBuilder.mockReturnValueOnce(qb);
    service = await buildService();

    await service.processBirthdayWageUpdates();

    expect(qb.leftJoin).toHaveBeenCalledWith(
      'team',
      'team.id = player.team_id',
    );
    const predicates = qb.andWhere.mock.calls.map((c) => String(c[0]));
    expect(predicates).toContain('player.is_youth = false');
    expect(
      predicates.some((p) => p.includes('is_bot = false')),
    ).toBe(true);
  });
});
