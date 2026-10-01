import { currentSeasonWeek } from '@goalxi/database';
import { LOGGER_SERVICE } from '@goalxi/logger';
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { WeeklySettlementService } from './weekly-settlement.service';
import { cronLockPassThrough } from '../test-utils/cron-lock-mock';

/**
 * Unit-level regression for the weekly-settlement idempotency
 * contract. We don't boot a full Nest container here — the
 * service is a thin coordinator over five queue refs, so a
 * TestingModule with the queues mocked is enough.
 */
describe('WeeklySettlementService', () => {
  let service: WeeklySettlementService;
  let queues: {
    training: { add: jest.Mock };
    condition: { add: jest.Mock };
    construction: { add: jest.Mock };
    youth: { add: jest.Mock };
    fan: { add: jest.Mock };
  };
  let logger: {
    info: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    debug: jest.Mock;
  };

  beforeEach(() => {
    queues = {
      training: { add: jest.fn().mockResolvedValue({ id: 'training-job' }) },
      condition: { add: jest.fn().mockResolvedValue({ id: 'condition-job' }) },
      construction: {
        add: jest.fn().mockResolvedValue({ id: 'construction-job' }),
      },
      youth: { add: jest.fn().mockResolvedValue({ id: 'youth-job' }) },
      fan: { add: jest.fn().mockResolvedValue({ id: 'fan-job' }) },
    };
    logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
  });

  const buildService = async (): Promise<WeeklySettlementService> => {
    const moduleRef = await Test.createTestingModule({
      providers: [
      cronLockPassThrough,
        WeeklySettlementService,
        { provide: LOGGER_SERVICE, useValue: logger },
        {
          provide: getQueueToken('training-settlement'),
          useValue: queues.training,
        },
        {
          provide: getQueueToken('condition-settlement'),
          useValue: queues.condition,
        },
        {
          provide: getQueueToken('construction-settlement'),
          useValue: queues.construction,
        },
        {
          provide: getQueueToken('youth-progression-settlement'),
          useValue: queues.youth,
        },
        { provide: getQueueToken('fan-settlement'), useValue: queues.fan },
      ],
    }).compile();
    return moduleRef.get(WeeklySettlementService);
  };

  it('uses business jobIds anchored to (season, week) — not Date.now()', async () => {
    service = await buildService();

    await service.processWeeklySettlement();

    // Compute what season/week the service *should* report given
    // the default gameStart (2026-04-06). The jobId should encode
    // these — not a timestamp.
    const { season, week } = currentSeasonWeek(new Date());
    const expectedPrefix = `weekly-training-${season}-week${week}`;

    const trainingCall = queues.training.add.mock.calls[0];
    expect(trainingCall[2].jobId).toBe(expectedPrefix);
    // And it must NOT look like a millisecond timestamp.
    expect(trainingCall[2].jobId).not.toMatch(/^\d{10,}$/);
  });

  it('enqueues all five settlements in one tick', async () => {
    service = await buildService();

    await service.processWeeklySettlement();

    expect(queues.training.add).toHaveBeenCalledTimes(1);
    expect(queues.condition.add).toHaveBeenCalledTimes(1);
    expect(queues.construction.add).toHaveBeenCalledTimes(1);
    expect(queues.youth.add).toHaveBeenCalledTimes(1);
    expect(queues.fan.add).toHaveBeenCalledTimes(1);
  });

  it('all five jobIds are unique within the tick (BullMQ dedup per-queue only)', async () => {
    service = await buildService();

    await service.processWeeklySettlement();

    const ids = [
      queues.training.add.mock.calls[0][2].jobId,
      queues.condition.add.mock.calls[0][2].jobId,
      queues.construction.add.mock.calls[0][2].jobId,
      queues.youth.add.mock.calls[0][2].jobId,
      queues.fan.add.mock.calls[0][2].jobId,
    ];
    expect(new Set(ids).size).toBe(5);
  });

  it('sets attempts + backoff so transient failures retry', async () => {
    service = await buildService();

    await service.processWeeklySettlement();

    const opts = queues.training.add.mock.calls[0][2];
    expect(opts.attempts).toBe(3);
    expect(opts.backoff).toEqual({ type: 'exponential', delay: 60_000 });
  });

  it('does not crash when one of the five enqueues fails — the others still land', async () => {
    service = await buildService();

    // Make the condition queue throw; the other four should
    // still record `add` calls and the service should log a
    // single WARN line naming the missing kind.
    queues.condition.add.mockRejectedValueOnce(new Error('redis is down'));

    await service.processWeeklySettlement();

    expect(queues.training.add).toHaveBeenCalledTimes(1);
    expect(queues.construction.add).toHaveBeenCalledTimes(1);
    expect(queues.youth.add).toHaveBeenCalledTimes(1);
    expect(queues.fan.add).toHaveBeenCalledTimes(1);
    expect(queues.condition.add).toHaveBeenCalledTimes(1);

    const warnCalls = logger.warn.mock.calls.map((c) => String(c[0]));
    expect(warnCalls.some((line) => line.includes('Partial enqueue'))).toBe(
      true,
    );
    expect(warnCalls.some((line) => line.includes('condition'))).toBe(true);
  });

  it('does not log WARN on the happy path (all 5 succeed)', async () => {
    service = await buildService();
    await service.processWeeklySettlement();

    const warnCalls = logger.warn.mock.calls.map((c) => String(c[0]));
    expect(warnCalls.some((line) => line.includes('Partial enqueue'))).toBe(
      false,
    );
  });
});
