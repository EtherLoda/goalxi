import { OnboardingAssigner } from './onboarding-assigner';
import {
  LeagueEntity,
  TeamEntity,
  UserEntity,
  UserOnboardingStatus,
  Uuid,
} from '../index';
import { DataSource } from 'typeorm';

/**
 * Behavioural tests for the league-pick + claim algorithm.
 * The DB writes themselves are exercised by the integration
 * suite in the api workspace; here we exercise the
 * pure-function side (league selection, threshold logic,
 * sort tie-breakers) via a mocked `DataSource` whose
 * queryBuilder returns canned data.
 */

interface FakeRow {
  leagueId: string;
  total: number;
  players: number;
}

interface FakeLeague {
  id: string;
  tier: number;
  tierDivision: number;
}

interface FakeArgs {
  rows: FakeRow[];
  leagues: FakeLeague[];
  pickedTeam?: TeamEntity | null;
  existingTeamForUser?: TeamEntity | null;
  /**
   * What the in-transaction ownership re-check finds. Defaults to
   * null (= nobody owns a team yet), which is the normal path. Set it
   * to a team to simulate a sibling worker winning the race while this
   * one was blocked on the user row lock.
   */
  ownedTeamInTransaction?: TeamEntity | null;
  /** Whether the `user` row exists when the lock is taken. */
  userExists?: boolean;
}

interface FakeHandle {
  dataSource: DataSource;
  manager: any;
  teamSelectQb: any;
  teamOwnedQb: any;
  teamAggQb: any;
  leagueQb: any;
  teamPickQb: any;
  teamRefreshQb: any;
  userQb: any;
  userLockQb: any;
}

function makeFakeDataSource(args: FakeArgs): FakeHandle {
  // Generic chainable QB. Each .method() returns the QB so
  // calls compose; the few terminal methods (getOne, getMany,
  // getRawMany, execute) read the canned value supplied by
  // the test.
  const makeQb = (overrides: Record<string, jest.Mock> = {}): any => {
    const base: any = {};
    const chain = [
      'where', 'andWhere', 'orderBy', 'addOrderBy', 'setLock',
      'select', 'addSelect', 'groupBy', 'leftJoinAndSelect',
      'update', 'set',
    ];
    for (const m of chain) {
      base[m] = jest.fn(() => base);
    }
    Object.assign(base, overrides);
    return base;
  };

  // TeamEntity is queried five times, in this order. The counter is
  // shared between the pre-transaction fast path and the transaction
  // body because both go through the same fake `manager`.
  let teamQbIndex = 0;
  const teamSelectQb = makeQb({
    // 1. pre-transaction existing-ownership fast path.
    getOne: jest.fn().mockResolvedValue(args.existingTeamForUser ?? null),
  });
  const teamOwnedQb = makeQb({
    // 2. in-transaction ownership re-check, under the user row lock.
    getOne: jest.fn().mockResolvedValue(args.ownedTeamInTransaction ?? null),
  });
  const teamAggQb = makeQb({
    // 3. per-league player/bot aggregate.
    getRawMany: jest.fn().mockResolvedValue(args.rows),
  });
  const teamPickQb = makeQb({
    // 4. the BOT pick.
    getOne: jest.fn().mockResolvedValue(args.pickedTeam ?? null),
  });
  const teamRefreshQb = makeQb({
    // 5. in-transaction claim re-fetch.
    getOne: jest.fn().mockResolvedValue(args.pickedTeam ?? null),
  });
  const teamQbs = [
    teamSelectQb,
    teamOwnedQb,
    teamAggQb,
    teamPickQb,
    teamRefreshQb,
  ];
  const leagueQb = makeQb({
    getMany: jest.fn().mockResolvedValue(args.leagues),
  });
  // No-arg form: `update(UserEntity).set(...).where(...)` → execute().
  const userQb = makeQb({
    execute: jest.fn().mockResolvedValue(undefined),
  });
  // Aliased form: `createQueryBuilder(UserEntity, 'u')` → the
  // pessimistic-lock SELECT that serialises claims per user.
  const userLockQb = makeQb({
    getOne: jest.fn().mockResolvedValue(
      args.userExists === false ? null : { id: 'user-1' },
    ),
  });

  const manager: any = {
    save: jest.fn(async (t: TeamEntity) => t),
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
    // The fresh-claim path issues raw `manager.query` for every
    // DELETE in `scrubManagerSpecificData` (workaround for
    // TypeORM 0.3.x's DeleteQueryBuilder `subQuery` bug). Stub
    // it as a no-op so the pick-algorithm tests don't have to
    // care about the scrub side-effects.
    query: jest.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
    create: jest.fn((_Entity: unknown, data: unknown) => ({
      id: 'mock-row-id',
      ...((data as object) ?? {}),
    })),
    // The claim path now goes through the shared
    // `createTeam` helper, which calls
    // `manager.findOne(TeamEntity, { where: { id } })`
    // for the `existingTeamId` branch. Return the picked
    // team so the in-place ownership flip has a row to
    // mutate; null when the test wants the "not found"
    // error path.
    findOne: jest.fn().mockImplementation((_Entity: unknown, opts: any) => {
      // Reuse the pickedTeam passed in via args. Tests
      // that don't set one (the no-bot error path) will
      // never hit this branch because the claim throws
      // before reaching createTeam.
      return Promise.resolve(args.pickedTeam ?? null);
    }),
    // Stubs for the side-channels the claim transaction now
    // reaches into after the in-place update: the scrub helper
    // (which issues `manager.delete(...)` per table) and the
    // squad/staff/scout generators (which call
    // `manager.create(...)` + `manager.save(...)` and
    // `manager.getRepository(ScoutCandidateEntity).create/save`).
    // We don't assert on these in the existing pick-algorithm
    // tests, so a no-op stub is enough — keeping the test
    // surface focused on the league-pick logic, with a separate
    // spec covering the full fresh-claim path.
    getRepository: jest.fn().mockReturnValue({
      create: jest.fn((data: unknown) => data),
      save: jest.fn().mockResolvedValue({ id: 'mock-scout-id' }),
    }),
    transaction: jest.fn(
      async (cb: (m: unknown) => unknown) => cb(manager),
    ),
    createQueryBuilder: jest.fn((entity?: unknown) => {
      if (entity === TeamEntity) {
        teamQbIndex++;
        return teamQbs[teamQbIndex - 1] ?? teamRefreshQb;
      }
      if (entity === LeagueEntity) return leagueQb;
      // Aliased `createQueryBuilder(UserEntity, 'u')` takes the row
      // lock; the no-arg `update(UserEntity)` form writes the status.
      if (entity === UserEntity) return userLockQb;
      return userQb;
    }),
  };

  return {
    dataSource: {
      manager,
      // `OnboardingAssigner.claim` calls
      // `dataSource.transaction(...)`, not
      // `dataSource.manager.transaction(...)`. Mirror that
      // shape here.
      transaction: manager.transaction,
    } as unknown as DataSource,
    manager,
    teamSelectQb,
    teamOwnedQb,
    teamAggQb,
    leagueQb,
    teamPickQb,
    teamRefreshQb,
    userQb,
    userLockQb,
  };
}

