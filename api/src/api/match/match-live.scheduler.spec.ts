import { MatchEntity, MatchEventEntity } from '@goalxi/database';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MatchCacheService } from './match-cache.service';
import { MatchLiveGateway } from './match-live.gateway';
import { MatchLiveScheduler } from './match-live.scheduler';

/**
 * Regression coverage for `MatchLiveScheduler.processRevealableEvents`.
 *
 * Two things broke before this spec existed:
 *
 *   1. **Score-cumulative bug (B6):** the old `processMatchEvents` reset
 *      `homeScore = 0; awayScore = 0;` on every tick and counted goals
 *      from the *batch delta*. The 2nd goal in a match would broadcast
 *      `1-0` and overwrite the `2-0` the prior tick had set. The client
 *      `useMatchPage` hook (`setMatchState` → `homeScore: data.homeScore`)
 *      took the broadcast verbatim, so the scoreline visibly rewound on
 *      every goal after the first. Pinning the cumulative behavior in
 *      tests stops a future refactor from quietly reintroducing this.
 *
 *   2. **Hot-path relations (B7):** the per-tick `find()` carried
 *      `relations: ['match', 'team', 'player']` even though none of
 *      those columns were read downstream. The bug-prone-by-itself
 *      surface is small, but the wasted JOINs on every 5s tick add up
 *      on matchday weekends when the batch crosses 100s of rows.
 *      We pin `find()` is called without a `relations` option.
 *
 * `processLineupBroadcasts` and `processMatchCompletions` are not
 * covered here — they already have the `lineup_broadcast_at IS NULL`
 * / `match_end_broadcast_at IS NULL` markers guarding them (see the
 * header on `AddMatchBroadcastTimestamps` migration), and the
 * broadcast contracts are simple value-forwards. Adding coverage for
 * the new partial index SQL is a separate test (lives in
 * `match-event.partial-index.spec.ts` if/when that gets added).
 */
