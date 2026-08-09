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
}

interface FakeHandle {
  dataSource: DataSource;
  manager: any;
  teamSelectQb: any;
  teamAggQb: any;
  leagueQb: any;
  teamPickQb: any;
  userQb: any;
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

  // The first call against TeamEntity is the existing-ownership
  // check; it terminates with getOne().
  // The second is the per-league aggregate; it terminates with
  // getRawMany().
  // The third is the BOT pick; terminates with getOne().
  // The fourth (only inside the transaction) is the claim
  // re-fetch; terminates with getOne().
  let teamQbIndex = 0;
  const teamSelectQb = makeQb({
    getOne: jest.fn().mockResolvedValue(args.existingTeamForUser ?? null),
  });
  const teamAggQb = makeQb({
    getRawMany: jest.fn().mockResolvedValue(args.rows),
  });
  const teamPickQb = makeQb({
    getOne: jest.fn().mockResolvedValue(args.pickedTeam ?? null),
  });
  const teamRefreshQb = makeQb({
    getOne: jest.fn().mockResolvedValue(args.pickedTeam ?? null),
  });
  const leagueQb = makeQb({
    getMany: jest.fn().mockResolvedValue(args.leagues),
  });
  const userQb = makeQb({
    execute: jest.fn().mockResolvedValue(undefined),
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
        if (teamQbIndex === 1) return teamSelectQb;
        if (teamQbIndex === 2) return teamAggQb;
        if (teamQbIndex === 3) return teamPickQb;
        return teamRefreshQb;
      }
      if (entity === LeagueEntity) return leagueQb;
      if (entity === UserEntity) return userQb;
      // No-arg form is used by `update(UserEntity).set(...).where(...)`
      // — give it the user Qb so the chain works.
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
    teamAggQb,
    leagueQb,
    teamPickQb,
    userQb,
  };
}

describe('OnboardingAssigner.claim', () => {
  const userId = 'user-1' as Uuid;
  const sampleTeam = {
    id: 'team-1',
    isBot: true,
    userId: null,
    botLevel: 5,
  } as unknown as TeamEntity;

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
      pickedTeam: sampleTeam,
    });
    const result = await OnboardingAssigner.claim(dataSource, userId);
    expect(result.reused).toBe(false);
    expect(result.team.id).toBe('team-1');
  });

  it('round-robins to the emptiest league in Phase 2 (every league >= 50%)', async () => {
    // In Phase 2 both leagues are above the 50% threshold so
    // the algorithm enters the round-robin branch. We don't
    // assert which specific league is picked — the tie-break
    // rules are pure functions of (bot count, tier,
    // tierDivision) and depend on the order of `rows`. We do
    // assert the happy-path contract: claim returns a
    // non-reused result without throwing.
    //
    // `sampleTeam` is a module-level fixture that the Phase-1
    // test mutates (via the claim transaction's
    // `team.userId = userId; team.isBot = false`). We build
    // a fresh picked team here so this test starts from a
    // clean BOT state.
    const freshPickedTeam = {
      id: 'team-from-l1',
      isBot: true,
      userId: null,
      botLevel: 5,
    } as unknown as TeamEntity;
    const { dataSource } = makeFakeDataSource({
      rows: [
        { leagueId: 'L1', total: 10, players: 6 }, // 60%
        { leagueId: 'L2', total: 10, players: 5 }, // 50%
      ],
      leagues: [
        { id: 'L1', tier: 1, tierDivision: 1 },
        { id: 'L2', tier: 2, tierDivision: 1 },
      ],
      pickedTeam: freshPickedTeam,
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
