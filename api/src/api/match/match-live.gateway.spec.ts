import { MatchEventEntity, MatchStatus } from '@goalxi/database';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthService } from '@/api/auth/auth.service';
import { MatchEventService } from './match-event.service';
import { MatchService } from './match.service';
import { MatchLiveGateway } from './match-live.gateway';

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
          useValue: { findOne: jest.fn() },
        },
      ],
    }).compile();

    gateway = module.get<MatchLiveGateway>(MatchLiveGateway);
    matchService = module.get<MatchService>(MatchService) as jest.Mocked<MatchService>;
    eventRepository = module.get<Repository<MatchEventEntity>>(
      getRepositoryToken(MatchEventEntity),
    ) as jest.Mocked<Repository<MatchEventEntity>>;
  });

  // Test helper — getMatchState is private, but S1 is a load-bearing
  // contract that we want pinned without spinning up a full socket.io
  // mock for join_match. Cast is fine; this is the only way to assert
  // currentMinute without a full E2E.
  const getState = (matchId: string) =>
    (gateway as unknown as { getMatchState: (id: string) => Promise<unknown> })
      .getMatchState(matchId);

  it('returns 0 for a SCHEDULED match with no events (kickoff not reached)', async () => {
    matchService.findOne.mockResolvedValue(mkMatch(MatchStatus.SCHEDULED));
    eventRepository.findOne.mockResolvedValue(null);

    const state = (await getState('match-1')) as { currentMinute: number };
    expect(state.currentMinute).toBe(0);
  });

  it('uses max revealed event minute for an IN_PROGRESS match (no wall-clock fallback)', async () => {
    // The whole point of S1: even if `now - kickoff` would say "75'"
    // (e.g. server is 75 wall-clock minutes past scheduledAt), if the
    // sim only emitted up to minute 40 (paused / lag), we must report 40.
    matchService.findOne.mockResolvedValue(
      mkMatch(MatchStatus.IN_PROGRESS, new Date(Date.now() - 75 * 60 * 1000)),
    );
    eventRepository.findOne.mockResolvedValue({
      minute: 40,
    } as MatchEventEntity);

    const state = (await getState('match-1')) as { currentMinute: number };
    expect(state.currentMinute).toBe(40);
  });

  it('reports 0 for an IN_PROGRESS match whose first event has not been revealed yet (kickoff window)', async () => {
    // kickoff event hasn't been revealed (the 5s scheduler tick hasn't
    // run yet, or kickoff eventScheduledTime is still in the future).
    // Pre-S1 this used to show wall-clock elapsed minutes — confusing
    // because the timeline is genuinely empty.
    matchService.findOne.mockResolvedValue(
      mkMatch(MatchStatus.IN_PROGRESS, new Date(Date.now() - 60 * 1000)),
    );
    eventRepository.findOne.mockResolvedValue(null);

    const state = (await getState('match-1')) as { currentMinute: number };
    expect(state.currentMinute).toBe(0);
  });

  it('clamps COMPLETED to 90 even when no event crossed 90 (abandoned / short sim)', async () => {
    // A 60' abandoned match still shows "FT 90'" in the report.
    matchService.findOne.mockResolvedValue(mkMatch(MatchStatus.COMPLETED));
    eventRepository.findOne.mockResolvedValue({ minute: 60 } as MatchEventEntity);

    const state = (await getState('match-1')) as { currentMinute: number };
    expect(state.currentMinute).toBe(90);
  });

  it('preserves extra time for COMPLETED matches (max event > 90)', async () => {
    // 120-minute cup tie: the timeline must show the real 118' (or
    // whatever the last event was), not be silently clamped.
    matchService.findOne.mockResolvedValue(mkMatch(MatchStatus.COMPLETED));
    eventRepository.findOne.mockResolvedValue({ minute: 118 } as MatchEventEntity);

    const state = (await getState('match-1')) as { currentMinute: number };
    expect(state.currentMinute).toBe(118);
  });

  it('sets isComplete to true for COMPLETED matches', async () => {
    matchService.findOne.mockResolvedValue(mkMatch(MatchStatus.COMPLETED));
    eventRepository.findOne.mockResolvedValue({ minute: 90 } as MatchEventEntity);

    const state = (await getState('match-1')) as { isComplete: boolean };
    expect(state.isComplete).toBe(true);
  });
});
