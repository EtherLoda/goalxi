import {
  applyDailyInjuryRecovery,
  applyInjuryBatch,
} from './injury-recovery-calculator';
import { InjuryEntity } from '../entities/injury.entity';
import { PlayerEntity } from '../entities/player.entity';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { GAME_SETTINGS } from '../constants/game.constants';

/**
 * Spec for the bulk DB write helpers that the simulator and the
 * daily-recovery cron share.
 *
 * The helpers take an `EntityManager` so the test mocks the repos
 * that the manager hands out, not TypeORM internals. Each test
 * focuses on ONE concern (input shape → output shape / repo
 * calls) so a future regression lands on a tight assertion.
 */

type StubRepo<T> = jest.Mocked<Repository<T>>;

const makeRepo = <T>(): StubRepo<T> =>
  ({
    save: jest.fn(),
    update: jest.fn(),
    create: jest.fn((data) => data as unknown as T),
    // Default `find` to [] so the ghost-injury pre-check doesn't
    // throw on every "fresh" test. Tests that need rows set the
    // mock return explicitly.
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    count: jest.fn(),
  }) as unknown as StubRepo<T>;

const makeManager = (playerRepo: StubRepo<PlayerEntity>, injuryRepo: StubRepo<InjuryEntity>): EntityManager =>
  ({
    getRepository: (entity: unknown) => {
      if (entity === PlayerEntity) return playerRepo;
      if (entity === InjuryEntity) return injuryRepo;
      throw new Error(`Unexpected entity in manager: ${(entity as { name: string }).name}`);
    },
  }) as unknown as EntityManager;

const makePlayer = (overrides: Partial<PlayerEntity> = {}): PlayerEntity =>
  ({
    id: 1,
    name: 'P1',
    currentInjuryValue: 50,
    injuryType: 'muscle',
    injuryState: 'severe',
    injuredAt: new Date(),
    getExactAge: () => [25, 0] as [number, number],
    ...overrides,
  }) as unknown as PlayerEntity;

