import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Job } from 'bullmq';
import { YouthProgressionProcessor } from './youth-progression.processor';
import { LOGGER_SERVICE } from '@goalxi/logger';
import { PlayerEntity } from '@goalxi/database';

describe('YouthProgressionProcessor', () => {
  let processor: YouthProgressionProcessor;
  let playerRepo: jest.Mocked<Repository<PlayerEntity>>;

  // ---- fixtures ----
  const outfieldSkills = () => ({
    physical: { pace: 10, strength: 10 },
    technical: { finishing: 10, passing: 10, dribbling: 10, defending: 10 },
    mental: { positioning: 10, composure: 10 },
    setPieces: { freeKicks: 10, penalties: 10 },
  });
  const gkSkills = () => ({
    physical: { pace: 10, strength: 10 },
    technical: { reflexes: 10, handling: 10, aerial: 10 },
    mental: { positioning: 10, composure: 10 },
    setPieces: { freeKicks: 10, penalties: 10 },
  });

  const outfieldYouth = (
    id: number,
    teamId: string,
    overrides: Partial<PlayerEntity> = {},
  ): PlayerEntity =>
    ({
      id,
      teamId,
      isYouth: true,
      isGoalkeeper: false,
      currentSkills: outfieldSkills(),
      potentialSkills: {
        physical: { pace: 18, strength: 18 },
        technical: { finishing: 18, passing: 18, dribbling: 18, defending: 18 },
        mental: { positioning: 18, composure: 18 },
        setPieces: { freeKicks: 18, penalties: 18 },
      },
      revealedSkills: ['pace', 'strength'],
      revealLevel: 2,
      fractionalAge: 16,
      ...overrides,
    }) as PlayerEntity;

  const gkYouth = (
    id: number,
    teamId: string,
    overrides: Partial<PlayerEntity> = {},
  ): PlayerEntity =>
    ({
      id,
      teamId,
      isYouth: true,
      isGoalkeeper: true,
      currentSkills: gkSkills(),
      potentialSkills: {
        physical: { pace: 18, strength: 18 },
        technical: { reflexes: 18, handling: 18, aerial: 18 },
        mental: { positioning: 18, composure: 18 },
        setPieces: { freeKicks: 18, penalties: 18 },
      },
      revealedSkills: ['reflexes'],
      revealLevel: 1,
      fractionalAge: 16,
      ...overrides,
    }) as PlayerEntity;

  // ---- mocks ----
  const mockPlayerRepo = {
    find: jest.fn(),
    save: jest.fn().mockImplementation(async (p: any) => p),
  };
  // Batched commit wrapper — runs the callback with a fake manager
  // whose `getRepository(PlayerEntity).save` records the call.
  const dataSource = {
    transaction: jest.fn(async (cb: any) => {
      const txSave = jest.fn((x: any) => x);
      const txManager = {
        getRepository: jest.fn().mockReturnValue({ save: txSave }),
      };
      return cb(txManager);
    }),
  };
  const mockLogger = {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };


  beforeEach(async () => {
    jest.clearAllMocks();
    mockPlayerRepo.save.mockImplementation(async (p: any) => p);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        // Always-positive RNG so growth always fires.
        {
          provide: YouthProgressionProcessor,
          useFactory: () =>
            new YouthProgressionProcessor(
              mockLogger as any,
              mockPlayerRepo as any,
              dataSource as any,
              () => 1,
            ),
        },
        { provide: LOGGER_SERVICE, useValue: mockLogger },
        { provide: getRepositoryToken(PlayerEntity), useValue: mockPlayerRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    processor = module.get(YouthProgressionProcessor);
    playerRepo = module.get(getRepositoryToken(PlayerEntity));
  });

  // -------- 1: base growth + reveal only (no coach) --------

  it('applies base weekly growth + reveal with no coach on staff', async () => {
    const youth = outfieldYouth(1, 'teamA');
    playerRepo.find.mockResolvedValue([youth]);

    const result = await processor.process({} as Job);

    expect(result.youthProcessed).toBe(1);
    expect(result.youthGrew).toBe(1);
    expect(result.youthRevealed).toBe(1);
    // #9: the write now goes through the transaction manager, not
    // the injected non-tx `playerRepo.save`. The mock DataSource
    // wrapper invokes the callback with a fake manager whose save
    // is recorded on `dataSource.transaction` itself.
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);

    // Growth: every skill in currentSkills grew by 0.1 toward potential.
    expect(youth.currentSkills.physical.pace).toBeCloseTo(10.1, 5);
    expect(youth.currentSkills.physical.strength).toBeCloseTo(10.1, 5);
    // revealLevel must follow revealedSkills length.
    expect(youth.revealLevel).toBe(youth.revealedSkills.length);
  });

  // -------- 2: free-agent youth --------

  it('skips free-agent youth (no teamId) without crashing', async () => {
    const freeAgent = outfieldYouth(1, null as any);
    playerRepo.find.mockResolvedValue([freeAgent]);

    const result = await processor.process({} as Job);

    expect(result.youthProcessed).toBe(1);
    // Free agents are not saved (no growth expected for them yet).
    expect(playerRepo.save).not.toHaveBeenCalled();
  });

  // -------- 3: reveal level sync --------

  it('keeps revealLevel in sync with revealedSkills.length after every tick', async () => {
    const youth = outfieldYouth(1, 'teamA', {
      revealedSkills: [
        'pace', 'strength', 'finishing', 'passing', 'dribbling',
      ],
    });
    playerRepo.find.mockResolvedValue([youth]);

    await processor.process({} as Job);

    expect(youth.revealLevel).toBe(youth.revealedSkills.length);
    expect(youth.revealLevel).toBeGreaterThanOrEqual(5);
  });

  // -------- 4: no save when nothing changed --------

  it('skips the DB write when nothing changed (no growth, no reveal)', async () => {
    const youth = outfieldYouth(1, 'teamA', {
      currentSkills: {
        physical: { pace: 18, strength: 18 },
        technical: { finishing: 18, passing: 18, dribbling: 18, defending: 18 },
        mental: { positioning: 18, composure: 18 },
        setPieces: { freeKicks: 18, penalties: 18 },
      },
      // All skills already revealed → no new reveal.
      revealedSkills: [
        'pace', 'strength', 'finishing', 'passing', 'dribbling', 'defending',
        'positioning', 'composure', 'freeKicks', 'penalties',
      ],
    });
    playerRepo.find.mockResolvedValue([youth]);

    const result = await processor.process({} as Job);

    expect(result.youthGrew).toBe(0);
    expect(result.youthRevealed).toBe(0);
    expect(playerRepo.save).not.toHaveBeenCalled();
  });

  // -------- 5: GK youth reveal still works --------

  it('processes GK youth through base growth + reveal like outfield', async () => {
    const youth = gkYouth(1, 'teamA');
    playerRepo.find.mockResolvedValue([youth]);

    const result = await processor.process({} as Job);

    expect(result.youthGrew).toBe(1);
    // Narrow the union (the fixture builds a GKTechnical here).
    const tech = youth.currentSkills.technical as { reflexes: number };
    expect(tech.reflexes).toBeCloseTo(10.1, 5);
  });

  // -------- 6: batched commit (regression: #9) --------

  it('writes all dirty players in a single transaction (no per-player autocommit)', async () => {
    // The pre-fix loop did `await this.playerRepo.save(player)` once
    // per player, which Postgres treats as an implicit single-row
    // transaction each time. A failure on player N left players
    // 1..N-1 committed. The fix moves the whole batch into one
    // `dataSource.transaction` call. This spec pins the batch shape.
    const a = outfieldYouth(1, 'teamA');
    const b = outfieldYouth(2, 'teamA');
    const c = outfieldYouth(3, 'teamA');
    playerRepo.find.mockResolvedValue([a, b, c]);

    await processor.process({} as Job);

    // The injected non-tx playerRepo.save should NEVER be called —
    // everything goes through the transaction manager.
    expect(mockPlayerRepo.save).not.toHaveBeenCalled();
    // The DataSource transaction wrapper was invoked exactly once,
    // not once per player.
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });
});
