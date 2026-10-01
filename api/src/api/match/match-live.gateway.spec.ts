import { AuthService } from '@/api/auth/auth.service';
import { MatchEventEntity, MatchStatus } from '@goalxi/database';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MatchEventService } from './match-event.service';
import { MatchLiveRedisAdapter } from './match-live-redis.adapter';
import { MatchLiveGateway } from './match-live.gateway';
import { MATCH_LIVE_RATE_LIMITER } from './match-live.module';
import { MatchService } from './match.service';

/**
 * Live-clock derivation spec — the live gateway's `getMatchState`
 * now derives `currentMinute` from wall-clock (`now - kickoff`)
 * inverted through the sim's published timing anchors (1H end at
 * 45+N1 min, 2H end at 105+N2 min, etc.) — see
 * `match-current-minute.ts`. The previous `MAX(revealed event.minute)`
 * approach got stuck between event reveals, which was the load-
 * bearing user-visible bug ("live page shows 90' for the whole
 * 2H injury band while 91' / 92' / 93' events trickle in one at
 * a time"). These tests pin the new contract.
 */
describe('MatchLiveGateway — getMatchState currentMinute (wall-clock)', () => {
  let gateway: MatchLiveGateway;
  let matchService: jest.Mocked<MatchService>;
  let eventRepository: jest.Mocked<Repository<MatchEventEntity>>;

  // mockAggregate is the canonical helper (formerly mockMaxMinute). the eventRepository's createQueryBuilder for the
  // aggregate query the gateway now uses:
  //   `SELECT MAX(minute),
  //           COUNT(*) FILTER (goal+isHome=true),
  //           COUNT(*) FILTER (goal+isHome=false)
  //    FROM event WHERE matchId = ? AND isRevealed = true`
  // All three come back in one row-trip — the homeScore/awayScore pair
  // was added when the live page "score = 2-2 at kickoff" bug was
  // fixed (read pre-baked `match.homeScore/awayScore` instead of the
  // cumulative-revealed count). The previous findOne({order:{minute:
  // DESC}}) shape was replaced with this aggregate so the gateway
  // never pulls a full entity row it doesn't need.
  //
  // Optional homeGoals/awayGoals default to 0 — most tests don't care
  // about score, only the minute clamp for COMPLETED matches.
  const mockAggregate = (
    maxMinute: number | null,
    homeGoals = 0,
    awayGoals = 0,
  ) => {
    const qb: any = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue(
        maxMinute === null
          ? null
          : {
              maxMinute: String(maxMinute),
              homeGoals: String(homeGoals),
              awayGoals: String(awayGoals),
            },
      ),
    };
    eventRepository.createQueryBuilder.mockReturnValue(qb);
    return qb;
  };

  // Build a minimal match row; only the fields `getMatchState` reads.
  // `firstHalfInjuryTime` and `secondHalfInjuryTime` default to 0 so
  // the wall-clock minute derivation lands in the 1H / 2H regulation
  // bands without per-test wiring.
  const mkMatch = (status: MatchStatus, scheduledAt = new Date()) =>
    ({
      id: 'match-1',
      homeTeamId: 'team-1',
      awayTeamId: 'team-2',
      status,
      scheduledAt,
      homeScore: 2,
      awayScore: 1,
      firstHalfInjuryTime: 0,
      secondHalfInjuryTime: 0,
      hasExtraTime: false,
      extraTimeFirstHalfInjury: 0,
      extraTimeSecondHalfInjury: 0,
      homeTeam: { id: 'team-1', name: 'Home', logoUrl: null },
      awayTeam: { id: 'team-2', name: 'Away', logoUrl: null },
    }) as any;

  beforeEach(async () => {
    // Stash the env-var escape hatch so the spec doesn't accidentally
    // try to talk to a real Redis during `attachToServer`. The
    // adapter service is mocked at the spec level below; this just
    // keeps the test hermetic on machines that happen to have one
    // running.
    process.env.MATCH_LIVE_INFRA_DISABLED = 'true';
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchLiveGateway,
        {
          provide: AuthService,
          useValue: { verifyAccessToken: jest.fn() },
        },
        {
          provide: MatchService,
          useValue: { findOne: jest.fn() },
        },
        {
          provide: MatchEventService,
          useValue: { getMatchEvents: jest.fn() },
        },
        {
          // createQueryBuilder is the only read path the gateway
          // uses for currentMinute now; findOne stays in the mock
          // for forward-compat but the new code path doesn't touch
          // it. The `mockAggregate` helper above drives this for
          // each test.
          provide: getRepositoryToken(MatchEventEntity),
          useValue: {
            createQueryBuilder: jest.fn(),
          },
        },
        {
          // Stub adapter so `afterInit` doesn't try to attach a real
          // Redis-backed adapter. The `MATCH_LIVE_RATE_LIMITER` token
          // gets a fresh in-memory limiter (no Redis).
          provide: MatchLiveRedisAdapter,
          useValue: {
            attachToServer: jest.fn(),
            getRateLimitClient: jest.fn().mockReturnValue(null),
          },
        },
        {
          provide: MATCH_LIVE_RATE_LIMITER,
          useValue: {
            tryConnect: jest.fn().mockResolvedValue({ accept: true }),
            noteDisconnect: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    gateway = module.get<MatchLiveGateway>(MatchLiveGateway);
    matchService = module.get<MatchService>(
      MatchService,
    ) as jest.Mocked<MatchService>;
    eventRepository = module.get<Repository<MatchEventEntity>>(
      getRepositoryToken(MatchEventEntity),
    ) as jest.Mocked<Repository<MatchEventEntity>>;
  });

  // Test helper — getMatchState is private, but S1 is a load-bearing
  // contract that we want pinned without spinning up a full socket.io
  // mock for join_match. Cast is fine; this is the only way to assert
  // currentMinute without a full E2E. The function takes a match row
  // directly now (the N+1 fix in the gateway has it receive the
  // already-fetched match from `handleJoinMatch`).
  const getState = (match: ReturnType<typeof mkMatch>) =>
    (
      gateway as unknown as {
        getMatchState: (m: typeof match) => Promise<unknown>;
      }
    ).getMatchState(match);

  it('returns 0 for a SCHEDULED match with no events (kickoff not reached)', async () => {
    const match = mkMatch(MatchStatus.SCHEDULED);
    mockAggregate(null);

    const state = (await getState(match)) as { currentMinute: number };
    expect(state.currentMinute).toBe(0);
  });

  it('derives currentMinute from wall-clock for an IN_PROGRESS match (event stream is no longer authoritative)', async () => {
    // The new contract: even if the preprocessor hasn't yet revealed
    // the events up to the current wall-clock minute, the on-screen
    // clock must already show the minute corresponding to
    // `now - kickoff`. This is the load-bearing fix for "live page
    // stuck at 90' during 2H injury" — the previous
    // MAX(revealed minute) approach returned 90 even after the
    // preprocessor had been ticking for 5+ minutes.
    const match = mkMatch(
      MatchStatus.IN_PROGRESS,
      new Date(Date.now() - 30 * 60 * 1000),
    );
    // The gateway now hits the event repository on the IN_PROGRESS
    // path too — for the cumulative-revealed score on match_state.
    // The minute itself is still wall-clock anchored. Empty aggregate
    // is fine here: the test asserts on currentMinute, not on score.
    mockAggregate(null);
    const state = (await getState(match)) as { currentMinute: number };
    expect(state.currentMinute).toBe(30);
  });

  it('shows the wall-clock minute even at T=0 (kickoff instant)', async () => {
    // `scheduledAt === now` is the kickoff instant. The minute is
    // still 0 (the kickoff minute itself), not 1.
    const match = mkMatch(MatchStatus.IN_PROGRESS, new Date());
    mockAggregate(null);
    const state = (await getState(match)) as { currentMinute: number };
    expect(state.currentMinute).toBe(0);
  });

  it('reports 0 strictly before kickoff (clock shows pre-kickoff)', async () => {
    // `scheduledAt` is 5 seconds in the future. Wall-clock is
    // negative, the function clamps to 0 so the live page doesn't
    // surface a "-1'" before the kickoff event is revealed.
    const match = mkMatch(
      MatchStatus.IN_PROGRESS,
      new Date(Date.now() + 5_000),
    );
    mockAggregate(null);
    const state = (await getState(match)) as { currentMinute: number };
    expect(state.currentMinute).toBe(0);
  });

  it('clamps COMPLETED to 90 even when no event crossed 90 (abandoned / short sim)', async () => {
    // A 60' abandoned match still shows "FT 90'" in the report.
    const match = mkMatch(MatchStatus.COMPLETED);
    mockAggregate(60);

    const state = (await getState(match)) as { currentMinute: number };
    expect(state.currentMinute).toBe(90);
  });

  it('preserves extra time for COMPLETED matches (max event > 90)', async () => {
    // 120-minute cup tie: the timeline must show the real 118' (or
    // whatever the last event was), not be silently clamped.
    const match = mkMatch(MatchStatus.COMPLETED);
    mockAggregate(118);

    const state = (await getState(match)) as { currentMinute: number };
    expect(state.currentMinute).toBe(118);
  });

  it('sets isComplete to true for COMPLETED matches', async () => {
    const match = mkMatch(MatchStatus.COMPLETED);
    mockAggregate(90);

    const state = (await getState(match)) as { isComplete: boolean };
    expect(state.isComplete).toBe(true);
  });
  // ── Score: IN_PROGRESS reads the cumulative-revealed count, NOT
  // the pre-baked `match.homeScore` / `match.awayScore` columns.
  // The columns are populated by the simulator at sim-completion
  // time with the *final* scoreline; reading them on join_match
  // showed the live page "2-2" the instant it connected, before
  // any goal events were revealed.

  it('returns 0-0 on an IN_PROGRESS join_match when no events are revealed yet (regression: live page reads final scoreline at kickoff)', async () => {
    // The pre-baked columns are 2-1 (sim finished, score = 2-1).
    // The aggregate is null (no events have been revealed yet — the
    // scheduler is going to reveal minute 0 events on its next tick,
    // but at join_match time the live page must NOT see 2-1).
    const match = mkMatch(
      MatchStatus.IN_PROGRESS,
      new Date(Date.now() - 5 * 60 * 1000),
    );
    mockAggregate(null);

    const state = (await getState(match)) as {
      homeScore: number;
      awayScore: number;
      currentMinute: number;
    };
    expect(state.homeScore).toBe(0);
    expect(state.awayScore).toBe(0);
    // The minute itself is still wall-clock anchored.
    expect(state.currentMinute).toBe(5);
  });

  it('returns the cumulative-revealed score on IN_PROGRESS join_match (not the pre-baked column)', async () => {
    // Pre-baked columns are 2-1 (engine final); the aggregate has
    // 1 home + 0 away (the minute-5 goal was the only one revealed
    // so far). The live page must show 1-0, not 2-1.
    const match = mkMatch(
      MatchStatus.IN_PROGRESS,
      new Date(Date.now() - 5 * 60 * 1000),
    );
    mockAggregate(5, 1, 0);

    const state = (await getState(match)) as {
      homeScore: number;
      awayScore: number;
    };
    expect(state.homeScore).toBe(1);
    expect(state.awayScore).toBe(0);
  });

  it('counts away goals and penalty_goal on the same cumulative aggregate', async () => {
    // Same shape as the scheduler's GROUP BY — penalty_goal shares the
    // bucket with goal so the FE's alias map works.
    const match = mkMatch(
      MatchStatus.IN_PROGRESS,
      new Date(Date.now() - 78 * 60 * 1000),
    );
    mockAggregate(78, 2, 3);

    const state = (await getState(match)) as {
      homeScore: number;
      awayScore: number;
    };
    expect(state.homeScore).toBe(2);
    expect(state.awayScore).toBe(3);
  });

  it('returns the same cumulative score for COMPLETED matches (pre-baked == aggregate when everything is revealed)', async () => {
    // For COMPLETED, the sim has run all 90 minutes and the
    // scheduler has flipped isRevealed on every event. The
    // aggregate's count is therefore guaranteed to equal the
    // pre-baked column — switching the read source should be
    // invisible to the client. Pin it so a future refactor can't
    // quietly diverge the two.
    const match = mkMatch(MatchStatus.COMPLETED);
    mockAggregate(90, 2, 1);

    const state = (await getState(match)) as {
      homeScore: number;
      awayScore: number;
      currentMinute: number;
    };
    expect(state.homeScore).toBe(2);
    expect(state.awayScore).toBe(1);
    expect(state.currentMinute).toBe(90);
  });
});

// ============================================================================
// handleJoinMatch — B8 subscription guard + error_msg event
// ============================================================================

describe('MatchLiveGateway — handleJoinMatch (B8)', () => {
  let gateway: MatchLiveGateway;
  let matchService: jest.Mocked<MatchService>;
  let eventRepository: jest.Mocked<Repository<MatchEventEntity>>;
  let matchEventService: jest.Mocked<MatchEventService>;

  // Helper — build a minimal Socket stub. The gateway uses
  // `client.id`, `client.join`, `client.emit`, `client.disconnect`,
  // and `client.handshake.address` in the relevant code paths.
  const mkClient = (id = 'sock-1'): any => {
    const emitted: Array<{ event: string; payload: unknown }> = [];
    const joined: string[] = [];
    return {
      id,
      emit: jest.fn((event: string, payload: unknown) => {
        emitted.push({ event, payload });
      }),
      join: jest.fn(async (room: string) => {
        joined.push(room);
      }),
      disconnect: jest.fn(),
      handshake: { address: '127.0.0.1' },
      _emitted: emitted,
      _joined: joined,
    };
  };

  const mkMatch = (status: MatchStatus, scheduledAt = new Date()) =>
    ({
      id: 'match-1',
      homeTeamId: 'team-1',
      awayTeamId: 'team-2',
      status,
      scheduledAt,
      homeScore: 0,
      awayScore: 0,
      homeTeam: { id: 'team-1', name: 'Home', logoUrl: null },
      awayTeam: { id: 'team-2', name: 'Away', logoUrl: null },
    }) as any;

  beforeEach(async () => {
    process.env.MATCH_LIVE_INFRA_DISABLED = 'true';
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchLiveGateway,
        {
          provide: AuthService,
          useValue: { verifyAccessToken: jest.fn() },
        },
        {
          provide: MatchService,
          useValue: { findOne: jest.fn() },
        },
        {
          provide: MatchEventService,
          useValue: { getMatchEvents: jest.fn() },
        },
        {
          provide: getRepositoryToken(MatchEventEntity),
          useValue: { createQueryBuilder: jest.fn() },
        },
        {
          provide: MatchLiveRedisAdapter,
          useValue: {
            attachToServer: jest.fn(),
            getRateLimitClient: jest.fn().mockReturnValue(null),
          },
        },
        {
          provide: MATCH_LIVE_RATE_LIMITER,
          useValue: {
            tryConnect: jest.fn().mockResolvedValue({ accept: true }),
            noteDisconnect: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    gateway = module.get<MatchLiveGateway>(MatchLiveGateway);
    matchService = module.get<MatchService>(
      MatchService,
    ) as jest.Mocked<MatchService>;
    eventRepository = module.get<Repository<MatchEventEntity>>(
      getRepositoryToken(MatchEventEntity),
    ) as jest.Mocked<Repository<MatchEventEntity>>;
    matchEventService = module.get<MatchEventService>(
      MatchEventService,
    ) as jest.Mocked<MatchEventService>;
  });

  // Helper — invoke the private handler.
  const join = (client: ReturnType<typeof mkClient>, matchId: string) =>
    (
      gateway as unknown as {
        handleJoinMatch: (
          c: typeof client,
          p: { matchId: string },
        ) => Promise<void>;
      }
    ).handleJoinMatch(client, { matchId });

  it('emits error_msg and skips room join when the match is not subscribable (e.g. SCHEDULED far in the future)', async () => {
    // SCHEDULED match 2 hours in the future: not in lineup window,
    // not in_progress, not completed → canSubscribeMatch = false.
    const match = mkMatch(
      MatchStatus.SCHEDULED,
      new Date(Date.now() + 2 * 60 * 60 * 1000),
    );
    matchService.findOne.mockResolvedValue(match);

    const client = mkClient();
    await join(client, 'match-1');

    // B8 fix: server-sent error uses `error_msg`, NOT `error`. The
    // `error` event name is reserved by socket.io for transport-
    // level errors and would never reach a `socket.on('error')`
    // listener on the client.
    const errorEmits = client._emitted.filter((e) => e.event === 'error_msg');
    expect(errorEmits).toHaveLength(1);
    expect(errorEmits[0].payload).toEqual({ message: 'Match not available' });

    // Reject path must NOT touch the room — the socket should
    // never appear in `matchSocketsMap` either.
    expect(client._joined).toHaveLength(0);
    const sockets = (gateway as any).matchSocketsMap as Map<
      string,
      Set<string>
    >;
    expect(sockets.has('match-1')).toBe(false);
  });

  it('joins the room and emits match_state when the match is subscribable', async () => {
    const match = mkMatch(MatchStatus.IN_PROGRESS);
    matchService.findOne.mockResolvedValue(match);

    const qb: any = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest
        .fn()
        .mockResolvedValue({ maxMinute: '12', homeGoals: '0', awayGoals: '0' }),
    };
    eventRepository.createQueryBuilder.mockReturnValue(qb);
    matchEventService.getMatchEvents.mockResolvedValue({
      matchId: 'match-1',
      homeTeam: { id: 'team-1', name: 'Home', logo: null },
      awayTeam: { id: 'team-2', name: 'Away', logo: null },
      scheduledAt: new Date(),
      currentMinute: 12,
      totalMinutes: 95,
      isComplete: false,
      events: [],
      currentScore: { home: 0, away: 0 },
      stats: null,
    });

    const client = mkClient();
    await join(client, 'match-1');

    expect(client._joined).toEqual(['match:match-1']);
    const emitted = client._emitted.map((e) => e.event);
    expect(emitted).toContain('match_state');
    expect(emitted).toContain('match_events');
    // No error_msg on the success path.
    expect(emitted).not.toContain('error_msg');
  });

  it('emits error_msg with a generic message when matchService.findOne throws (does not leak NotFoundException)', async () => {
    // findOne throws NotFoundException for unknown matchId; the
    // gateway must surface a generic message so an attacker can't
    // probe matchId existence.
    matchService.findOne.mockRejectedValue(
      new (require('@nestjs/common').NotFoundException)('Match not found'),
    );

    const client = mkClient();
    await join(client, 'unknown-match');

    const errorEmits = client._emitted.filter((e) => e.event === 'error_msg');
    expect(errorEmits).toHaveLength(1);
    // The "Match not found" text from the exception must NOT appear
    // in the wire payload.
    expect(JSON.stringify(errorEmits[0].payload)).not.toContain(
      'Match not found',
    );
  });
});

// RFC 0002 — Two-Axis Event Coding (Phase 2). The gateway
// payload must include the new (eventClassId, outcomeId,
// outcomeCode) tuple alongside the legacy `typeName` for
// the 1-week Phase 2 soak. A source-level tripwire is
// enough — the gateway is a thin shim over the entity, and
// a future refactor that drops the dual-write would break
// the FE live feed's two-axis classification.
describe('MatchLiveGateway — RFC 0002 two-axis event payload', () => {
  it('source: payload includes eventClassId/outcomeId/outcomeCode from the entity', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, 'match-live.gateway.ts'),
      'utf8',
    );
    // The unique signature of the RFC 0002 dual-write: three
    // `e.<field>` reads in the `response.events.map(...)` block,
    // with the new tuple mapped to the wire payload.
    expect(src).toMatch(/eventClassId:\s*e\.eventClassId/);
    expect(src).toMatch(/outcomeId:\s*e\.outcomeId/);
    expect(src).toMatch(/outcomeCode:\s*e\.outcomeCode/);
  });
});
