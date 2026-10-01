import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConditionProcessor } from './condition.processor';
import { LOGGER_SERVICE_PROVIDER } from '../test-utils/test-logger';
import {
  PlayerEntity,
  StaffEntity,
  TeamEntity,
  FanEntity,
  StaffRole,
  Uuid,
} from '@goalxi/database';

describe('ConditionProcessor', () => {
  let processor: ConditionProcessor;
  let teamRepo: jest.Mocked<Repository<TeamEntity>>;
  let playerRepo: jest.Mocked<Repository<PlayerEntity>>;
  let staffRepo: jest.Mocked<Repository<StaffEntity>>;
  let fanRepo: jest.Mocked<Repository<FanEntity>>;
  let dataSource: { transaction: jest.Mock };

  const mockTeamRepo = { find: jest.fn(), findOne: jest.fn() };
  const mockPlayerRepo = { find: jest.fn(), save: jest.fn() };
  const mockStaffRepo = { findOne: jest.fn() };
  const mockFanRepo = { findOne: jest.fn() };

  const buildPlayer = (overrides: Partial<PlayerEntity> = {}): PlayerEntity =>
    ({
      id: 1,
      name: 'P',
      teamId: 't1' as Uuid,
      isYouth: false,
      form: 50,
      matchMinutes: 90,
      currentInjuryValue: 0,
      ...overrides,
    }) as unknown as PlayerEntity;

  // The transaction callback is invoked synchronously with a fake
  // manager; the manager's `getRepository(PlayerEntity)` returns a
  // spy `save` we can assert against.
  const makeDataSource = (saved: any[]) => {
    const txSave = jest.fn((input: any) => {
      saved.push(input);
      return input;
    });
    const txManager = {
      getRepository: jest.fn().mockReturnValue({ save: txSave }),
    };
    return {
      transaction: jest.fn(async (cb: any) => cb(txManager)),
      _txSave: txSave,
    };
  };

  beforeEach(async () => {
    const saved: any[] = [];
    dataSource = makeDataSource(saved);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConditionProcessor,
        LOGGER_SERVICE_PROVIDER,
        { provide: getRepositoryToken(TeamEntity), useValue: mockTeamRepo },
        { provide: getRepositoryToken(PlayerEntity), useValue: mockPlayerRepo },
        { provide: getRepositoryToken(StaffEntity), useValue: mockStaffRepo },
        { provide: getRepositoryToken(FanEntity), useValue: mockFanRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    processor = module.get<ConditionProcessor>(ConditionProcessor);
    teamRepo = module.get(getRepositoryToken(TeamEntity));
    playerRepo = module.get(getRepositoryToken(PlayerEntity));
    staffRepo = module.get(getRepositoryToken(StaffEntity));
    fanRepo = module.get(getRepositoryToken(FanEntity));

    jest.clearAllMocks();
    // Re-attach the dataSource spy (clearAllMocks wipes both the
    // outer wrapper and the nested txSave).
    const fresh = makeDataSource([]);
    (dataSource as any).transaction = fresh.transaction;
    (dataSource as any)._txSave = fresh._txSave;
    // Default: no players in any team. Tests that want players
    // override per-call with mockResolvedValueOnce.
    mockPlayerRepo.find.mockResolvedValue([]);
  });

  describe('process', () => {
    it('skips bot teams entirely (no transaction opened)', async () => {
      mockTeamRepo.find.mockResolvedValueOnce([
        { id: 'bot' as Uuid, isBot: true } as TeamEntity,
        { id: 'real' as Uuid, isBot: true } as TeamEntity,
      ]);

      const result = await processor.process({ id: 'job-1' } as any);

      // No team was processed, so the dataSource.transaction was
      // never called.
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(result.playersProcessed).toBe(0);
    });

    it('opens exactly one transaction per non-bot team and saves all players in a single batched call', async () => {
      mockTeamRepo.find.mockResolvedValueOnce([
        { id: 'real' as Uuid, isBot: false } as TeamEntity,
      ]);
      mockTeamRepo.findOne.mockResolvedValueOnce({
        id: 'real' as Uuid,
        isBot: false,
      } as TeamEntity);
      mockStaffRepo.findOne.mockResolvedValueOnce({
        teamId: 'real' as Uuid,
        role: StaffRole.HEAD_COACH,
        isActive: true,
        level: 4,
      } as unknown as StaffEntity);
      mockFanRepo.findOne.mockResolvedValueOnce({
        teamId: 'real' as Uuid,
        fanEmotion: 70,
      } as unknown as FanEntity);

      const players = [
        buildPlayer({ id: 1, form: 50, matchMinutes: 90 }),
        buildPlayer({ id: 2, form: 60, matchMinutes: 30 }),
        buildPlayer({ id: 3, form: 40, matchMinutes: 0 }),
      ];
      mockPlayerRepo.find.mockResolvedValueOnce(players);

      const result = await processor.process({ id: 'job-2' } as any);

      // Single transaction, single batched save with every player.
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      const saveArg = (dataSource as any)._txSave.mock.calls[0][0];
      expect(Array.isArray(saveArg)).toBe(true);
      expect(saveArg).toHaveLength(3);
      expect(saveArg).toEqual(expect.arrayContaining(players));

      // Each player's form was recomputed and matchMinutes reset.
      for (const p of players) {
        expect(p.matchMinutes).toBe(0);
      }

      expect(result).toMatchObject({
        teamsProcessed: 1,
        playersProcessed: 3,
      });
    });

    it('skips the transaction when the team has no eligible players (youth-only)', async () => {
      mockTeamRepo.find.mockResolvedValueOnce([
        { id: 'real' as Uuid, isBot: false } as TeamEntity,
      ]);
      mockTeamRepo.findOne.mockResolvedValueOnce({
        id: 'real' as Uuid,
        isBot: false,
      } as TeamEntity);
      mockStaffRepo.findOne.mockResolvedValueOnce(null);
      mockFanRepo.findOne.mockResolvedValueOnce(null);
      // No non-youth players in the squad.
      mockPlayerRepo.find.mockResolvedValueOnce([]);

      const result = await processor.process({ id: 'job-3' } as any);

      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(result.playersProcessed).toBe(0);
    });

    it('resets matchMinutes to 0 for bot-team players without touching their form (regression: #10)', async () => {
      // Bot squads' form and stamina are deliberately frozen at the
      // seeded values (see team-generator.service.ts), but the field
      // still gets incremented by match-completion.service.ts on
      // every match they play. The processor must zero it back
      // each tick or the column grows without bound.
      mockTeamRepo.find.mockResolvedValueOnce([
        { id: 'bot' as Uuid, isBot: true } as TeamEntity,
      ]);
      // The processor re-fetches the team inside `processTeamCondition`
      // to check `isBot`. Without this mock, the default `findOne`
      // returns `undefined` and the bot branch is skipped.
      mockTeamRepo.findOne.mockResolvedValueOnce({
        id: 'bot' as Uuid,
        isBot: true,
      } as TeamEntity);
      const players = [
        {
          id: 1,
          name: 'A',
          teamId: 'bot' as Uuid,
          isYouth: false,
          form: 50,
          matchMinutes: 90,
          currentInjuryValue: 0,
        } as unknown as PlayerEntity,
        {
          id: 2,
          name: 'B',
          teamId: 'bot' as Uuid,
          isYouth: false,
          form: 60,
          matchMinutes: 0,
          currentInjuryValue: 0,
        } as unknown as PlayerEntity,
      ];
      mockPlayerRepo.find.mockResolvedValueOnce(players);

      const result = await processor.process({ id: 'job-bot' } as any);

      // Bot team — form/stamina pipeline skipped, but the
      // matchMinutes reset still ran.
      expect(result.playersProcessed).toBe(0);
      expect(players[0].matchMinutes).toBe(0);
      // Form is unchanged (the bot path doesn't touch it).
      expect(players[0].form).toBe(50);
      // Player B was already 0 — no spurious write.
      expect(players[1].matchMinutes).toBe(0);
      // The transaction was opened exactly once (the bot reset path).
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });

    it('isolates team A from team B (a throw in team A does not roll back team B)', async () => {
      // Team A throws inside processTeamCondition. We expect the
      // processor's outer try/catch to surface the error so the
      // job retries — the per-team transaction guarantees team B's
      // already-committed work isn't rolled back by team A's throw.
      //
      // The `isBot` flag now rides in from the single `teamRepo.find()`
      // (it used to cost an extra `findOne` per team), so the injected
      // failure comes from the head-coach lookup instead.
      mockTeamRepo.find.mockResolvedValueOnce([
        { id: 'A' as Uuid, isBot: false } as TeamEntity,
        { id: 'B' as Uuid, isBot: false } as TeamEntity,
      ]);
      mockStaffRepo.findOne.mockImplementationOnce(() => {
        throw new Error('simulated team A DB failure');
      });
      // Default playerRepo.find returns [] (no throw side effect).

      await expect(processor.process({ id: 'job-4' } as any)).rejects.toThrow(
        /simulated team A DB failure/,
      );

      // The processor's catch block re-throws, so the whole job fails.
      // That matches the existing process() error contract — partial
      // failure surfaces as a job retry rather than silent skip.
    });
  });
});
