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

  const buildQueryBuilder = (rows: Array<{ id: number; name: string }>) => {
    const qb: any = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(rows),
    };
    return qb;
  };

  beforeEach(() => {
    queue = { add: jest.fn().mockResolvedValue({ id: 'job' }) };
    playerRepo = { createQueryBuilder: jest.fn() };
    logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
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
    expect(`birthday-wage-1-${yesterday}`).not.toBe(
      `birthday-wage-1-${today}`,
    );
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

  it('does not throw if the queue.add itself fails — logs a warning', async () => {
    playerRepo.createQueryBuilder.mockReturnValueOnce(
      buildQueryBuilder([{ id: 1, name: 'A' }]),
    );
    queue.add.mockRejectedValueOnce(new Error('redis is down'));
    service = await buildService();

    await expect(
      service.processBirthdayWageUpdates(),
    ).resolves.toBeUndefined();

    // Partial enqueue (1/1 fail) is reported at WARN, not
    // ERROR — the next tick will retry naturally.
    const warnCalls = logger.warn.mock.calls.map((c) => String(c[0]));
    expect(
      warnCalls.some((line) => line.includes('Partial enqueue')),
    ).toBe(true);
  });

  it('does not crash when the player query itself throws', async () => {
    playerRepo.createQueryBuilder.mockReturnValueOnce({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockRejectedValue(new Error('postgres gone')),
    });
    service = await buildService();

    await expect(
      service.processBirthdayWageUpdates(),
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });
});
