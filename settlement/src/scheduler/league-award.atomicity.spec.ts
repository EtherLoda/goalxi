import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { LeagueAwardService } from './league-award.service';
import { LOGGER_SERVICE_PROVIDER } from '../test-utils/test-logger';
import { cronLockPassThrough } from '../test-utils/cron-lock-mock';
import {
  PlayerCompetitionStatsEntity,
  PlayerEventEntity,
  PlayerEventType,
  LeagueStandingEntity,
  PlayerEntity,
  FinanceEntity,
  MatchEntity,
  LeagueEntity,
  TransactionEntity,
  TransactionType,
  Uuid,
} from '@goalxi/database';

/**
 * Partial-award recovery.
 *
 * ## The bug this pins down
 *
 * `processLeagueAwards` used as its idempotency latch "does a
 * CHAMPIONSHIP_TITLE event exist for this league+season", then ran the
 * five award paths via `Promise.all` with NO transaction:
 *
 *   - `awardChampion` wrote one event per player in a loop of bare
 *     `save()` calls.
 *   - `awardPrizeMoney` paid the top-8 one team at a time.
 *   - `Promise.all` rejects on the first failure but does NOT cancel its
 *     siblings, so an `awardPrizeMoney` failure still let `awardChampion`
 *     finish writing its latch.
 *
 * A failure at player 11 of 16 therefore left players 1-10 holding a
 * title, and a failure paying team 4 of 8 left teams 1-3 paid. The next
 * Sunday found the latch satisfied, returned early, and the remaining 5
 * players and 5 clubs were **permanently skipped** — not recoverable by
 * re-running.
 *
 * ## The fix
 *
 * One transaction per league, so the latch and everything it guards
 * commit together. A failure rolls the latch back and the retry redoes
 * the whole league.
 *
 * ## Why this spec fakes a transaction
 *
 * The whole point is observing PARTIAL application and ROLLBACK, which
 * a mock repository that always "saves" cannot express. The
 * `dataSource.transaction` double below stages writes and only publishes
 * them if the callback resolves. Every test below is about whether
 * something reached the staged/committed sets.
 */
