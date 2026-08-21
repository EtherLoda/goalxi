import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Job } from 'bullmq';
import { PlayerDeclineProcessor } from './player-decline.processor';
import { LOGGER_SERVICE } from '@goalxi/logger';
import { DECLINE_START_AGE, PlayerEntity } from '@goalxi/database';

describe('PlayerDeclineProcessor', () => {
  let processor: PlayerDeclineProcessor;
  let playerRepo: jest.Mocked<Repository<PlayerEntity>>;

  // ---- fixtures ----
  // Build a player with a fully-populated outfield skill tree at
  // peak (18). The `age` getter is the product of the team's
  // getCurrentSeasonWeek math + daysAlive; for the unit test we
  // stamp `age` directly on the entity via the `as any` cast.
  const outfieldSkills = () => ({
    physical: { pace: 18, strength: 18 },
    technical: { finishing: 18, passing: 18, dribbling: 18, defending: 18 },
    mental: { positioning: 18, composure: 18 },
    setPieces: { freeKicks: 18, penalties: 18 },
  });

  const seniorPlayer = (
    id: number,
    teamId: string,
    age: number,
    overrides: Partial<PlayerEntity> = {},
  ): PlayerEntity =>
    ({
      id,
      teamId,
      isYouth: false,
      isGoalkeeper: false,
      currentSkills: outfieldSkills(),
      // age is a getter; the test reads it off the same field
      // we stamp here, so a plain assignment works.
      age,
      // Default to a non-bot team so the bot filter in the
      // processor lets the player through. Tests that want a
      // bot owner or a null team override this with `...overrides`.
      team: { id: teamId, isBot: false } as any,
      ...overrides,
    }) as unknown as PlayerEntity;

  // ---- mocks ----
  const mockPlayerRepo = {
    find: jest.fn(),
    save: jest.fn().mockImplementation(async (p: any) => p),
  };
  // Batched commit wrapper — runs the callback with a fake manager
  // whose `getRepository(PlayerEntity).save` records the call. Same
  // shape as the YouthProgressionProcessor spec.
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
        // Always-positive RNG so the jitter factor lands at
        // 1.15 — max-decline case, makes the test assertions
        // deterministic. The pure function's own spec covers
        // the 0.85 floor with a separate test.
        {
          provide: PlayerDeclineProcessor,
          useFactory: () =>
            new PlayerDeclineProcessor(
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

    processor = module.get(PlayerDeclineProcessor);
    playerRepo = module.get(getRepositoryToken(PlayerEntity));
  });

  // -------- 1: no players --------

  it('returns zero counters when the player table is empty', async () => {
    playerRepo.find.mockResolvedValue([]);
    const result = await processor.process({} as Job);
    expect(result).toEqual({
      playersScanned: 0,
      playersDeclined: 0,
      hitFloorCount: 0,
    });
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  // -------- 2: skips players below the start age --------

  it('does not decline players below DECLINE_START_AGE (no save, no decline)', async () => {
    const youngSenior = seniorPlayer(1, 'teamA', 25);
    playerRepo.find.mockResolvedValue([youngSenior]);

    const result = await processor.process({} as Job);

    expect(result.playersScanned).toBe(1);
    expect(result.playersDeclined).toBe(0);
    expect(dataSource.transaction).not.toHaveBeenCalled();
    // Skills untouched.
    expect(youngSenior.currentSkills.physical.pace).toBe(18);
  });

  // -------- 3: declines a senior player past the threshold --------

  it('declines a 30-year-old senior and saves through the transaction manager', async () => {
    const senior = seniorPlayer(1, 'teamA', 30);
    playerRepo.find.mockResolvedValue([senior]);

    const result = await processor.process({} as Job);

    expect(result.playersScanned).toBe(1);
    expect(result.playersDeclined).toBe(1);
    expect(result.hitFloorCount).toBe(0);
    // Batched tx path, not the per-row `playerRepo.save`.
    expect(mockPlayerRepo.save).not.toHaveBeenCalled();
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);

    // Single week at age 30 with the max-jitter RNG (random=1,
    // jitter=1.15):
    //   decline = 0.013 * 2^1.5 (age-28)^p * catMult * 1.15
    //   physical (1.0): 0.013 * 2.828 * 1.15 = 0.0423
    //   mental (0.4):    0.013 * 2.828 * 0.4 * 1.15 = 0.0169
    // We assert a range rather than exact — the spec is the
    // "decline fires at age 30" contract, not the precise delta.
    const before = 18;
    const lost = before - senior.currentSkills.physical.pace;
    expect(lost).toBeGreaterThan(0.038);
    expect(lost).toBeLessThan(0.045);

    // Mental declines less.
    const mentalLost =
      before -
      (senior.currentSkills.mental as { positioning: number }).positioning;
    expect(mentalLost).toBeLessThan(lost);
  });

  // -------- 4: skips bot teams (the team.isBot=false filter) --------

  it('skips players whose team is a BOT (does not decline, does not save)', async () => {
    const botOwner = seniorPlayer(1, 'teamBot', 30, {
      team: { id: 'teamBot', isBot: true } as any,
    });
    const userOwner = seniorPlayer(2, 'teamUser', 30, {
      team: { id: 'teamUser', isBot: false } as any,
    });
    playerRepo.find.mockResolvedValue([botOwner, userOwner]);

    const result = await processor.process({} as Job);

    expect(result.playersScanned).toBe(2);
    expect(result.playersDeclined).toBe(1);
    // Bot player's skills untouched.
    expect(botOwner.currentSkills.physical.pace).toBe(18);
    // User player's pace declined.
    expect(userOwner.currentSkills.physical.pace).toBeLessThan(18);
  });

  it('skips players with a null team row (defensive guard)', async () => {
    const orphan = seniorPlayer(1, 'teamGone', 30, { team: null });
    playerRepo.find.mockResolvedValue([orphan]);

    const result = await processor.process({} as Job);

    expect(result.playersScanned).toBe(1);
    expect(result.playersDeclined).toBe(0);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  // -------- 5: skips youth players --------

  it('skips youth players even when their team is non-bot', async () => {
    const youth = seniorPlayer(1, 'teamA', 30, { isYouth: true });
    playerRepo.find.mockResolvedValue([youth]);

    const result = await processor.process({} as Job);

    expect(result.playersDeclined).toBe(0);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  // -------- 6: skips players with no currentSkills --------

  it('skips players with null currentSkills without crashing', async () => {
    const broken = seniorPlayer(1, 'teamA', 30, { currentSkills: null });
    playerRepo.find.mockResolvedValue([broken]);

    const result = await processor.process({} as Job);

    expect(result.playersDeclined).toBe(0);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  // -------- 7: hitFloorCount is incremented when a skill lands in the clamp --------

  it('increments hitFloorCount when at least one skill lands in the floor clamp', async () => {
    // age 45 with skills at 5.5 — single-week decline for
    // physical = 0.013 * 17^1.5 * 1.0 * 1.15 = 1.039
    // → 5.5 - 1.039 = 4.46 → floor 5, floored.
    // (With p=1.5 the per-week loss is much smaller at age 40 than
    // with p=2, so we need a higher age + lower starting value to
    // actually hit the floor in a single week.)
    const veteran = seniorPlayer(1, 'teamA', 45, {
      currentSkills: {
        physical: { pace: 6, strength: 6 },
        technical: { finishing: 6, passing: 6, dribbling: 6, defending: 6 },
        mental: { positioning: 6, composure: 6 },
        setPieces: { freeKicks: 6, penalties: 6 },
      },
    });
    playerRepo.find.mockResolvedValue([veteran]);

    const result = await processor.process({} as Job);

    expect(result.playersDeclined).toBe(1);
    expect(result.hitFloorCount).toBe(1);
    expect(veteran.currentSkills.physical.pace).toBe(5);
  });

  // -------- 8: no save when nothing changed --------

  it('skips the DB write when every player is below DECLINE_START_AGE (no dirty rows)', async () => {
    playerRepo.find.mockResolvedValue([
      seniorPlayer(1, 'teamA', 22),
      seniorPlayer(2, 'teamB', 25),
      seniorPlayer(3, 'teamC', DECLINE_START_AGE - 1),
    ]);

    const result = await processor.process({} as Job);

    expect(result.playersScanned).toBe(3);
    expect(result.playersDeclined).toBe(0);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  // -------- 9: batched commit across many players --------

  it('writes all dirty players in a single transaction (regression: per-row autocommit)', async () => {
    // Mirrors the YouthProgressionProcessor regression spec —
    // a per-player save loop would call dataSource.transaction
    // N times; the batched version must call it once.
    const players = [
      seniorPlayer(1, 'teamA', 30),
      seniorPlayer(2, 'teamA', 31),
      seniorPlayer(3, 'teamB', 32),
      seniorPlayer(4, 'teamB', 33),
    ];
    playerRepo.find.mockResolvedValue(players);

    await processor.process({} as Job);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    // The injected non-tx save should NEVER be touched.
    expect(mockPlayerRepo.save).not.toHaveBeenCalled();
  });

  // -------- 10: handles a 28-year-old boundary correctly --------

  it('skips a player at exactly age 28 (the entry point, no decline yet)', async () => {
    // Per the pure-function spec, age 28 returns the original
    // value unchanged. The processor therefore must not flag
    // the player as dirty.
    const atBoundary = seniorPlayer(1, 'teamA', DECLINE_START_AGE);
    playerRepo.find.mockResolvedValue([atBoundary]);

    const result = await processor.process({} as Job);

    expect(result.playersDeclined).toBe(0);
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(atBoundary.currentSkills.physical.pace).toBe(18);
  });

  it('declines a player at age 29 (first age where decline fires)', async () => {
    const justOver = seniorPlayer(1, 'teamA', DECLINE_START_AGE + 1);
    playerRepo.find.mockResolvedValue([justOver]);

    const result = await processor.process({} as Job);

    expect(result.playersDeclined).toBe(1);
    // 0.011 * 1 * 1.0 * 1.15 = 0.01265 lost on physical.
    const lost = 18 - justOver.currentSkills.physical.pace;
    expect(lost).toBeGreaterThan(0.01);
    expect(lost).toBeLessThan(0.015);
  });
});
