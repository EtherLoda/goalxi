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
 * S1 regression spec — the live gateway's `getMatchState` used to
 * compute `currentMinute` from `now - kickoff` with a 45/60/90 heuristic.
 * That drifted from the real match timeline in two real cases:
 *   - paused matches (sim stops emitting events but wall-clock ticks)
 *   - scheduler lag (events behind by a few seconds)
 *
 * The fix pulls `max(revealed event.minute)` from the event stream
 * instead, with a `Math.max(90, ...)` clamp for COMPLETED matches.
 * These tests pin the new contract so a future refactor doesn't
 * silently regress to wall-clock.
 */
describe('MatchLiveGateway — getMatchState currentMinute (S1)', () => {
  let gateway: MatchLiveGateway;
  let matchService: jest.Mocked<MatchService>;
  let eventRepository: jest.Mocked<Repository<MatchEventEntity>>;

  // Helper to mock the eventRepository's createQueryBuilder for the
  // `SELECT MAX(minute) ... WHERE isRevealed = true` query the
  // gateway now uses. The previous `findOne({order: {minute: DESC}})`
  // shape was replaced with this aggregate so the gateway never
  // pulls a full entity row it doesn't need.
  const mockMaxMinute = (maxMinute: number | null) => {
    const qb: any = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest
        .fn()
        .mockResolvedValue(
          maxMinute === null ? null : { maxMinute: String(maxMinute) },
        ),
    };
    eventRepository.createQueryBuilder.mockReturnValue(qb);
    return qb;
  };

  // Build a minimal match row; only the fields `getMatchState` reads.
  const mkMatch = (status: MatchStatus, scheduledAt = new Date()) =>
    ({
      id: 'match-1',
      homeTeamId: 'team-1',
      awayTeamId: 'team-2',
      status,
      scheduledAt,
      homeScore: 2,
      awayScore: 1,
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
          // it. The `mockMaxMinute` helper above drives this for
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
    mockMaxMinute(null);

    const state = (await getState(match)) as { currentMinute: number };
    expect(state.currentMinute).toBe(0);
  });

  it('uses max revealed event minute for an IN_PROGRESS match (no wall-clock fallback)', async () => {
    // The whole point of S1: even if `now - kickoff` would say "75'"
    // (e.g. server is 75 wall-clock minutes past scheduledAt), if the
    // sim only emitted up to minute 40 (paused / lag), we must report 40.
    const match = mkMatch(
      MatchStatus.IN_PROGRESS,
      new Date(Date.now() - 75 * 60 * 1000),
    );
    mockMaxMinute(40);

    const state = (await getState(match)) as { currentMinute: number };
    expect(state.currentMinute).toBe(40);
  });

  it('reports 0 for an IN_PROGRESS match whose first event has not been revealed yet (kickoff window)', async () => {
    // kickoff event hasn't been revealed (the 5s scheduler tick hasn't
    // run yet, or kickoff eventScheduledTime is still in the future).
    // Pre-S1 this used to show wall-clock elapsed minutes — confusing
    // because the timeline is genuinely empty.
    const match = mkMatch(
      MatchStatus.IN_PROGRESS,
      new Date(Date.now() - 60 * 1000),
    );
    mockMaxMinute(null);

    const state = (await getState(match)) as { currentMinute: number };
    expect(state.currentMinute).toBe(0);
  });

  it('clamps COMPLETED to 90 even when no event crossed 90 (abandoned / short sim)', async () => {
    // A 60' abandoned match still shows "FT 90'" in the report.
    const match = mkMatch(MatchStatus.COMPLETED);
    mockMaxMinute(60);

    const state = (await getState(match)) as { currentMinute: number };
    expect(state.currentMinute).toBe(90);
  });

  it('preserves extra time for COMPLETED matches (max event > 90)', async () => {
    // 120-minute cup tie: the timeline must show the real 118' (or
    // whatever the last event was), not be silently clamped.
    const match = mkMatch(MatchStatus.COMPLETED);
    mockMaxMinute(118);

    const state = (await getState(match)) as { currentMinute: number };
    expect(state.currentMinute).toBe(118);
  });

  it('sets isComplete to true for COMPLETED matches', async () => {
    const match = mkMatch(MatchStatus.COMPLETED);
    mockMaxMinute(90);

    const state = (await getState(match)) as { isComplete: boolean };
    expect(state.isComplete).toBe(true);
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
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ maxMinute: '12' }),
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