describe('applyInjuryBatch', () => {
  it('returns an empty array and makes no DB calls when given no items', async () => {
    const playerRepo = makeRepo<PlayerEntity>();
    const injuryRepo = makeRepo<InjuryEntity>();
    const manager = makeManager(playerRepo, injuryRepo);

    const result = await applyInjuryBatch(manager, []);

    expect(result).toEqual([]);
    expect(injuryRepo.save).not.toHaveBeenCalled();
    expect(playerRepo.update).not.toHaveBeenCalled();
  });

  it('bulk-inserts one injury row per item', async () => {
    const playerRepo = makeRepo<PlayerEntity>();
    const injuryRepo = makeRepo<InjuryEntity>();
    // save() returns whatever it was given (mirrors TypeORM).
    injuryRepo.save.mockImplementation(
      async (data) => data as unknown as InjuryEntity,
    );
    const manager = makeManager(playerRepo, injuryRepo);

    const result = await applyInjuryBatch(manager, [
      { playerId: 1, injuryType: 'muscle', severity: 1, injuryValue: 25, estimatedDays: 3 },
      { playerId: 2, injuryType: 'ligament', severity: 2, injuryValue: 80, estimatedDays: 11 },
    ]);

    expect(injuryRepo.save).toHaveBeenCalledTimes(1);
    // Both injuries are in the same bulk save call.
    const saved = (injuryRepo.save as jest.Mock).mock.calls[0][0];
    expect(saved).toHaveLength(2);
    expect(result).toHaveLength(2);
  });

  it('sets player.injuryState to "minor" when value <= threshold', async () => {
    const playerRepo = makeRepo<PlayerEntity>();
    const injuryRepo = makeRepo<InjuryEntity>();
    injuryRepo.save.mockImplementation(
      async (data) => data as unknown as InjuryEntity,
    );
    const manager = makeManager(playerRepo, injuryRepo);

    await applyInjuryBatch(manager, [
      {
        playerId: 1,
        injuryType: 'muscle',
        severity: 1,
        injuryValue: GAME_SETTINGS.INJURY_MINOR_VALUE_THRESHOLD, // exactly 30
        estimatedDays: 3,
      },
    ]);

    expect(playerRepo.update).toHaveBeenCalledWith(
      { id: 1 },
      expect.objectContaining({ injuryState: 'minor' }),
    );
  });

  it('sets player.injuryState to "severe" when value > threshold', async () => {
    const playerRepo = makeRepo<PlayerEntity>();
    const injuryRepo = makeRepo<InjuryEntity>();
    injuryRepo.save.mockImplementation(
      async (data) => data as unknown as InjuryEntity,
    );
    const manager = makeManager(playerRepo, injuryRepo);

    await applyInjuryBatch(manager, [
      {
        playerId: 1,
        injuryType: 'ligament',
        severity: 2,
        injuryValue: GAME_SETTINGS.INJURY_MINOR_VALUE_THRESHOLD + 1, // 31
        estimatedDays: 5,
      },
    ]);

    expect(playerRepo.update).toHaveBeenCalledWith(
      { id: 1 },
      expect.objectContaining({ injuryState: 'severe' }),
    );
  });

  it('skips items for players who already have an active injury (P2-#8)', async () => {
    // Player 1 has an active injury already → the new item is
    // dropped (no insert, no player update). Player 2 is fresh →
    // the item is written normally. This pins the ghost-injury
    // guard: a second injury event in the same match must not
    // leave a second active `injury` row.
    const playerRepo = makeRepo<PlayerEntity>();
    const injuryRepo = makeRepo<InjuryEntity>();
    injuryRepo.save.mockImplementation(
      async (data) => data as unknown as InjuryEntity,
    );
    // The pre-check returns player 1 as having an active row.
    injuryRepo.find.mockResolvedValue([
      { playerId: 1 } as unknown as InjuryEntity,
    ]);
    const manager = makeManager(playerRepo, injuryRepo);

    const result = await applyInjuryBatch(manager, [
      {
        playerId: 1,
        injuryType: 'muscle',
        severity: 2,
        injuryValue: 50,
        estimatedDays: 7,
      },
      {
        playerId: 2,
        injuryType: 'head',
        severity: 2,
        injuryValue: 80,
        estimatedDays: 11,
      },
    ]);

    // The pre-check looked up active rows for the batch's
    // playerIds. `In` is used under the hood.
    expect(injuryRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ recoveredAt: IsNull() }),
      }),
    );
    // Only player 2's row was inserted.
    expect(result).toHaveLength(1);
    // Only player 2's cache was updated.
    expect(playerRepo.update).toHaveBeenCalledTimes(1);
    expect(playerRepo.update).toHaveBeenCalledWith(
      { id: 2 },
      expect.anything(),
    );
  });

  it('returns an empty array when every player in the batch already has an active injury', async () => {
    const playerRepo = makeRepo<PlayerEntity>();
    const injuryRepo = makeRepo<InjuryEntity>();
    injuryRepo.save.mockImplementation(
      async (data) => data as unknown as InjuryEntity,
    );
    injuryRepo.find.mockResolvedValue([
      { playerId: 1 } as unknown as InjuryEntity,
      { playerId: 2 } as unknown as InjuryEntity,
    ]);
    const manager = makeManager(playerRepo, injuryRepo);

    const result = await applyInjuryBatch(manager, [
      { playerId: 1, injuryType: 'muscle', severity: 2, injuryValue: 50, estimatedDays: 7 },
      { playerId: 2, injuryType: 'head', severity: 2, injuryValue: 80, estimatedDays: 11 },
    ]);

    expect(result).toEqual([]);
    expect(injuryRepo.save).not.toHaveBeenCalled();
    expect(playerRepo.update).not.toHaveBeenCalled();
  });
});