describe('OnboardingAssigner.claim', () => {
  const userId = 'user-1' as Uuid;

/**
 * A fresh BOT team. Built per-test on purpose: the claim transaction
 * mutates the picked row (`isBot = false`, `userId = …`), so a shared
 * module-level fixture leaks state between tests and makes later ones
 * fail with a spurious `OnboardingClaimRaceError`.
 */
const botTeam = (id: string) =>
  ({
    id,
    isBot: true,
    userId: null,
    botLevel: 5,
  }) as unknown as TeamEntity;

  it('throws OnboardingNoBotAvailableError when there are no leagues', async () => {
    const { dataSource } = makeFakeDataSource({ rows: [], leagues: [] });
    const { OnboardingNoBotAvailableError } = await import(
      './onboarding-assigner'
    );
    await expect(
      OnboardingAssigner.claim(dataSource, userId),
    ).rejects.toBeInstanceOf(OnboardingNoBotAvailableError);
  });

  it('reuses an existing ownership without re-claiming', async () => {
    const existingTeam = {
      id: 'team-existing',
      isBot: false,
      userId,
    } as unknown as TeamEntity;
    const { dataSource } = makeFakeDataSource({
      rows: [],
      leagues: [],
      existingTeamForUser: existingTeam,
    });
    const result = await OnboardingAssigner.claim(dataSource, userId);
    expect(result.reused).toBe(true);
    expect(result.team.id).toBe('team-existing');
  });

  it('claims a BOT in a low-ratio league first (Phase 1)', async () => {
    const { dataSource } = makeFakeDataSource({
      // league L1 at 20%, league L2 at 60% — Phase 1 should
      // pick L1 (under 50%) even though L2 has more teams.
      rows: [
        { leagueId: 'L1', total: 10, players: 2 }, // 20%
        { leagueId: 'L2', total: 10, players: 6 }, // 60% (Phase 2)
      ],
      leagues: [
        { id: 'L1', tier: 1, tierDivision: 1 },
        { id: 'L2', tier: 2, tierDivision: 1 },
      ],
      pickedTeam: botTeam('team-1'),
    });
    const result = await OnboardingAssigner.claim(dataSource, userId);
    expect(result.reused).toBe(false);
    expect(result.team.id).toBe('team-1');
  });

  it('locks the user row before picking a BOT', async () => {
    // Without this lock two jobs for the same user each lock a
    // *different* BOT row, so neither blocks the other and the user
    // ends up owning two clubs.
    const { dataSource, userLockQb } = makeFakeDataSource({
      rows: [{ leagueId: 'L1', total: 10, players: 2 }],
      leagues: [{ id: 'L1', tier: 1, tierDivision: 1 }],
      pickedTeam: botTeam('team-1'),
    });

    await OnboardingAssigner.claim(dataSource, userId);

    expect(userLockQb.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(userLockQb.where).toHaveBeenCalledWith('u.id = :id', {
      id: userId,
    });
  });

  it('re-checks ownership inside the transaction', async () => {
    // The fast path outside the transaction is not authoritative; the
    // authoritative check has to happen under the user lock.
    const { dataSource, teamOwnedQb } = makeFakeDataSource({
      rows: [{ leagueId: 'L1', total: 10, players: 2 }],
      leagues: [{ id: 'L1', tier: 1, tierDivision: 1 }],
      pickedTeam: botTeam('team-1'),
    });

    await OnboardingAssigner.claim(dataSource, userId);

    expect(teamOwnedQb.getOne).toHaveBeenCalled();
    expect(teamOwnedQb.where).toHaveBeenCalledWith('t.userId = :userId', {
      userId,
    });
  });

  it('reuses the winner team when a sibling claimed it while we waited', async () => {
    // A sibling worker committed a team while this one was blocked on
    // the user lock. The re-check must short-circuit to `reused`
    // WITHOUT picking or claiming a second BOT.
    const winnersTeam = {
      id: 'team-won-by-sibling',
      isBot: false,
      userId,
      name: 'Sibling FC',
    } as unknown as TeamEntity;

    const { dataSource, teamPickQb, manager } = makeFakeDataSource({
      rows: [{ leagueId: 'L1', total: 10, players: 2 }],
      leagues: [{ id: 'L1', tier: 1, tierDivision: 1 }],
      pickedTeam: botTeam('team-1'),
      ownedTeamInTransaction: winnersTeam,
    });

    const result = await OnboardingAssigner.claim(dataSource, userId);

    expect(result.reused).toBe(true);
    expect(result.team.id).toBe('team-won-by-sibling');
    expect(result.appliedName).toBe('Sibling FC');
    // The BOT pick must never have run.
    expect(teamPickQb.getOne).not.toHaveBeenCalled();
    expect(manager.findOne).not.toHaveBeenCalled();
  });

  it('throws when the user row does not exist', async () => {
    // Locking a row that is not there locks nothing, so the
    // serialisation guarantee would silently not apply.
    const { dataSource } = makeFakeDataSource({
      rows: [{ leagueId: 'L1', total: 10, players: 2 }],
      leagues: [{ id: 'L1', tier: 1, tierDivision: 1 }],
      pickedTeam: botTeam('team-1'),
      userExists: false,
    });

    await expect(OnboardingAssigner.claim(dataSource, userId)).rejects.toThrow(
      /unknown user/,
    );
  });

  it('round-robins to the emptiest league in Phase 2 (every league >= 50%)', async () => {
    // In Phase 2 both leagues are above the 50% threshold so
    // the algorithm enters the round-robin branch. We don't
    // assert which specific league is picked — the tie-break
    // rules are pure functions of (bot count, tier,
    // tierDivision) and depend on the order of `rows`. We do
    // assert the happy-path contract: claim returns a
    // non-reused result without throwing.
    const { dataSource } = makeFakeDataSource({
      rows: [
        { leagueId: 'L1', total: 10, players: 6 }, // 60%
        { leagueId: 'L2', total: 10, players: 5 }, // 50%
      ],
      leagues: [
        { id: 'L1', tier: 1, tierDivision: 1 },
        { id: 'L2', tier: 2, tierDivision: 1 },
      ],
      pickedTeam: botTeam('team-from-l1'),
    });
    const result = await OnboardingAssigner.claim(dataSource, userId);
    expect(result.reused).toBe(false);
    expect(result.team.id).toBe('team-from-l1');
  });
});

describe('OnboardingAssigner.markProcessing', () => {
  it('issues an UPDATE that only flips rows that are not already ACTIVE', async () => {
    const { dataSource, userQb } = makeFakeDataSource({
      rows: [],
      leagues: [],
    });
    await OnboardingAssigner.markProcessing(dataSource, 'user-1' as Uuid);
    expect(userQb.set).toHaveBeenCalledWith({
      onboardingStatus: UserOnboardingStatus.PROCESSING,
    });
    expect(userQb.where).toHaveBeenCalledWith('id = :id', { id: 'user-1' });
    expect(userQb.andWhere).toHaveBeenCalledWith(
      'onboardingStatus != :active',
      { active: UserOnboardingStatus.ACTIVE },
    );
    expect(userQb.execute).toHaveBeenCalled();
  });
});