describe('MatchLiveScheduler — processRevealableEvents (B6/B7)', () => {
  let scheduler: MatchLiveScheduler;
  let eventRepository: jest.Mocked<Repository<MatchEventEntity>>;
  let matchLiveGateway: jest.Mocked<MatchLiveGateway>;
  let matchCacheService: jest.Mocked<MatchCacheService>;

  // Build a minimal `MatchEventEntity` carrying only the columns the
  // scheduler reads (id, matchId, minute, typeName, isHome).
  const mkEvent = (overrides: Partial<MatchEventEntity>) =>
    ({
      id: overrides.id ?? `evt-${Math.random()}`,
      matchId: overrides.matchId ?? 'match-1',
      minute: overrides.minute ?? 0,
      typeName: overrides.typeName ?? 'pass',
      isHome: overrides.isHome ?? true,
      data: overrides.data ?? null,
      eventScheduledTime: overrides.eventScheduledTime ?? new Date(),
      teamId: overrides.teamId ?? 'team-1',
      playerId: overrides.playerId ?? null,
      isRevealed: overrides.isRevealed ?? false,
    }) as MatchEventEntity;

  /**
   * Build a query builder mock that resolves `getRawMany()` to the
   * given rows. Mirrors the chained `createQueryBuilder(...).select
   * ...addSelect...where...andWhere...groupBy...getRawMany()` shape
   * the scheduler uses for the cumulative goal aggregation.
   */
  const mockAggregateQuery = (rows: Array<Record<string, unknown>>) => {
    const qb: any = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(rows),
    };
    return qb;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchLiveScheduler,
        {
          provide: getRepositoryToken(MatchEventEntity),
          useValue: {
            find: jest.fn(),
            createQueryBuilder: jest.fn(),
            update: jest.fn().mockResolvedValue({ affected: 0 }),
          },
        },
        {
          // matchRepository is injected but not exercised by
          // processRevealableEvents. Keep the token available so the
          // module compiles; the lineup / completions branches
          // exercise it but are out of scope for this spec.
          provide: getRepositoryToken(MatchEntity),
          useValue: { find: jest.fn(), update: jest.fn() },
        },
        {
          provide: MatchLiveGateway,
          useValue: {
            broadcastEvents: jest.fn(),
            broadcastScoreUpdate: jest.fn(),
          },
        },
        {
          provide: MatchCacheService,
          useValue: {
            invalidateMatchCache: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    scheduler = module.get<MatchLiveScheduler>(MatchLiveScheduler);
    eventRepository = module.get<Repository<MatchEventEntity>>(
      getRepositoryToken(MatchEventEntity),
    ) as jest.Mocked<Repository<MatchEventEntity>>;
    matchLiveGateway = module.get<MatchLiveGateway>(
      MatchLiveGateway,
    ) as jest.Mocked<MatchLiveGateway>;
    matchCacheService = module.get<MatchCacheService>(
      MatchCacheService,
    ) as jest.Mocked<MatchCacheService>;
  });

  // ── B6: cumulative score monotonicity ──────────────────────────────

  it('broadcasts 1-0 after the first home goal in a match', async () => {
    // First tick: one new home goal just got revealed. Cumulative
    // (across all currently-revealed events) is home=1, away=0.
    eventRepository.find.mockResolvedValue([
      mkEvent({
        id: 'g1',
        matchId: 'match-1',
        typeName: 'goal',
        isHome: true,
        minute: 12,
      }),
    ]);
    eventRepository.createQueryBuilder.mockReturnValue(
      mockAggregateQuery([
        { matchId: 'match-1', homeGoals: '1', awayGoals: '0', maxMinute: '12' },
      ]),
    );

    await scheduler.processRevealableEvents();

    expect(matchLiveGateway.broadcastEvents).toHaveBeenCalledWith('match-1', [
      expect.objectContaining({ id: 'g1', minute: 12, type: 'goal' }),
    ]);
    expect(matchLiveGateway.broadcastScoreUpdate).toHaveBeenCalledWith(
      'match-1',
      1,
      0,
      12,
    );
  });

  it('broadcasts 2-0 (NOT 1-0) on the second tick when a second home goal lands', async () => {
    // This is the load-bearing regression case. Pre-fix the second
    // tick would push 1-0 (the new-batch goal count) and overwrite the
    // 2-0 the first tick had set on the client. The fix pulls the
    // cumulative count from the DB.
    eventRepository.find.mockResolvedValue([
      mkEvent({
        id: 'g2',
        matchId: 'match-1',
        typeName: 'goal',
        isHome: true,
        minute: 47,
      }),
    ]);
    eventRepository.createQueryBuilder.mockReturnValue(
      mockAggregateQuery([
        { matchId: 'match-1', homeGoals: '2', awayGoals: '0', maxMinute: '47' },
      ]),
    );

    await scheduler.processRevealableEvents();

    expect(matchLiveGateway.broadcastScoreUpdate).toHaveBeenCalledWith(
      'match-1',
      2,
      0,
      47,
    );
  });

  it('broadcasts 2-1 (NOT 0-1) on a tick where the new goal is away but a prior home goal exists', async () => {
    // Cross-side accumulation: 1 prior home goal + 1 new away goal
    // must report 2-1, not 0-1. Same bug class as above, different
    // shape — pinning the away-side path explicitly because the
    // `isHome = false` FILTER clause is the easiest place for a
    // future refactor to flip a sign.
    eventRepository.find.mockResolvedValue([
      mkEvent({
        id: 'g3',
        matchId: 'match-1',
        typeName: 'goal',
        isHome: false,
        minute: 78,
      }),
    ]);
    eventRepository.createQueryBuilder.mockReturnValue(
      mockAggregateQuery([
        { matchId: 'match-1', homeGoals: '2', awayGoals: '1', maxMinute: '78' },
      ]),
    );

    await scheduler.processRevealableEvents();

    expect(matchLiveGateway.broadcastScoreUpdate).toHaveBeenCalledWith(
      'match-1',
      2,
      1,
      78,
    );
  });

  it('counts penalty_goal toward the cumulative total', async () => {
    // `penalty_goal` shares the goal typeName bucket on the FE
    // (alias map in `match-timeline.ts`), so the server's
    // `IN ('goal', 'penalty_goal')` filter must include it.
    eventRepository.find.mockResolvedValue([
      mkEvent({
        id: 'pg1',
        matchId: 'match-1',
        typeName: 'penalty_goal',
        isHome: true,
        minute: 90,
      }),
    ]);
    eventRepository.createQueryBuilder.mockReturnValue(
      mockAggregateQuery([
        { matchId: 'match-1', homeGoals: '1', awayGoals: '0', maxMinute: '90' },
      ]),
    );

    await scheduler.processRevealableEvents();

    expect(matchLiveGateway.broadcastScoreUpdate).toHaveBeenCalledWith(
      'match-1',
      1,
      0,
      90,
    );
  });

  it('skips broadcastScoreUpdate when cumulative score is 0-0 even if non-goal events land', async () => {
    // A tick that only reveals a yellow card / substitution must
    // NOT spam the gateway with a redundant `0-0` score_update.
    eventRepository.find.mockResolvedValue([
      mkEvent({
        id: 'y1',
        matchId: 'match-1',
        typeName: 'yellow_card',
        isHome: true,
        minute: 22,
      }),
    ]);
    eventRepository.createQueryBuilder.mockReturnValue(
      mockAggregateQuery([
        { matchId: 'match-1', homeGoals: '0', awayGoals: '0', maxMinute: '22' },
      ]),
    );

    await scheduler.processRevealableEvents();

    expect(matchLiveGateway.broadcastEvents).toHaveBeenCalledTimes(1);
    expect(matchLiveGateway.broadcastScoreUpdate).not.toHaveBeenCalled();
  });

  it('returns early without any DB call when there are no pending events', async () => {
    // Idle tick: no events, no aggregate query, no broadcasts. Keeps
    // the per-tick cost at one `find()` returning [].
    eventRepository.find.mockResolvedValue([]);

    await scheduler.processRevealableEvents();

    expect(eventRepository.createQueryBuilder).not.toHaveBeenCalled();
    expect(matchLiveGateway.broadcastEvents).not.toHaveBeenCalled();
    expect(matchLiveGateway.broadcastScoreUpdate).not.toHaveBeenCalled();
    expect(eventRepository.update).not.toHaveBeenCalled();
  });

  // ── B7: relations-free find ───────────────────────────────────────

  it('queries events without relations (drops the match/team/player joins)', async () => {
    // Load-bearing for the hot-path perf: the per-tick find() must
    // not carry `relations: ['match', 'team', 'player']`. Any future
    // code that re-adds a relations option here is a regression
    // because the only fields the scheduler reads are scalar columns
    // on `match_event` itself.
    eventRepository.find.mockResolvedValue([]);
    eventRepository.createQueryBuilder.mockReturnValue(mockAggregateQuery([]));

    await scheduler.processRevealableEvents();

    const findCall = eventRepository.find.mock.calls[0]?.[0] as
      | { relations?: unknown }
      | undefined;
    expect(findCall?.relations).toBeUndefined();
  });

  it('marks revealed events as isRevealed=true after broadcasting', async () => {
    eventRepository.find.mockResolvedValue([
      mkEvent({
        id: 'g1',
        matchId: 'match-1',
        typeName: 'goal',
        isHome: true,
        minute: 12,
      }),
    ]);
    eventRepository.createQueryBuilder.mockReturnValue(
      mockAggregateQuery([
        { matchId: 'match-1', homeGoals: '1', awayGoals: '0', maxMinute: '12' },
      ]),
    );

    await scheduler.processRevealableEvents();

    expect(eventRepository.update).toHaveBeenCalledWith(
      { id: expect.anything() },
      { isRevealed: true },
    );
    expect(matchCacheService.invalidateMatchCache).toHaveBeenCalledWith(
      'match-1',
    );
  });

  it('handles multiple matches in one tick (one aggregate query, one broadcast per match)', async () => {
    // Two matches reveal events in the same 5s window. The scheduler
    // must issue exactly one `createQueryBuilder` call (the GROUP BY
    // covers all matchIds) and broadcast once per match.
    eventRepository.find.mockResolvedValue([
      mkEvent({
        id: 'm1-g1',
        matchId: 'match-A',
        typeName: 'goal',
        isHome: true,
        minute: 5,
      }),
      mkEvent({
        id: 'm2-g1',
        matchId: 'match-B',
        typeName: 'goal',
        isHome: false,
        minute: 30,
      }),
    ]);
    eventRepository.createQueryBuilder.mockReturnValue(
      mockAggregateQuery([
        { matchId: 'match-A', homeGoals: '1', awayGoals: '0', maxMinute: '5' },
        { matchId: 'match-B', homeGoals: '0', awayGoals: '1', maxMinute: '30' },
      ]),
    );

    await scheduler.processRevealableEvents();

    // One aggregate query for the whole tick.
    expect(eventRepository.createQueryBuilder).toHaveBeenCalledTimes(1);

    // One broadcast per match, with the right score from the
    // cumulative result.
    expect(matchLiveGateway.broadcastEvents).toHaveBeenCalledTimes(2);
    expect(matchLiveGateway.broadcastScoreUpdate).toHaveBeenCalledTimes(2);
    expect(matchLiveGateway.broadcastScoreUpdate).toHaveBeenCalledWith(
      'match-A',
      1,
      0,
      5,
    );
    expect(matchLiveGateway.broadcastScoreUpdate).toHaveBeenCalledWith(
      'match-B',
      0,
      1,
      30,
    );
  });
});