describe('applyDailyInjuryRecovery', () => {
  it('returns empty and makes no DB calls when given no inputs', async () => {
    const playerRepo = makeRepo<PlayerEntity>();
    const injuryRepo = makeRepo<InjuryEntity>();
    const manager = makeManager(playerRepo, injuryRepo);

    const result = await applyDailyInjuryRecovery(manager, []);

    expect(result).toEqual([]);
    expect(playerRepo.save).not.toHaveBeenCalled();
    expect(injuryRepo.find).not.toHaveBeenCalled();
  });

  it('decrements currentInjuryValue for a partial recovery and saves the player once', async () => {
    const playerRepo = makeRepo<PlayerEntity>();
    const injuryRepo = makeRepo<InjuryEntity>();
    playerRepo.save.mockImplementation(
      async (data) => data as unknown as PlayerEntity,
    );
    const manager = makeManager(playerRepo, injuryRepo);

    // age 25 + no doctor → dailyRecovery = 9.1
    // 50 - 9.1 = 40.9 → round → 41
    const player = makePlayer({ id: 10, currentInjuryValue: 50 });
    await applyDailyInjuryRecovery(manager, [{ player, doctorLevel: 0 }], new Date('2026-08-06'));

    expect(player.currentInjuryValue).toBe(41);
    // Single batched save covers partial decrements (no full recoveries here).
    expect(playerRepo.save).toHaveBeenCalledTimes(1);
    expect(playerRepo.save).toHaveBeenCalledWith([player]);
    // No full recoveries → no injury find, no injury save.
    expect(injuryRepo.find).not.toHaveBeenCalled();
    expect(injuryRepo.save).not.toHaveBeenCalled();
  });

  it('rounds the new value to an integer (P1-#9)', async () => {
    // Pin the rounding: a non-integer daily delta must not be
    // silently truncated by PG on the int column. The previous
    // code path (without Math.round) used to lose 0.5-0.9 credit
    // per tick. With the fix, 50 - 9.1 = 40.9 → 41.
    const playerRepo = makeRepo<PlayerEntity>();
    const injuryRepo = makeRepo<InjuryEntity>();
    playerRepo.save.mockImplementation(
      async (data) => data as unknown as PlayerEntity,
    );
    const manager = makeManager(playerRepo, injuryRepo);

    const player = makePlayer({ id: 11, currentInjuryValue: 50 });
    await applyDailyInjuryRecovery(manager, [{ player, doctorLevel: 0 }], new Date('2026-08-06'));

    expect(player.currentInjuryValue).toBe(41);
  });

  it('clears injury fields + stamps recoveredAt + returns the recovery row on full recovery', async () => {
    const playerRepo = makeRepo<PlayerEntity>();
    const injuryRepo = makeRepo<InjuryEntity>();
    playerRepo.save.mockImplementation(
      async (data) => data as unknown as PlayerEntity,
    );
    injuryRepo.save.mockImplementation(
      async (data) => data as unknown as InjuryEntity,
    );
    // The active-injury query returns one row for the player.
    const activeInjury = {
      playerId: 20,
      injuryType: 'muscle',
      occurredAt: new Date('2026-08-01'),
      recoveredAt: null,
    } as unknown as InjuryEntity;
    injuryRepo.find.mockResolvedValue([activeInjury]);
    const manager = makeManager(playerRepo, injuryRepo);

    // age 25 + no doctor → daily = 9.1
    // 5 - 9.1 = -4.1 → max(0, round) → 0 → fully recovered
    const player = makePlayer({
      id: 20,
      name: 'Starter',
      currentInjuryValue: 5,
      injuryType: 'muscle',
      injuryState: 'severe',
      injuredAt: new Date('2026-08-01'),
    });
    (player as unknown as { team: { userId: string } }).team = {
      userId: 'owner-uuid',
    };

    const result = await applyDailyInjuryRecovery(
      manager,
      [{ player, doctorLevel: 0 }],
      new Date('2026-08-06'),
    );

    // Cleared fields on the in-memory entity.
    expect(player.currentInjuryValue).toBe(0);
    expect(player.injuryType).toBeNull();
    expect(player.injuryState).toBeNull();
    expect(player.injuredAt).toBeNull();
    // The active injury row got recoveredAt stamped.
    expect((activeInjury as { recoveredAt: Date | null }).recoveredAt).toEqual(
      new Date('2026-08-06'),
    );
    // The injury query looked for the active row (recoveredAt IS NULL).
    expect(injuryRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ recoveredAt: IsNull() }),
      }),
    );
    // Returns the recovery entry the caller uses for notifications.
    expect(result).toEqual([
      {
        playerId: 20,
        playerName: 'Starter',
        injuryType: 'muscle',
        userId: 'owner-uuid',
      },
    ]);
  });

  it('upgrades injuryState to "minor" when new value lands in the minor band', async () => {
    // Player: age 25, no doctor, currentInjuryValue = 35.
    // dailyRecovery = 9.1 → newValue = round(35 - 9.1) = 26.
    // 26 <= 30 AND estimateRecoveryDays(26, 25, 0) <= 7
    //   = ceil(26 / 9.1) = 3.  → minor
    const playerRepo = makeRepo<PlayerEntity>();
    const injuryRepo = makeRepo<InjuryEntity>();
    playerRepo.save.mockImplementation(
      async (data) => data as unknown as PlayerEntity,
    );
    const manager = makeManager(playerRepo, injuryRepo);

    const player = makePlayer({
      id: 30,
      currentInjuryValue: 35,
      injuryState: 'severe',
    });
    await applyDailyInjuryRecovery(manager, [{ player, doctorLevel: 0 }], new Date('2026-08-06'));

    expect(player.currentInjuryValue).toBe(26);
    expect(player.injuryState).toBe('minor');
  });
});
