import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeagueAwardService } from './league-award.service';
import { LOGGER_SERVICE_PROVIDER } from '../test-utils/test-logger';
import {
  PlayerCompetitionStatsEntity,
  PlayerEventEntity,
  PlayerEventType,
  LeagueStandingEntity,
  PlayerEntity,
  TeamEntity,
  FinanceEntity,
  MatchEntity,
  LeagueEntity,
  TransactionEntity,
  TransactionType,
  Uuid,
} from '@goalxi/database';
import { cronLockPassThrough } from '../test-utils/cron-lock-mock';

describe('LeagueAwardService', () => {
  let service: LeagueAwardService;
  let statsRepo: jest.Mocked<Repository<PlayerCompetitionStatsEntity>>;
  let playerEventRepo: jest.Mocked<Repository<PlayerEventEntity>>;
  let standingRepo: jest.Mocked<Repository<LeagueStandingEntity>>;
  let playerRepo: jest.Mocked<Repository<PlayerEntity>>;
  let teamRepo: jest.Mocked<Repository<TeamEntity>>;
  let financeRepo: jest.Mocked<Repository<FinanceEntity>>;
  let matchRepo: jest.Mocked<Repository<MatchEntity>>;
  let leagueRepo: jest.Mocked<Repository<LeagueEntity>>;
  let transactionRepo: jest.Mocked<Repository<TransactionEntity>>;

  const mockStatsRepo = { findOne: jest.fn() };
  const mockPlayerEventRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const mockStandingRepo = { find: jest.fn(), findOne: jest.fn() };
  const mockPlayerRepo = { find: jest.fn(), findOne: jest.fn() };
  const mockTeamRepo = { findOne: jest.fn() };
  const mockFinanceRepo = { findOne: jest.fn(), save: jest.fn() };
  // Fluent query-builder stub. Records the WHERE/AND-WHERE predicates so
  // tests can assert the idempotency check is actually scoped per league.
  const makeQB = (rows: any[] = []) => {
    const qb: any = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(rows[0] ?? null),
      getRawMany: jest.fn().mockResolvedValue(rows),
    };
    return qb;
  };
  const mockMatchRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    manager: {
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      }),
    },
  };
  const mockLeagueRepo = { findOne: jest.fn() };
  const mockTransactionRepo = { create: jest.fn(), save: jest.fn() };

  // The whole per-league award now runs inside ONE
  // `processLeagueAwards` transaction, so every repository it touches is
  // obtained from the transaction's `EntityManager` rather than from
  // injection. The manager therefore has to hand back the SAME mocks the
  // spec asserts on — otherwise a spec can pass while the transaction
  // silently routes writes somewhere else.
  //
  // This is also the assertion that the split is closed: `addPrizeToTeam`
  // used to open its own `dataSource.transaction`, which handed it a
  // different connection entirely.
  const mockTxManager = {
    getRepository: jest.fn((entity: any) => {
      switch (entity?.name) {
        case 'PlayerCompetitionStatsEntity':
          return mockStatsRepo;
        case 'PlayerEventEntity':
          return mockPlayerEventRepo;
        case 'LeagueStandingEntity':
          return mockStandingRepo;
        case 'PlayerEntity':
          return mockPlayerRepo;
        case 'FinanceEntity':
          return mockFinanceRepo;
        case 'LeagueEntity':
          return mockLeagueRepo;
        case 'TransactionEntity':
          return mockTransactionRepo;
        default:
          throw new Error(`mockTxManager: unmocked entity ${entity?.name}`);
      }
    }),
  };
  const mockDataSource = {
    transaction: jest.fn(async (cb: any) => cb(mockTxManager)),
  };
  // Aliases so the older leader-prize assertions keep reading clearly.
  const mockTxFinanceRepo = mockFinanceRepo;
  const mockTxTransactionRepo = mockTransactionRepo;

  beforeEach(async () => {
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
        { provide: getRepositoryToken(TeamEntity), useValue: mockTeamRepo },
        {
          provide: getRepositoryToken(FinanceEntity),
          useValue: mockFinanceRepo,
        },
        { provide: getRepositoryToken(MatchEntity), useValue: mockMatchRepo },
        { provide: getRepositoryToken(LeagueEntity), useValue: mockLeagueRepo },
        {
          provide: getRepositoryToken(TransactionEntity),
          useValue: mockTransactionRepo,
        },
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<LeagueAwardService>(LeagueAwardService);
    statsRepo = module.get(getRepositoryToken(PlayerCompetitionStatsEntity));
    playerEventRepo = module.get(getRepositoryToken(PlayerEventEntity));
    standingRepo = module.get(getRepositoryToken(LeagueStandingEntity));
    playerRepo = module.get(getRepositoryToken(PlayerEntity));
    teamRepo = module.get(getRepositoryToken(TeamEntity));
    financeRepo = module.get(getRepositoryToken(FinanceEntity));
    matchRepo = module.get(getRepositoryToken(MatchEntity));
    leagueRepo = module.get(getRepositoryToken(LeagueEntity));
    transactionRepo = module.get(getRepositoryToken(TransactionEntity));

    jest.clearAllMocks();
  });

  describe('processSeasonAwards', () => {
    it('skips the league when a CHAMPIONSHIP_TITLE event already exists for THAT league (idempotent re-run)', async () => {
      // Manager says we have one league.
      mockMatchRepo.manager.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([{ leagueId: 'league-1' }]),
      });
      // The championship has already been awarded in a prior tick.
      // This is now a scoped query-builder lookup, not `findOne`.
      mockPlayerEventRepo.createQueryBuilder.mockReturnValue(
        makeQB([
          {
            id: 'evt-existing',
            eventType: PlayerEventType.CHAMPIONSHIP_TITLE,
          },
        ]),
      );

      await service.processSeasonAwards(1);

      // No fresh awards: no event save, no transaction save, no finance save.
      expect(mockPlayerEventRepo.save).not.toHaveBeenCalled();
      expect(mockTransactionRepo.save).not.toHaveBeenCalled();
      expect(mockFinanceRepo.save).not.toHaveBeenCalled();
    });

    it('REGRESSION: awards EVERY league, not just the first one', async () => {
      // The idempotency check used to be
      // `findOne({ season, eventType: CHAMPIONSHIP_TITLE })` with NO
      // leagueId. `processSeasonAwards` loops over all leagues, so the
      // first league created a championship event and every subsequent
      // league matched that row and returned early — exactly 1 of 85
      // leagues got any award per season. This test mocked a single
      // league, which is why it never caught it.
      const LEAGUES = [
        'league-1',
        'league-2',
        'league-3',
        'league-4',
        'league-5',
      ];
      mockMatchRepo.manager.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest
          .fn()
          .mockResolvedValue(LEAGUES.map((id) => ({ leagueId: id }))),
      });

      // Simulate the REAL failure mode: the idempotency query answers
      // "already awarded" once a championship event exists anywhere in
      // the season. A correctly-scoped query answers per league.
      const writtenLeagueIds: string[] = [];
      const probedLeagueIds: (string | undefined)[] = [];
      mockPlayerEventRepo.createQueryBuilder.mockImplementation(() => {
        const qb: any = {
          _leagueId: undefined as string | undefined,
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn(function (this: any, _sql: string, params?: any) {
            if (params?.leagueId) qb._leagueId = params.leagueId;
            return qb;
          }),
          getOne: jest.fn().mockImplementation(async () => {
            probedLeagueIds.push(qb._leagueId);
            if (!qb._leagueId) return null;
            // "Already awarded" iff THIS league has a championship event.
            return writtenLeagueIds.includes(qb._leagueId)
              ? { id: 'evt' }
              : null;
          }),
        };
        return qb;
      });

      mockPlayerEventRepo.create.mockImplementation((p) => p);
      mockPlayerEventRepo.save.mockImplementation(async (p: any) => {
        if (p?.eventType === PlayerEventType.CHAMPIONSHIP_TITLE) {
          writtenLeagueIds.push(p.details.leagueId);
        }
        return p;
      });

      mockStandingRepo.find.mockResolvedValue([] as any);
      mockStandingRepo.findOne.mockResolvedValue({
        leagueId: 'league-1' as Uuid,
        teamId: 'champion-team' as Uuid,
        position: 1,
        team: { id: 'champion-team' as Uuid, name: 'T1' } as TeamEntity,
      } as any);
      mockPlayerRepo.find.mockResolvedValue([] as any);
      mockLeagueRepo.findOne.mockResolvedValue({
        id: 'league-1' as Uuid,
        tier: 1,
      } as LeagueEntity);
      mockStatsRepo.findOne.mockResolvedValue({
        goals: 0,
        assists: 0,
        tackles: 0,
      } as any);

      await service.processSeasonAwards(1);

      // Every league must be probed — the whole bug was that leagues
      // 2..N short-circuited on league 1's event.
      expect(mockPlayerEventRepo.createQueryBuilder).toHaveBeenCalledTimes(
        LEAGUES.length,
      );
      // AND each probe must be scoped to that league. Without the
      // `details->>'leagueId' = :leagueId` predicate the query would
      // answer "already awarded" for every league after the first.
      expect(probedLeagueIds).toEqual(LEAGUES);
    });

    it('awards champion title, golden boot, assists leader, tackles leader, and prize money', async () => {
      // ── Setup: 1 league with 8 standings (1-8) for prize money. ───────
      mockMatchRepo.manager.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([{ leagueId: 'league-1' }]),
      });

      // No prior championship event — processLeagueAwards should run.
      mockPlayerEventRepo.createQueryBuilder.mockReturnValue(makeQB([]));

      const championTeamId = 'champion-team' as Uuid;
      const standings = Array.from({ length: 8 }, (_, i) => ({
        leagueId: 'league-1' as Uuid,
        teamId: (i === 0 ? championTeamId : `team-${i + 1}`) as Uuid,
        position: i + 1,
        team: {
          id: (i === 0 ? championTeamId : `team-${i + 1}`) as Uuid,
          name: `T${i + 1}`,
        } as TeamEntity,
      }));
      mockStandingRepo.find.mockResolvedValue(standings as any);
      // awardChampion looks up the position-1 standing to find the champion.
      mockStandingRepo.findOne.mockResolvedValue(standings[0] as any);

      // Champion team has 2 players → 2 championship events.
      mockPlayerRepo.find.mockResolvedValueOnce([
        { id: 1, teamId: championTeamId } as unknown as PlayerEntity,
        { id: 2, teamId: championTeamId } as unknown as PlayerEntity,
      ]);
      mockPlayerEventRepo.create.mockImplementation((p) => p);
      mockPlayerEventRepo.save.mockResolvedValue({} as any);

      // League lookup for prize tier.
      mockLeagueRepo.findOne.mockResolvedValue({
        id: 'league-1' as Uuid,
        name: 'Tier 1 League',
        tier: 1,
      } as LeagueEntity);
      mockFinanceRepo.findOne.mockResolvedValue({
        teamId: championTeamId,
        balance: 1_000_000,
      } as FinanceEntity);
      mockTransactionRepo.create.mockImplementation((t) => t);
      mockTransactionRepo.save.mockResolvedValue({} as any);
      mockFinanceRepo.save.mockResolvedValue({} as any);

      // ── Stats for golden boot / assists / tackles leader. ────────────
      // Each call returns a different leader with non-zero numbers.
      mockStatsRepo.findOne
        .mockResolvedValueOnce({
          playerId: 10,
          leagueId: 'league-1' as Uuid,
          season: 1,
          goals: 20,
          assists: 0,
          tackles: 0,
        } as any) // golden boot
        .mockResolvedValueOnce({
          playerId: 11,
          leagueId: 'league-1' as Uuid,
          season: 1,
          goals: 0,
          assists: 12,
          tackles: 0,
        } as any) // assists leader
        .mockResolvedValueOnce({
          playerId: 12,
          leagueId: 'league-1' as Uuid,
          season: 1,
          goals: 0,
          assists: 0,
          tackles: 40,
        } as any); // tackles leader

      // addPrizeToTeam fetches the player → their team → that team's finance.
      // Reuse the existing finance mock and player mock for each leader.
      mockPlayerRepo.findOne.mockImplementation(async (opts: any) => {
        const id = opts.where.id;
        return {
          10: { id: 10, teamId: 'team-boot' as Uuid },
          11: { id: 11, teamId: 'team-assist' as Uuid },
          12: { id: 12, teamId: 'team-tackle' as Uuid },
        }[id];
      });
      // The transaction re-reads the balance under a write lock.
      mockTxFinanceRepo.findOne.mockResolvedValue({
        id: 'fin-1',
        teamId: 'champion-team' as Uuid,
        balance: 1_000_000,
      } as any);
      mockTxFinanceRepo.save.mockResolvedValue({} as any);
      mockTxTransactionRepo.create.mockImplementation((t: any) => t);
      mockTxTransactionRepo.save.mockResolvedValue({} as any);

      await service.processSeasonAwards(1);

      // 5 player events in total: 2 championship (one per champion-team
      // player, now written in a SINGLE batched save) + 3 individual
      // awards (golden boot, assists, tackles).
      //
      // Asserted on events CREATED rather than `save()` call count: the
      // championship events were previously written one `save()` per
      // player, which is exactly the shape that lost 10 of 16 titles when
      // the 11th `save` failed. Asserting the call count would pin that
      // N-round-trips-per-team behaviour back in place.
      const createdEventTypes = mockPlayerEventRepo.create.mock.calls.map(
        (c: any) => c[0].eventType,
      );
      expect(
        createdEventTypes.filter(
          (t: string) => t === PlayerEventType.CHAMPIONSHIP_TITLE,
        ),
      ).toHaveLength(2);
      expect(createdEventTypes).toHaveLength(5);
      // The two championship events share one save.
      expect(mockPlayerEventRepo.save).toHaveBeenCalledTimes(4);

      // Ledger rows: 8 prize-money transactions + 3 leader
      // `addPrizeToTeam` rows. Finance saves likewise 8 + 3.
      //
      // The leader prizes used to write to a DIFFERENT repository — the
      // one handed to the nested `dataSource.transaction` that
      // `addPrizeToTeam` opened itself, i.e. a separate connection, so
      // its commit was independent of the awards around it. They now
      // share this transaction, which is why the counts merge here.
      expect(mockTransactionRepo.save).toHaveBeenCalledTimes(11);
      expect(mockFinanceRepo.save).toHaveBeenCalledTimes(11);

      // The three leader prizes each wrote a ledger row alongside their
      // balance bump — the original bug was money with no record.
      expect(mockTransactionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 100_000,
          type: TransactionType.OTHER_INCOME,
        }),
      );
    });

    it('REGRESSION: leader prizes write a ledger row (was unaccounted money)', async () => {
      // `addPrizeToTeam` used to be a bare `finance.balance += amount`
      // with NO TransactionEntity, which made £100k x 3 awards x 85
      // leagues per season invisible in the finance history AND absent
      // from `archived_transaction` (the archive reads `transaction`).
      mockMatchRepo.manager.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([{ leagueId: 'league-1' }]),
      });
      mockPlayerEventRepo.createQueryBuilder.mockReturnValue(makeQB([]));
      mockStandingRepo.find.mockResolvedValue([] as any);
      mockStandingRepo.findOne.mockResolvedValue(null as any);
      mockPlayerRepo.find.mockResolvedValue([] as any);
      mockLeagueRepo.findOne.mockResolvedValue({
        id: 'league-1' as Uuid,
        tier: 1,
      } as LeagueEntity);
      mockStatsRepo.findOne
        .mockResolvedValueOnce({
          playerId: 10,
          goals: 20,
          assists: 0,
          tackles: 0,
        } as any)
        .mockResolvedValueOnce({
          playerId: 11,
          goals: 0,
          assists: 12,
          tackles: 0,
        } as any)
        .mockResolvedValueOnce({
          playerId: 12,
          goals: 0,
          assists: 0,
          tackles: 40,
        } as any);
      // Each award winner is on a real team with a finance row.
      mockPlayerRepo.findOne.mockImplementation(async (opts: any) => ({
        teamId: `team-${opts.where.id}`,
      }));
      mockFinanceRepo.findOne.mockResolvedValue({
        id: 'fin-1',
        teamId: 'team-10',
        balance: 0,
      } as any);
      mockTxFinanceRepo.findOne.mockResolvedValue({
        id: 'fin-1',
        teamId: 'team-10',
        balance: 0,
      } as any);
      mockTxTransactionRepo.create.mockImplementation((t: any) => t);
      mockTxTransactionRepo.save.mockResolvedValue({} as any);
      mockTxFinanceRepo.save.mockResolvedValue({} as any);

      await service.processSeasonAwards(1);

      // One ledger row per player award, carrying the amount.
      expect(mockTxTransactionRepo.save).toHaveBeenCalledTimes(3);
      const rows = mockTxTransactionRepo.create.mock.calls.map(
        (c: any[]) => c[0],
      );
      for (const row of rows) {
        expect(row.amount).toBe(100_000);
        expect(row.season).toBe(1);
        expect(row.description).toEqual(expect.any(String));
        expect(row.teamId).toEqual(expect.any(String));
      }
    });

    it('skips a leader award when the top stat row has zero', async () => {
      // Single league.
      mockMatchRepo.manager.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([{ leagueId: 'league-1' }]),
      });
      mockPlayerEventRepo.createQueryBuilder.mockReturnValue(makeQB([]));

      // Empty standings → no prize money, no champion.
      mockStandingRepo.find.mockResolvedValue([] as any);
      mockStandingRepo.findOne.mockResolvedValue(null as any);
      // awardChampion would crash on a missing player list — make
      // sure the find returns an empty array (not undefined) so
      // the for-of loops over zero items.
      mockPlayerRepo.find.mockResolvedValue([] as any);

      // No top scorers, no top assisters, no top tacklers.
      mockStatsRepo.findOne.mockResolvedValue({
        goals: 0,
        assists: 0,
        tackles: 0,
      } as any);

      await service.processSeasonAwards(1);

      // No events, no transactions.
      expect(mockPlayerEventRepo.save).not.toHaveBeenCalled();
      expect(mockTransactionRepo.save).not.toHaveBeenCalled();
    });
  });
});
