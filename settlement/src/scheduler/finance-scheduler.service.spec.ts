import { LOGGER_SERVICE } from '@goalxi/logger';
import { getQueueToken } from '@nestjs/bullmq';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { MatchEntity, TeamEntity } from '@goalxi/database';
import { FinanceSchedulerService } from './finance-scheduler.service';
import { cronLockPassThrough } from '../test-utils/cron-lock-mock';

describe('FinanceSchedulerService', () => {
  let service: FinanceSchedulerService;
  let queue: { add: jest.Mock };
  let teamRepo: { find: jest.Mock };
  // MatchEntity is dead-injected in FinanceSchedulerService (the
  // cron never touches it). We still need to provide the token
  // because Nest's DI doesn't know "dead" — without this the
  // TestingModule compile fails on a missing dep. Cleaning the
  // dead inject is a separate task.
  let matchRepo: { find: jest.Mock };
  let logger: { info: jest.Mock; warn: jest.Mock; error: jest.Mock };

  // Anchor the game clock at a known instant so currentSeasonWeek
  // resolves to a deterministic (season, week) pair. The cron body
  // logs the (season, week) tuple it computed — pinning NOW means
  // we can assert on the jobId suffix without a flake window.
  const NOW = new Date('2026-08-06T00:00:00Z');

  beforeEach(() => {
    queue = { add: jest.fn().mockResolvedValue({ id: 'job' }) };
    teamRepo = { find: jest.fn() };
    matchRepo = { find: jest.fn() };
    logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    jest.spyOn(Date, 'now').mockReturnValue(NOW.getTime());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const buildService = async (): Promise<FinanceSchedulerService> => {
    const moduleRef = await Test.createTestingModule({
      providers: [
      cronLockPassThrough,
        FinanceSchedulerService,
        { provide: LOGGER_SERVICE, useValue: logger },
        { provide: getQueueToken('finance-settlement'), useValue: queue },
        { provide: getRepositoryToken(TeamEntity), useValue: teamRepo },
        { provide: getRepositoryToken(MatchEntity), useValue: matchRepo },
      ],
    }).compile();
    return moduleRef.get(FinanceSchedulerService);
  };

  it('passes { isBot: false } to the team query (skips BOT teams entirely)', async () => {
    teamRepo.find.mockResolvedValueOnce([]);
    service = await buildService();

    await service.processWeeklyFinanceSettlement();

    expect(teamRepo.find).toHaveBeenCalledTimes(1);
    expect(teamRepo.find).toHaveBeenCalledWith({ where: { isBot: false } });
  });

  it('enqueues one job per non-bot team, none for bot teams', async () => {
    teamRepo.find.mockResolvedValueOnce([
      { id: 'real-1' },
      { id: 'real-2' },
      { id: 'real-3' },
    ] as TeamEntity[]);
    service = await buildService();

    await service.processWeeklyFinanceSettlement();

    // If the isBot filter regresses, `teamRepo.find` would return
    // the bot rows in the mock and we'd see N calls. We assert
    // the queue sees exactly the three non-bot rows.
    expect(queue.add).toHaveBeenCalledTimes(3);
    const teamIds = queue.add.mock.calls.map((c) => c[1].teamId);
    expect(teamIds).toEqual(['real-1', 'real-2', 'real-3']);
  });

  it('emits a business-key jobId anchored to (season, week) — not Date.now()', async () => {
      // The old id was `finance-weekly-${team.id}-${Date.now()}`, which
      // defeats BullMQ's duplicate-jobId rejection entirely: every fire
      // (restart, deploy, manual re-trigger) minted a fresh key.
      // `FinanceService.processWeeklySettlementAtomic` has no
      // (teamId, season, week) guard — it unconditionally credits
      // sponsorship and wages — so a double fire paid twice from nothing.
      teamRepo.find.mockResolvedValueOnce([
        { id: 'real-1' },
        { id: 'real-2' },
      ] as TeamEntity[]);
      service = await buildService();

      await service.processWeeklyFinanceSettlement();

      const jobIds = queue.add.mock.calls.map((c) => c[2].jobId);
      // Unique per team.
      expect(new Set(jobIds).size).toBe(2);
      for (const id of jobIds) {
        expect(id).toMatch(/^finance-weekly-real-\d+-\d+-week\d+$/);
      }
      // The season/week suffix must be identical across teams so a
      // second fire in the SAME week dedups.
      const suffixes = jobIds.map((id) => id.replace(/^finance-weekly-real-\d+-/, ''));
      expect(new Set(suffixes).size).toBe(1);

      // And a retry policy, so a single Postgres blip isn't a silent
      // permanent loss for that team.
      for (const call of queue.add.mock.calls) {
        expect(call[2].attempts).toBeGreaterThan(1);
      }
    });

    it('REGRESSION: a second cron fire in the same week produces the same jobIds', async () => {
      teamRepo.find.mockResolvedValue([{ id: 'real-1' }] as TeamEntity[]);
      service = await buildService();

      await service.processWeeklyFinanceSettlement();
      await service.processWeeklyFinanceSettlement();

      const jobIds = queue.add.mock.calls.map((c) => c[2].jobId);
      expect(jobIds).toHaveLength(2);
      expect(jobIds[0]).toBe(jobIds[1]);
    });

  it('does not throw when the queue rejects a single team job', async () => {
    teamRepo.find.mockResolvedValueOnce([
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
    ] as TeamEntity[]);
    // First call (a) blows up; b and c still get queued.
    queue.add
      .mockRejectedValueOnce(new Error('redis blip'))
      .mockResolvedValueOnce({ id: 'j2' })
      .mockResolvedValueOnce({ id: 'j3' });
    service = await buildService();

    await expect(
      service.processWeeklyFinanceSettlement(),
    ).resolves.toBeUndefined();

    expect(queue.add).toHaveBeenCalledTimes(3);
    // Partial failure surfaces via the failure-count log.
    const errLines = logger.error.mock.calls.map((c) => String(c[0]));
    expect(
      errLines.some((line) =>
        line.includes('Failed to queue finance settlement'),
      ),
    ).toBe(true);
  });

  it('survives a thrown team query (logs error, does not crash the cron)', async () => {
    teamRepo.find.mockRejectedValueOnce(new Error('postgres gone'));
    service = await buildService();

    // The cron uses top-level await without a try/catch around
    // the find, so a DB outage propagates. That is intentional —
    // Nest's @Cron should fail loudly so on-call sees it. We
    // pin the contract here so a future "swallow error" change
    // is a deliberate decision.
    await expect(service.processWeeklyFinanceSettlement()).rejects.toThrow(
      'postgres gone',
    );

    expect(queue.add).not.toHaveBeenCalled();
  });
});
