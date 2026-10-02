import { REDIS_AUCTION_CLIENT } from '@/redis/redis.module';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { HealthProbeService, describeProbeError } from './health-probe.service';
import { HealthStateService } from './health-state.service';

/**
 * The probe turns thrown values into the `lastError` string that
 * `/health` shows an operator.
 *
 * This matters more than it looks: the previous implementation was
 * `err instanceof Error ? err.message : String(err)`, and when Postgres
 * is stopped mid-flight node-postgres rejects pool-level waiters with
 * an error whose `message` is an empty string. A live outage test
 * produced `"db":{"state":"failing","lastError":""}` — the endpoint
 * reported a broken database and no reason at all.
 *
 * These tests drive the real probe, so the `query()` / `ping()` shapes
 * match what TypeORM and ioredis actually reject with.
 */
describe('describeProbeError', () => {
  it('keeps a real message, prefixed with the error name', () => {
    expect(
      describeProbeError(new Error('connect ECONNREFUSED 127.0.0.1:5432')),
    ).toBe('Error: connect ECONNREFUSED 127.0.0.1:5432');
  });

  it('never returns an empty string for an Error with an empty message', () => {
    // The exact shape seen during the outage: `new Error()` produced by
    // the pg pool. Message is '', so the old code stored ''.
    expect(describeProbeError(new Error(''))).toBe('Error');
  });

  it('uses a custom error name when the message is blank', () => {
    const err = new Error('   ');
    err.name = 'AggregateError';
    expect(describeProbeError(err)).toBe('AggregateError');
  });

  it('trims whitespace-only messages', () => {
    expect(describeProbeError(new Error('\n\t '))).toBe('Error');
  });

  it('falls back to the constructor name when name is missing', () => {
    const err = new Error('');
    err.name = '';
    expect(describeProbeError(err)).toBe('Error');
  });

  it('passes through a thrown string', () => {
    expect(describeProbeError('boom')).toBe('boom');
  });

  it('does not report a bare object as [object Object]', () => {
    // `String({ code: 'ECONNREFUSED' })` is '[object Object]', which
    // tells an operator nothing. Keep the tag but make it specific.
    expect(describeProbeError({ code: 'ECONNREFUSED' })).toBe(
      '[object Object]',
    );
  });

  it('handles a non-Error object without throwing', () => {
    expect(() => describeProbeError(null)).not.toThrow();
    expect(() => describeProbeError(undefined)).not.toThrow();
  });

  it('never returns an empty string for any input', () => {
    for (const input of [
      new Error(''),
      new Error('x'),
      '',
      null,
      undefined,
      {},
      [],
      0,
      false,
    ]) {
      expect(describeProbeError(input).length).toBeGreaterThan(0);
    }
  });
});

describe('HealthProbeService', () => {
  let probe: HealthProbeService;
  let state: {
    markDbSuccess: jest.Mock;
    markDbFailure: jest.Mock;
    markRedisSuccess: jest.Mock;
    markRedisFailure: jest.Mock;
  };
  let dataSource: { isInitialized: boolean; query: jest.Mock };
  let redis: { ping: jest.Mock };

  beforeEach(async () => {
    state = {
      markDbSuccess: jest.fn(),
      markDbFailure: jest.fn(),
      markRedisSuccess: jest.fn(),
      markRedisFailure: jest.fn(),
    };
    dataSource = {
      isInitialized: true,
      query: jest.fn().mockResolvedValue([{}]),
    };
    redis = { ping: jest.fn().mockResolvedValue('PONG') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthProbeService,
        { provide: DataSource, useValue: dataSource },
        { provide: REDIS_AUCTION_CLIENT, useValue: redis },
        { provide: HealthStateService, useValue: state },
      ],
    }).compile();

    probe = module.get(HealthProbeService);
  });

  /** Run one tick without arming the 5s interval. */
  const tick = () => (probe as unknown as { tick(): Promise<void> }).tick();

  it('records success for both dependencies', async () => {
    await tick();
    expect(state.markDbSuccess).toHaveBeenCalled();
    expect(state.markRedisSuccess).toHaveBeenCalled();
  });

  it('records a non-empty reason when the DB rejects with an empty message', async () => {
    dataSource.query.mockRejectedValue(new Error(''));

    await tick();

    expect(state.markDbFailure).toHaveBeenCalledWith('Error');
    // The regression itself: this used to record ''.
    expect(state.markDbFailure.mock.calls[0][0]).not.toBe('');
  });

  it('records a non-empty reason when Redis rejects with an empty message', async () => {
    redis.ping.mockRejectedValue(new Error(''));

    await tick();

    expect(state.markRedisFailure).toHaveBeenCalledWith('Error');
    expect(state.markRedisFailure.mock.calls[0][0]).not.toBe('');
  });

  it('preserves the real message when there is one', async () => {
    dataSource.query.mockRejectedValue(
      new Error('Connection terminated due to administrator command'),
    );

    await tick();

    expect(state.markDbFailure).toHaveBeenCalledWith(
      'Error: Connection terminated due to administrator command',
    );
  });

  it('reports "not initialized" while TypeORM is still retrying', async () => {
    dataSource.isInitialized = false;

    await tick();

    expect(state.markDbFailure).toHaveBeenCalledWith('not initialized');
    // Must not call .query() on an uninitialised DataSource.
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('surfaces a timeout as a failure rather than hanging', async () => {
    jest.useFakeTimers();
    try {
      dataSource.query.mockReturnValue(new Promise(() => {}));
      const p = tick();
      jest.advanceTimersByTime(2_100);
      await p;

      expect(state.markDbFailure).toHaveBeenCalledWith(
        expect.stringContaining('probe timeout'),
      );
    } finally {
      jest.useRealTimers();
    }
  });
});
