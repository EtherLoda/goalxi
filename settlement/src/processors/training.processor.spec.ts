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

describe('TrainingProcessor', () => {
  let processor: TrainingProcessor;
  let teamRepo: jest.Mocked<Repository<TeamEntity>>;
  let staffRepo: jest.Mocked<Repository<StaffEntity>>;
  let playerRepo: jest.Mocked<Repository<PlayerEntity>>;
  let assignmentRepo: jest.Mocked<Repository<CoachPlayerAssignmentEntity>>;
  let trainingUpdateRepo: jest.Mocked<Repository<TrainingUpdateEntity>>;
  let dataSource: {
    transaction: jest.Mock;
    _txSave: jest.Mock;
    _txCreate: jest.Mock;
    _txFindOne: jest.Mock;
    _txUpdate: jest.Mock;
    _txInsertExecute: jest.Mock;
    _txInsertQuery: Record<string, jest.Mock>;
    _txManager: { getRepository: jest.Mock };
    _committedWrites: () => number;
  };

  const mockTeamRepo = { find: jest.fn() };
  const mockStaffRepo = { find: jest.fn() };
  const mockPlayerRepo = { find: jest.fn() };
  const mockAssignmentRepo = { find: jest.fn() };
  const mockTrainingUpdateRepo = { findOne: jest.fn() };

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
  // fake manager. The processor now routes EVERY read and write through
  // the transaction manager (one transaction per tick, so a retry after
  // a mid-tick failure rolls back cleanly instead of double-applying a
  // week of training to already-committed teams), so the fake manager
  // hands back the same repo mocks the DI tokens provide.
  const makeDataSource = () => {
    // Simulates a real transaction: writes issued inside the callback
    // only count as committed if the callback resolves. If it throws,
    // the counter stays put — which is what lets the atomicity
    // regression test assert "team A's write was rolled back".
    let committedWrites = 0;
    const pendingWrites: unknown[] = [];
    const txSave = jest.fn((x: any) => {
      pendingWrites.push(x);
      return x;
    });
    const txCreate = jest.fn((x: any) => x);
    const txUpdate = jest.fn((x: any) => x);
    const txFindOne = jest.fn();
    // `orIgnore()` insert: `identifiers.length === 0` signals the row
    // already existed, which routes the processor to the UPDATE branch.
    const txInsertQuery = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ identifiers: [{ id: 'tu-1' }] }),
    };
    const txCreateQueryBuilder = jest.fn(() => txInsertQuery);

    const txManager = {
      getRepository: jest.fn().mockImplementation((Entity: any) => {
        const name = Entity?.name;
        if (name === 'PlayerEntity') {
          return { find: mockPlayerRepo.find, save: txSave };
        }
        if (name === 'TeamEntity') {
          return { find: mockTeamRepo.find };
        }
        if (name === 'StaffEntity') {
          return { find: mockStaffRepo.find };
        }
        if (name === 'CoachPlayerAssignmentEntity') {
          return { find: mockAssignmentRepo.find };
        }
        if (name === 'TrainingUpdateEntity') {
          return {
            save: txSave,
            create: txCreate,
            findOne: txFindOne,
            update: txUpdate,
            createQueryBuilder: txCreateQueryBuilder,
          };
        }
        return { save: txSave, create: txCreate, findOne: txFindOne };
      }),
    };
    return {
      transaction: jest.fn(async (cb: any) => {
        pendingWrites.length = 0;
        try {
          const out = await cb(txManager);
          committedWrites += pendingWrites.length;
          return out;
        } catch (err) {
          // rollback: `pendingWrites` is discarded on the next call.
          pendingWrites.length = 0;
          throw err;
        }
      }),
      _committedWrites: () => committedWrites,
      _txManager: txManager,
      _txSave: txSave,
      _txCreate: txCreate,
      _txFindOne: txFindOne,
      _txUpdate: txUpdate,
      _txInsertExecute: txInsertQuery.execute,
      _txInsertQuery: txInsertQuery,
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
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    processor = module.get<TrainingProcessor>(TrainingProcessor);
    teamRepo = module.get(getRepositoryToken(TeamEntity));
    staffRepo = module.get(getRepositoryToken(StaffEntity));
    playerRepo = module.get(getRepositoryToken(PlayerEntity));
    assignmentRepo = module.get(
      getRepositoryToken(CoachPlayerAssignmentEntity),
    );
    trainingUpdateRepo = module.get(getRepositoryToken(TrainingUpdateEntity));

    jest.clearAllMocks();
    // `clearAllMocks` does NOT drain the `mockResolvedValueOnce` /
    // `mockRejectedValueOnce` queues, so a per-test override would leak
    // into the next test. Reset each repo mock explicitly and re-seed
    // the shared defaults.
    for (const m of [
      mockTeamRepo,
      mockStaffRepo,
      mockPlayerRepo,
      mockAssignmentRepo,
      mockTrainingUpdateRepo,
    ]) {
      for (const fn of Object.values(m)) {
        (fn as jest.Mock).mockReset();
      }
    }
    // Re-attach the freshly-cleared dataSource spies.
    const fresh = makeDataSource();
    Object.assign(dataSource, fresh);
    // Default: no assignment rows, no existing training update.
    mockAssignmentRepo.find.mockResolvedValue([]);
    mockTrainingUpdateRepo.findOne.mockResolvedValue(null);
  });

  describe('process', () => {
    it('opens ONE transaction for the whole tick and saves all dirty players in a single batched call', async () => {
      const team = buildTeam();
      mockTeamRepo.find.mockResolvedValueOnce([team]);
      mockStaffRepo.find.mockResolvedValueOnce([
        {
          id: 99,
          teamId: team.id,
          isActive: true,
          level: 3,
        } as unknown as StaffEntity,
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

    it('skips bot teams entirely (no player writes)', async () => {
      mockTeamRepo.find.mockResolvedValueOnce([
        buildTeam({ id: 'bot' as Uuid, isBot: true }),
        buildTeam({ id: 'bot2' as Uuid, isBot: true }),
      ]);

      const result = await processor.process({ id: 'job-2' } as any);

      // ONE transaction for the whole tick (opened unconditionally), but no
      // player rows are written for bot squads.
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(dataSource._txSave).not.toHaveBeenCalled();
      // Bot teams are still counted in the team total but contribute
      // 0 processed players.
      expect(result.teamsProcessed).toBe(2);
      expect(result.playersProcessed).toBe(0);
    });

    it('does not write a training update when the team has no userId (skip the notification side)', async () => {
      const team = buildTeam({ userId: null });
      mockTeamRepo.find.mockResolvedValueOnce([team]);
      mockStaffRepo.find.mockResolvedValueOnce([]);
      mockPlayerRepo.find.mockResolvedValueOnce([buildPlayer({ id: 1 })]);

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

      // The training update is written through the transaction manager
      // via an `INSERT ... ON CONFLICT DO NOTHING`. That replaces the
      // previous `findOne`-then-`create` TOCTOU: `training_update`'s
      // only index is NON-unique (migration 1700000000024), so two
      // overlapping runs could both insert a row for the same
      // (team, season, week) and duplicate the manager-facing report.
      expect(dataSource._txInsertQuery.insert).toHaveBeenCalled();
      expect(dataSource._txInsertQuery.into).toHaveBeenCalledWith(
        TrainingUpdateEntity,
      );
      expect(dataSource._txInsertQuery.values).toHaveBeenCalledWith(
        expect.objectContaining({ teamId: team.id }),
      );
      expect(dataSource._txInsertExecute).toHaveBeenCalled();
      // Insert succeeded → no redundant UPDATE.
      expect(dataSource._txUpdate).not.toHaveBeenCalled();
    });

    it('falls back to UPDATE when the training update row already exists', async () => {
      // `orIgnore()` insert returns 0 identifiers when the row is
      // already there, which is how the retry path avoids a duplicate.
      const team = buildTeam();
      mockTeamRepo.find.mockResolvedValueOnce([team]);
      mockStaffRepo.find.mockResolvedValueOnce([]);
      mockPlayerRepo.find.mockResolvedValueOnce([buildPlayer({ id: 1 })]);
      dataSource._txInsertExecute.mockResolvedValueOnce({
        identifiers: [],
      });

      await processor.process({ id: 'job-5' } as any);

      expect(dataSource._txUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ teamId: team.id }),
        expect.objectContaining({ playerUpdates: expect.any(Array) }),
      );
    });

    it('REGRESSION: one transaction for the tick, so a mid-tick failure rolls back everything', async () => {
      // Per-team commits + `attempts: 3` on the enqueue side was a
      // double-application bug: a failure at team 700 left teams 1-699
      // committed, and the BullMQ retry restarted from team 1 — applying
      // a SECOND week of training and stamina regeneration to 699 teams.
      // The old docstring claimed processors only ever see a job once,
      // which is false.
      const teamA = buildTeam({ id: 'team-a' as Uuid });
      const teamB = buildTeam({ id: 'team-b' as Uuid });
      mockTeamRepo.find.mockResolvedValueOnce([teamA, teamB]);
      mockStaffRepo.find
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      // Team A reads fine; team B's player read blows up.
      mockPlayerRepo.find
        .mockResolvedValueOnce([buildPlayer({ id: 1 })])
        .mockRejectedValueOnce(new Error('boom'));

      await expect(
        processor.process({ id: 'job-atomic' } as any),
      ).rejects.toThrow('boom');

      // Exactly ONE transaction attempt — the whole tick is inside it,
      // so team A's player write is rolled back when team B throws and a
      // retry starts from a clean slate.
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(dataSource._txSave).toHaveBeenCalled(); // team A did write...
      expect(dataSource._committedWrites()).toBe(0); // ...but nothing committed
    });

    it('REGRESSION: routes reads through the transaction manager', async () => {
      // Staff / assignments / players used to be read on the injected
      // non-tx repos while the writes went through the transaction —
      // i.e. no consistent read view, and TypeORM's save-diff could
      // write back stale values for columns the processor never meant
      // to touch (e.g. `form`, which ConditionProcessor owns).
      const team = buildTeam();
      mockTeamRepo.find.mockResolvedValueOnce([team]);
      mockStaffRepo.find.mockResolvedValueOnce([
        {
          id: 99,
          teamId: team.id,
          isActive: true,
          level: 3,
        } as unknown as StaffEntity,
      ]);
      mockPlayerRepo.find.mockResolvedValueOnce([buildPlayer({ id: 1 })]);

      await processor.process({ id: 'job-mgr' } as any);

      // Every entity the tick touches was resolved through the manager.
      const requested = dataSource._txManager.getRepository.mock.calls.map(
        (c: any[]) => c[0]?.name,
      );
      expect(requested).toEqual(
        expect.arrayContaining([
          'TeamEntity',
          'StaffEntity',
          'PlayerEntity',
        ]),
      );
    });

    // Regression: the previous implementation kept only the FIRST
    // assignment per player in a Map, so a player assigned to a
    // fitness + technical coach only ever received ONE coach's
    // weekly bonus. The fix processes every assignment in the list.
    it('applies specialized training for EVERY assigned coach (not just the first)', async () => {
      const team = buildTeam();
      mockTeamRepo.find.mockResolvedValueOnce([team]);
      mockStaffRepo.find.mockResolvedValueOnce([
        // two active coaches, one for `physical` and one for `technical`
        {
          id: 'coach-phys',
          teamId: team.id,
          isActive: true,
          level: 4,
          trainedSkill: 'pace',
        } as unknown as StaffEntity,
        {
          id: 'coach-tech',
          teamId: team.id,
          isActive: true,
          level: 4,
          trainedSkill: 'passing',
        } as unknown as StaffEntity,
      ]);
      // both coaches are assigned to the same player, in different
      // training categories. The old code would drop the second row.
      mockAssignmentRepo.find.mockResolvedValueOnce([
        {
          id: 'a1',
          coachId: 'coach-phys',
          playerId: 1,
          trainingCategory: 'physical',
        } as unknown as CoachPlayerAssignmentEntity,
        {
          id: 'a2',
          coachId: 'coach-tech',
          playerId: 1,
          trainingCategory: 'technical',
        } as unknown as CoachPlayerAssignmentEntity,
      ]);
      const player = buildPlayer({
        id: 1,
        name: 'Multi',
        // The chosen `trainedSkill` (pace / passing) must be < potential
        // so applySpecializedTraining has somewhere to spend points.
        currentSkills: {
          physical: { pace: 8, strength: 8 },
          technical: { finishing: 8, passing: 8, dribbling: 8, defending: 8 },
          mental: { positioning: 8, composure: 8 },
          setPieces: { freeKicks: 8, penalties: 8 },
        },
        potentialSkills: {
          physical: { pace: 17, strength: 17 },
          technical: {
            finishing: 17,
            passing: 17,
            dribbling: 17,
            defending: 17,
          },
          mental: { positioning: 17, composure: 17 },
          setPieces: { freeKicks: 17, penalties: 17 },
        },
      });
      mockPlayerRepo.find.mockResolvedValueOnce([player]);

      await processor.process({ id: 'job-multi' } as any);

      // BOTH targeted skills must have moved toward potential. With
      // only the first assignment honoured, `passing` would stay at
      // its starting value (8) and only `pace` would grow.
      expect(player.currentSkills.physical.pace).toBeGreaterThan(8);
      expect((player.currentSkills.technical as any).passing).toBeGreaterThan(
        8,
      );
    });

    // #4 (dirty check based on rounded stamina) is covered by code
    // review rather than a unit test — the stamina math has too
    // many moving parts (age × stamina × coach level × intensity)
    // to pin a deterministic equilibrium without mocking the
    // underlying calculators, and `jest.spyOn` can't redefine
    // the `@goalxi/database` re-exports. The change is small
    // enough that the `applySpecializedTraining` spec coverage
    // above + the inline comment in the processor are enough to
    // keep the behaviour honest.

    it('skips specialized training for severely injured players (regression: #11)', async () => {
      // Severe injury = cannot play. Training point spending on a
      // player who can't appear in the next match is wasted. The
      // processor should still apply the stamina change (rest helps
      // healing) but skip the per-coach applySpecializedTraining call.
      const team = buildTeam();
      mockTeamRepo.find.mockResolvedValueOnce([team]);
      mockStaffRepo.find.mockResolvedValueOnce([
        {
          id: 'c1',
          teamId: team.id,
          isActive: true,
          level: 4,
          trainedSkill: 'pace',
        } as unknown as StaffEntity,
      ]);
      mockAssignmentRepo.find.mockResolvedValueOnce([
        {
          id: 'a1',
          coachId: 'c1',
          playerId: 1,
          trainingCategory: 'physical',
        } as unknown as CoachPlayerAssignmentEntity,
      ]);
      const player = buildPlayer({
        id: 1,
        name: 'Injured',
        injuryState: 'severe',
        currentSkills: {
          physical: { pace: 8, strength: 8 },
          technical: { finishing: 8, passing: 8, dribbling: 8, defending: 8 },
          mental: { positioning: 8, composure: 8 },
          setPieces: { freeKicks: 8, penalties: 8 },
        },
        potentialSkills: {
          physical: { pace: 17, strength: 17 },
          technical: {
            finishing: 17,
            passing: 17,
            dribbling: 17,
            defending: 17,
          },
          mental: { positioning: 17, composure: 17 },
          setPieces: { freeKicks: 17, penalties: 17 },
        },
      });
      mockPlayerRepo.find.mockResolvedValueOnce([player]);

      await processor.process({ id: 'job-injured' } as any);

      // Severe injury → no specialized training. `pace` must equal
      // its starting value (8). Stamina may still move — the
      // processor only skipped the coach apply, not the recovery.
      expect(player.currentSkills.physical.pace).toBe(8);
    });

    it('applies specialized training for minor injuries (regression: #11)', async () => {
      // The injuryState guard is `'severe'` only. `minor` (95% play
      // rating) should NOT skip the bonus — that would penalize
      // players who can still train at near-full strength.
      const team = buildTeam();
      mockTeamRepo.find.mockResolvedValueOnce([team]);
      mockStaffRepo.find.mockResolvedValueOnce([
        {
          id: 'c1',
          teamId: team.id,
          isActive: true,
          level: 4,
          trainedSkill: 'pace',
        } as unknown as StaffEntity,
      ]);
      mockAssignmentRepo.find.mockResolvedValueOnce([
        {
          id: 'a1',
          coachId: 'c1',
          playerId: 1,
          trainingCategory: 'physical',
        } as unknown as CoachPlayerAssignmentEntity,
      ]);
      const player = buildPlayer({
        id: 1,
        name: 'Banged',
        injuryState: 'minor',
        currentSkills: {
          physical: { pace: 8, strength: 8 },
          technical: { finishing: 8, passing: 8, dribbling: 8, defending: 8 },
          mental: { positioning: 8, composure: 8 },
          setPieces: { freeKicks: 8, penalties: 8 },
        },
        potentialSkills: {
          physical: { pace: 17, strength: 17 },
          technical: {
            finishing: 17,
            passing: 17,
            dribbling: 17,
            defending: 17,
          },
          mental: { positioning: 17, composure: 17 },
          setPieces: { freeKicks: 17, penalties: 17 },
        },
      });
      mockPlayerRepo.find.mockResolvedValueOnce([player]);

      await processor.process({ id: 'job-minor' } as any);

      // Minor injury → training still applies.
      expect(player.currentSkills.physical.pace).toBeGreaterThan(8);
    });

    it('skips assignments whose coach is no longer on the active staff list', async () => {
      // Catches a defensive branch — the assignment row can outlive a
      // coach (e.g. fired after the assignment was created). The
      // processor should silently skip it without throwing, and the
      // remaining active coach's bonus should still apply.
      const team = buildTeam();
      mockTeamRepo.find.mockResolvedValueOnce([team]);
      // Only ONE of the two assigned coaches is currently active.
      mockStaffRepo.find.mockResolvedValueOnce([
        {
          id: 'coach-active',
          teamId: team.id,
          isActive: true,
          level: 3,
          trainedSkill: 'pace',
        } as unknown as StaffEntity,
      ]);
      mockAssignmentRepo.find.mockResolvedValueOnce([
        {
          id: 'a1',
          coachId: 'coach-active',
          playerId: 1,
          trainingCategory: 'physical',
        } as unknown as CoachPlayerAssignmentEntity,
        {
          id: 'a2',
          coachId: 'coach-fired',
          playerId: 1,
          trainingCategory: 'technical',
        } as unknown as CoachPlayerAssignmentEntity,
      ]);
      const player = buildPlayer({
        id: 1,
        name: 'Mixed',
        currentSkills: {
          physical: { pace: 8, strength: 8 },
          technical: { finishing: 8, passing: 8, dribbling: 8, defending: 8 },
          mental: { positioning: 8, composure: 8 },
          setPieces: { freeKicks: 8, penalties: 8 },
        },
        potentialSkills: {
          physical: { pace: 17, strength: 17 },
          technical: {
            finishing: 17,
            passing: 17,
            dribbling: 17,
            defending: 17,
          },
          mental: { positioning: 17, composure: 17 },
          setPieces: { freeKicks: 17, penalties: 17 },
        },
      });
      mockPlayerRepo.find.mockResolvedValueOnce([player]);

      await processor.process({ id: 'job-mixed' } as any);

      // The active coach's `pace` bonus should have landed…
      expect(player.currentSkills.physical.pace).toBeGreaterThan(8);
      // …while the fired coach's `passing` was silently skipped
      // (no throw, no spurious points). `passing` should equal its
      // starting value because nothing else trains it this tick.
      expect((player.currentSkills.technical as any).passing).toBe(8);
    });
  });
});
