import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { TrainingProcessor } from './training.processor';
import { LOGGER_SERVICE_PROVIDER } from '../test-utils/test-logger';
import {
  PlayerEntity,
  StaffEntity,
  TeamEntity,
  CoachPlayerAssignmentEntity,
  TrainingUpdateEntity,
  Uuid,
} from '@goalxi/database';
import { NotificationService } from '../notification/notification.service';

describe('TrainingProcessor', () => {
  let processor: TrainingProcessor;
  let teamRepo: jest.Mocked<Repository<TeamEntity>>;
  let staffRepo: jest.Mocked<Repository<StaffEntity>>;
  let playerRepo: jest.Mocked<Repository<PlayerEntity>>;
  let assignmentRepo: jest.Mocked<Repository<CoachPlayerAssignmentEntity>>;
  let trainingUpdateRepo: jest.Mocked<Repository<TrainingUpdateEntity>>;
  let dataSource: { transaction: jest.Mock; _txSave: jest.Mock; _txCreate: jest.Mock };

  const mockTeamRepo = { find: jest.fn() };
  const mockStaffRepo = { find: jest.fn() };
  const mockPlayerRepo = { find: jest.fn() };
  const mockAssignmentRepo = { find: jest.fn() };
  const mockTrainingUpdateRepo = { findOne: jest.fn() };
  const mockNotificationService = { create: jest.fn() };

  const buildPlayer = (overrides: Partial<PlayerEntity> = {}): PlayerEntity =>
    ({
      id: 1,
      name: 'P',
      teamId: 't1' as Uuid,
      isYouth: false,
      stamina: 2.99,
      form: 50,
      experience: 100,
      fractionalAge: 0.25,
      currentSkills: {
        physical: { pace: 5, strength: 5 },
        technical: { passing: 5 },
        mental: { decisions: 5 },
        setPieces: {},
      },
      potentialSkills: null,
      isGoalkeeper: false,
      ...overrides,
    }) as unknown as PlayerEntity;

  const buildTeam = (overrides: Partial<TeamEntity> = {}): TeamEntity =>
    ({
      id: 't1' as Uuid,
      name: 'T1',
      isBot: false,
      userId: 'user-1' as Uuid,
      staminaTrainingIntensity: 0.5,
      ...overrides,
    }) as unknown as TeamEntity;

  // Build a DataSource whose transaction invokes the callback with a
  // fake manager. The fake manager returns per-entity save/create
  // spies, so we can assert batched-write behaviour.
  const makeDataSource = () => {
    const txSave = jest.fn((x: any) => x);
    const txCreate = jest.fn((x: any) => x);
    const txFindOne = jest.fn();
    const txManager = {
      getRepository: jest.fn().mockImplementation((Entity: any) => {
        const name = Entity?.name;
        if (name === 'PlayerEntity') return { save: txSave };
        if (name === 'TrainingUpdateEntity')
          return { save: txSave, create: txCreate, findOne: txFindOne };
        return { save: txSave, create: txCreate, findOne: txFindOne };
      }),
    };
    return {
      transaction: jest.fn(async (cb: any) => cb(txManager)),
      _txSave: txSave,
      _txCreate: txCreate,
      _txFindOne: txFindOne,
    };
  };

  beforeEach(async () => {
    dataSource = makeDataSource() as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrainingProcessor,
        LOGGER_SERVICE_PROVIDER,
        { provide: getRepositoryToken(TeamEntity), useValue: mockTeamRepo },
        { provide: getRepositoryToken(StaffEntity), useValue: mockStaffRepo },
        { provide: getRepositoryToken(PlayerEntity), useValue: mockPlayerRepo },
        {
          provide: getRepositoryToken(CoachPlayerAssignmentEntity),
          useValue: mockAssignmentRepo,
        },
        {
          provide: getRepositoryToken(TrainingUpdateEntity),
          useValue: mockTrainingUpdateRepo,
        },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    processor = module.get<TrainingProcessor>(TrainingProcessor);
    teamRepo = module.get(getRepositoryToken(TeamEntity));
    staffRepo = module.get(getRepositoryToken(StaffEntity));
    playerRepo = module.get(getRepositoryToken(PlayerEntity));
    assignmentRepo = module.get(getRepositoryToken(CoachPlayerAssignmentEntity));
    trainingUpdateRepo = module.get(getRepositoryToken(TrainingUpdateEntity));

    jest.clearAllMocks();
    // Re-attach the freshly-cleared dataSource spies.
    const fresh = makeDataSource();
    (dataSource as any).transaction = fresh.transaction;
    (dataSource as any)._txSave = fresh._txSave;
    (dataSource as any)._txCreate = fresh._txCreate;
    (dataSource as any)._txFindOne = fresh._txFindOne;
    // Default: no assignment rows, no existing training update.
    mockAssignmentRepo.find.mockResolvedValue([]);
    mockTrainingUpdateRepo.findOne.mockResolvedValue(null);
  });

  describe('process', () => {
    it('opens one transaction per non-bot team and saves all dirty players in a single batched call', async () => {
      const team = buildTeam();
      mockTeamRepo.find.mockResolvedValueOnce([team]);
      mockStaffRepo.find.mockResolvedValueOnce([
        { id: 99, teamId: team.id, isActive: true, level: 3 } as unknown as StaffEntity,
      ]);
      const players = [
        buildPlayer({ id: 1, name: 'A' }),
        buildPlayer({ id: 2, name: 'B' }),
      ];
      mockPlayerRepo.find.mockResolvedValueOnce(players);

      const result = await processor.process({ id: 'job-1' } as any);

      // Single transaction.
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      // Both players went through the same batched save call.
      const saveCalls = (dataSource as any)._txSave.mock.calls;
      const playerSaveCall = saveCalls.find(
        (c: any[]) => Array.isArray(c[0]) && c[0].length === 2,
      );
      expect(playerSaveCall).toBeDefined();

      expect(result.teamsProcessed).toBe(1);
      expect(result.playersProcessed).toBe(2);
    });

    it('skips bot teams entirely (no transaction opened)', async () => {
      mockTeamRepo.find.mockResolvedValueOnce([
        buildTeam({ id: 'bot' as Uuid, isBot: true }),
        buildTeam({ id: 'bot2' as Uuid, isBot: true }),
      ]);

      const result = await processor.process({ id: 'job-2' } as any);

      expect(dataSource.transaction).not.toHaveBeenCalled();
      // Bot teams are still counted in the team total but contribute
      // 0 processed players.
      expect(result.teamsProcessed).toBe(2);
      expect(result.playersProcessed).toBe(0);
    });

    it('does not write a training update when the team has no userId (skip the notification side)', async () => {
      const team = buildTeam({ userId: null });
      mockTeamRepo.find.mockResolvedValueOnce([team]);
      mockStaffRepo.find.mockResolvedValueOnce([]);
      mockPlayerRepo.find.mockResolvedValueOnce([
        buildPlayer({ id: 1 }),
      ]);

      await processor.process({ id: 'job-3' } as any);

      // The trainingUpdateRepo was queried at all (it's an injected
      // repo, not transactional) — but the tx trainingUpdate save
      // was never called, because team.userId is null.
      const allSaves = (dataSource as any)._txSave.mock.calls;
      const trainingUpdateWrites = allSaves.filter(
        (c: any[]) => !Array.isArray(c[0]),
      );
      expect(trainingUpdateWrites).toHaveLength(0);
    });

    it('writes a training update inside the transaction when the team has a userId', async () => {
      const team = buildTeam();
      mockTeamRepo.find.mockResolvedValueOnce([team]);
      mockStaffRepo.find.mockResolvedValueOnce([]);
      mockPlayerRepo.find.mockResolvedValueOnce([buildPlayer({ id: 1 })]);

      await processor.process({ id: 'job-4' } as any);

      // The training update is created+save inside the transaction
      // (txCreate + txSave calls, not the injected repo).
      expect((dataSource as any)._txCreate).toHaveBeenCalled();
      const allSaves = (dataSource as any)._txSave.mock.calls;
      const nonArraySaves = allSaves.filter((c: any[]) => !Array.isArray(c[0]));
      expect(nonArraySaves.length).toBeGreaterThanOrEqual(1);
      expect(nonArraySaves[0][0]).toEqual(
        expect.objectContaining({ teamId: team.id }),
      );
    });
  });
});