describe('LeagueAwardService — atomic per-league awards', () => {
  let service: LeagueAwardService;

  const mockStatsRepo = { findOne: jest.fn() };
  const mockPlayerEventRepo = {
    create: jest.fn((x: any) => x),
    save: jest.fn(async () => undefined),
    createQueryBuilder: jest.fn(),
  };
  const mockStandingRepo = { find: jest.fn(), findOne: jest.fn() };
  const mockPlayerRepo = { find: jest.fn(), findOne: jest.fn() };
  const mockLeagueRepo = { findOne: jest.fn() };
  const mockMatchRepo = {
    manager: { createQueryBuilder: jest.fn() },
  };

  /** Committed state. Only ever written by a successful transaction. */
  let events: Array<{ eventType: string; details: any }>;
  let ledger: Array<{ amount: number; type: string }>;
  let balances: Map<string, number>;

  /** When set, the next transaction aborts after staging, before commit. */
  let failNextCommit: string | null;

  const CHAMPION = 'champion-team' as Uuid;

  /** Query-builder stub answering the latch question from committed state. */
  function latchQB() {
    const qb: any = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn(
        async () =>
          events.find((e) => e.eventType === PlayerEventType.CHAMPIONSHIP_TITLE) ??
          null,
      ),
    };
    return qb;
  }

  const mockDataSource = {
    transaction: jest.fn(async (cb: any) => {
      const stagedEvents: typeof events = [];
      const stagedLedger: typeof ledger = [];
      const stagedBalances = new Map(balances);

      const manager = {
        getRepository: (entity: any) => {
          switch (entity?.name) {
            case 'PlayerCompetitionStatsEntity':
              return mockStatsRepo;
            case 'PlayerEventEntity':
              return {
                create: (x: any) => x,
                save: async (rows: any) => {
                  const list = Array.isArray(rows) ? rows : [rows];
                  stagedEvents.push(...list);
                  return list;
                },
                createQueryBuilder: () => latchQB(),
              };
            case 'LeagueStandingEntity':
              return mockStandingRepo;
            case 'PlayerEntity':
              return mockPlayerRepo;
            case 'FinanceEntity': {
              const repo = {
                findOne: async ({ where }: any) => {
                  const teamId = where.teamId;
                  if (!balances.has(teamId) && !stagedBalances.has(teamId)) {
                    return null;
                  }
                  return {
                    teamId,
                    balance: stagedBalances.get(teamId) ?? balances.get(teamId),
                  };
                },
                // `save` lives on the REPO — callers do
                // `finance.balance += x; financeRepo.save(finance)`, so an
                // entity-shaped mock with a `save` method is not enough.
                save: async (f: any) => {
                  stagedBalances.set(f.teamId, f.balance);
                  return f;
                },
              };
              return repo;
            }
            case 'LeagueEntity':
              return mockLeagueRepo;
            case 'TransactionEntity':
              return {
                create: (x: any) => x,
                save: async (rows: any) => {
                  const list = Array.isArray(rows) ? rows : [rows];
                  stagedLedger.push(...list);
                  return list;
                },
              };
            default:
              throw new Error(`txManager: unmocked entity ${entity?.name}`);
          }
        },
      };

      const result = await cb(manager);

      // A crash AFTER the writes but BEFORE the commit — the exact shape
      // that used to leave the latch set and the money unwritten.
      if (failNextCommit) {
        const reason = failNextCommit;
        failNextCommit = null;
        throw new Error(reason);
      }

      events.push(...stagedEvents);
      ledger.push(...stagedLedger);
      stagedBalances.forEach((v, k) => balances.set(k, v));
      return result;
    }),
  };

  beforeEach(async () => {
    events = [];
    ledger = [];
    balances = new Map();
    failNextCommit = null;
    jest.clearAllMocks();

    mockStatsRepo.findOne.mockResolvedValue(null);
    mockStandingRepo.find.mockResolvedValue([]);
    mockStandingRepo.findOne.mockResolvedValue(null);
    mockPlayerRepo.find.mockResolvedValue([]);
    mockPlayerRepo.findOne.mockResolvedValue(null);
    mockLeagueRepo.findOne.mockResolvedValue({
      id: 'league-1' as Uuid,
      name: 'L1',
      tier: 1,
    } as LeagueEntity);
    mockMatchRepo.manager.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([{ leagueId: 'league-1' }]),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        cronLockPassThrough,
        LeagueAwardService,
        LOGGER_SERVICE_PROVIDER,
        {
          provide: getRepositoryToken(PlayerCompetitionStatsEntity),
          useValue: mockStatsRepo,
        },
        {
          provide: getRepositoryToken(PlayerEventEntity),
          useValue: mockPlayerEventRepo,
        },
        {
          provide: getRepositoryToken(LeagueStandingEntity),
          useValue: mockStandingRepo,
        },
        { provide: getRepositoryToken(PlayerEntity), useValue: mockPlayerRepo },
        { provide: getRepositoryToken(FinanceEntity), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(MatchEntity), useValue: mockMatchRepo },
        { provide: getRepositoryToken(LeagueEntity), useValue: mockLeagueRepo },
        {
          provide: getRepositoryToken(TransactionEntity),
          useValue: { create: jest.fn((x: any) => x), save: jest.fn() },
        },
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<LeagueAwardService>(LeagueAwardService);
  });

  /** Champion has 16 players; all 8 top-table clubs have a balance. */
  function primeFullSeason(playerCount = 16) {
    const standings = Array.from({ length: 8 }, (_, i) => ({
      leagueId: 'league-1' as Uuid,
      teamId: (i === 0 ? CHAMPION : `team-${i + 1}`) as Uuid,
      position: i + 1,
      team: { name: `T${i + 1}` } as any,
    }));
    mockStandingRepo.find.mockResolvedValue(standings as any);
    mockStandingRepo.findOne.mockResolvedValue(standings[0] as any);
    mockPlayerRepo.find.mockResolvedValue(
      Array.from({ length: playerCount }, (_, i) => ({
        id: 100 + i,
        teamId: CHAMPION,
      })) as any,
    );
    standings.forEach((s) => balances.set(s.teamId, 1_000_000));
  }

  const titles = () =>
    events.filter((e) => e.eventType === PlayerEventType.CHAMPIONSHIP_TITLE);
  const prizeRows = () =>
    ledger.filter((t) => t.type === TransactionType.PRIZE_MONEY);

  it('awards all 16 titles and all 8 prizes on a clean run', async () => {
    primeFullSeason();
    await service.processSeasonAwards(1);

    expect(titles()).toHaveLength(16);
    expect(prizeRows()).toHaveLength(8);
  });

  it('commits NOTHING when the transaction aborts — including the latch', async () => {
    // THE REGRESSION. Previously the latch (a CHAMPIONSHIP_TITLE event)
    // could commit while the prize money it guards did not, and the next
    // Sunday then skipped the league forever.
    primeFullSeason();
    failNextCommit = 'connection reset';

    await expect(service.processSeasonAwards(1)).rejects.toThrow(
      'connection reset',
    );

    expect(titles()).toHaveLength(0);
    expect(prizeRows()).toHaveLength(0);
    expect(ledger).toHaveLength(0);
  });

  it('does not leave a satisfied latch after an aborted tick', async () => {
    // This is what makes the retry below possible at all.
    primeFullSeason();
    failNextCommit = 'boom';
    await expect(service.processSeasonAwards(1)).rejects.toThrow();

    expect(titles()).toHaveLength(0);
  });

  it('re-awards the FULL league after an aborted tick, not just the remainder', async () => {
    // The old shape: player 11's save threw, players 1-10 kept their
    // titles, the latch was set, and players 11-16 never got one.
    primeFullSeason();
    failNextCommit = 'boom';
    await expect(service.processSeasonAwards(1)).rejects.toThrow();

    await service.processSeasonAwards(1);

    expect(titles()).toHaveLength(16);
  });

  it('does not pay prize money twice across an abort + retry', async () => {
    primeFullSeason();
    failNextCommit = 'boom';
    await expect(service.processSeasonAwards(1)).rejects.toThrow();
    expect(prizeRows()).toHaveLength(0);

    await service.processSeasonAwards(1);

    // Exactly 8 — not 16. The aborted attempt's prize writes never
    // reached committed state.
    expect(prizeRows()).toHaveLength(8);
  });

  it('leaves every balance unchanged after an aborted tick', async () => {
    primeFullSeason();
    const before = new Map(balances);

    failNextCommit = 'boom';
    await expect(service.processSeasonAwards(1)).rejects.toThrow();

    expect(balances).toEqual(before);
  });

  it('is idempotent once a tick has committed', async () => {
    primeFullSeason();
    await service.processSeasonAwards(1);
    const afterFirst = {
      titles: titles().length,
      prizes: prizeRows().length,
      balance: balances.get(CHAMPION),
    };

    await service.processSeasonAwards(1);

    expect(titles()).toHaveLength(afterFirst.titles);
    expect(prizeRows()).toHaveLength(afterFirst.prizes);
    expect(balances.get(CHAMPION)).toBe(afterFirst.balance);
  });

  it('still credits leader prizes with a ledger row in the same transaction', async () => {
    // Guards the original "unaccounted money" bug from regressing: the
    // balance bump and its ledger row must both come from this one
    // transaction, not from a nested one.
    primeFullSeason();
    mockStandingRepo.find.mockResolvedValue([]);
    mockStatsRepo.findOne.mockResolvedValue({
      playerId: 10,
      leagueId: 'league-1' as Uuid,
      season: 1,
      goals: 20,
      assists: 0,
      tackles: 0,
    } as any);
    mockPlayerRepo.findOne.mockResolvedValue({
      id: 10,
      teamId: 'team-boot' as Uuid,
    } as any);
    balances.set('team-boot' as Uuid, 500_000);

    await service.processSeasonAwards(1);

    expect(balances.get('team-boot' as Uuid)).toBe(600_000);
    expect(ledger).toContainEqual(
      expect.objectContaining({
        amount: 100_000,
        type: TransactionType.OTHER_INCOME,
      }),
    );
  });

  it('abandons the leader prize (but keeps the rest) when a club has no finance row', async () => {
    // `addPrizeToTeam` warns and returns; the tick must still complete
    // rather than failing the whole league.
    primeFullSeason();
    mockStandingRepo.find.mockResolvedValue([]);
    mockStatsRepo.findOne.mockResolvedValue({
      playerId: 10,
      leagueId: 'league-1' as Uuid,
      season: 1,
      goals: 20,
      assists: 0,
      tackles: 0,
    } as any);
    mockPlayerRepo.findOne.mockResolvedValue({
      id: 10,
      teamId: 'team-without-finance' as Uuid,
    } as any);

    await expect(service.processSeasonAwards(1)).resolves.toBeUndefined();
    expect(titles()).toHaveLength(16);
  });
});
