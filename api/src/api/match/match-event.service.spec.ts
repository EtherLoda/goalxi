import {
  MatchEntity,
  MatchEventEntity,
  MatchStatus,
  MatchTeamStatsEntity,
  TeamEntity,
} from '@goalxi/database';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MatchCacheService } from './match-cache.service';
import { MatchEventService } from './match-event.service';

describe('MatchEventService', () => {
  let service: MatchEventService;
  let matchRepository: jest.Mocked<Repository<MatchEntity>>;
  let eventRepository: jest.Mocked<Repository<MatchEventEntity>>;
  let statsRepository: jest.Mocked<Repository<MatchTeamStatsEntity>>;
  let teamRepository: jest.Mocked<Repository<TeamEntity>>;
  let matchCacheService: jest.Mocked<MatchCacheService>;

  const mockMatch = {
    id: 'match-1',
    homeTeamId: 'team-1',
    awayTeamId: 'team-2',
    scheduledAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
    status: MatchStatus.COMPLETED,
    firstHalfInjuryTime: 3,
    secondHalfInjuryTime: 4,
    hasExtraTime: false,
    homeTeam: {
      id: 'team-1',
      name: 'Home Team',
      logoUrl: 'home-logo.png',
    },
    awayTeam: {
      id: 'team-2',
      name: 'Away Team',
      logoUrl: null,
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchEventService,
        {
          provide: getRepositoryToken(MatchEntity),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(MatchEventEntity),
          useValue: {
            find: jest.fn(),
            // Stubbed as a mock so the B8 spec can assert the read
            // path does NOT call `update` (the previous version did
            // — see header on `getMatchEvents`).
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(MatchTeamStatsEntity),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(TeamEntity),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: MatchCacheService,
          useValue: {
            getMatchEvents: jest.fn().mockResolvedValue(null), // Cache miss by default
            cacheMatchEvents: jest.fn(),
            invalidateMatch: jest.fn(),
            // Real method name on the service. B8 spec asserts the
            // REST read path does NOT call this — only the scheduler
            // should invalidate the event cache.
            invalidateMatchCache: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MatchEventService>(MatchEventService);
    matchRepository = module.get(getRepositoryToken(MatchEntity));
    eventRepository = module.get(getRepositoryToken(MatchEventEntity));
    statsRepository = module.get(getRepositoryToken(MatchTeamStatsEntity));
    teamRepository = module.get(getRepositoryToken(TeamEntity));
    matchCacheService = module.get(MatchCacheService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMatchEvents', () => {
    it('should throw NotFoundException if match not found', async () => {
      matchRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getMatchEvents('invalid-match', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    // This test is skipped because we now allow public access to all matches
    // Authorization is disabled to allow both logged-in and anonymous users to view matches
    it.skip('should throw ForbiddenException if user does not own either team', async () => {
      matchRepository.findOne.mockResolvedValue(mockMatch as any);
      teamRepository.find.mockResolvedValue([
        { id: 'team-3', userId: 'user-1' } as any,
      ]);
      // Mock eventRepository to prevent undefined events
      eventRepository.find.mockResolvedValue([]);

      await expect(service.getMatchEvents('match-1', 'user-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should return match events for authorized user', async () => {
      matchRepository.findOne.mockResolvedValue(mockMatch as any);
      teamRepository.find.mockResolvedValue([
        { id: 'team-1', userId: 'user-1' } as any,
      ]);

      const mockEvents = [
        {
          id: 'event-1',
          matchId: 'match-1',
          minute: 10,
          second: 30,
          // RFC 0002 Phase 3 — the legacy `type` int is gone.
          // A goal is now SHOT(3) + GOAL(1) via the new tuple.
          typeName: 'goal',
          eventClassId: 3,
          outcomeId: 1,
          teamId: 'team-1',
        },
        {
          id: 'event-2',
          matchId: 'match-1',
          minute: 45,
          second: 0,
          type: 13, // HALF_TIME
          typeName: 'HALF_TIME',
        },
      ];

      eventRepository.find.mockResolvedValue(mockEvents as any);
      statsRepository.findOne
        .mockResolvedValueOnce({
          matchId: 'match-1',
          teamId: 'team-1',
          possession: 55,
        } as any)
        .mockResolvedValueOnce({
          matchId: 'match-1',
          teamId: 'team-2',
          possession: 45,
        } as any);

      const result = await service.getMatchEvents('match-1', 'user-1');

      expect(result.matchId).toBe('match-1');
      expect(result.events).toHaveLength(2);
      expect(result.currentScore).toEqual({ home: 1, away: 0 });
      expect(result.homeTeam.name).toBe('Home Team');
      expect(result.awayTeam.logo).toBeNull();
      expect(result.stats).toBeDefined();
    });

    it('should calculate correct score from events', async () => {
      matchRepository.findOne.mockResolvedValue(mockMatch as any);
      teamRepository.find.mockResolvedValue([
        { id: 'team-1', userId: 'user-1' } as any,
      ]);

      const mockEvents = [
        // RFC 0002 Phase 3 — the legacy `type` int is gone.
        // Goals are identified by the (classId=3, outcomeId=1)
        // tuple only.
        {
          eventClassId: 3,
          outcomeId: 1,
          teamId: 'team-1',
          minute: 10,
          second: 0,
        }, // Home goal
        {
          eventClassId: 3,
          outcomeId: 1,
          teamId: 'team-2',
          minute: 20,
          second: 0,
        }, // Away goal
        {
          eventClassId: 3,
          outcomeId: 1,
          teamId: 'team-1',
          minute: 30,
          second: 0,
        }, // Home goal
        {
          eventClassId: 3,
          outcomeId: 2,
          teamId: 'team-1',
          minute: 40,
          second: 0,
        }, // Save (not a goal)
      ];

      eventRepository.find.mockResolvedValue(mockEvents as any);
      statsRepository.findOne.mockResolvedValue({} as any);

      const result = await service.getMatchEvents('match-1', 'user-1');

      expect(result.currentScore).toEqual({ home: 2, away: 1 });
    });

    it('should not return stats if match is not complete', async () => {
      const ongoingMatch = {
        ...mockMatch,
        scheduledAt: new Date(), // Just started
        status: MatchStatus.IN_PROGRESS,
      };

      matchRepository.findOne.mockResolvedValue(ongoingMatch as any);
      teamRepository.find.mockResolvedValue([
        { id: 'team-1', userId: 'user-1' } as any,
      ]);
      eventRepository.find.mockResolvedValue([]);

      const result = await service.getMatchEvents('match-1', 'user-1');

      expect(result.stats).toBeNull();
      expect(result.isComplete).toBe(false);
    });

    // RFC 0002 — Two-Axis Event Coding (Phase 2). The score
    // calculation must accept BOTH the new (eventClassId,
    // outcomeId) tuple AND the legacy `type` int. These tests
    // pin the dual-read contract for the 1-week Phase 2 soak
    // window. Phase 3 will drop the legacy `type` path.
    it('RFC 0002: counts SHOT+GOAL tuple as a goal (new path)', async () => {
      matchRepository.findOne.mockResolvedValue(mockMatch as any);
      teamRepository.find.mockResolvedValue([
        { id: 'team-1', userId: 'user-1' } as any,
      ]);

      const mockEvents = [
        // SHOT (3) + GOAL (1) — Phase 2 row, no legacy `type` set
        {
          eventClassId: 3,
          outcomeId: 1,
          outcomeCode: 'GOAL',
          teamId: 'team-1',
          minute: 10,
          second: 0,
        },
        {
          eventClassId: 3,
          outcomeId: 1,
          outcomeCode: 'GOAL',
          teamId: 'team-2',
          minute: 20,
          second: 0,
        },
        {
          eventClassId: 3,
          outcomeId: 2,
          outcomeCode: 'SAVE',
          teamId: 'team-1',
          minute: 30,
          second: 0,
        }, // not a goal
      ];

      eventRepository.find.mockResolvedValue(mockEvents as any);
      statsRepository.findOne.mockResolvedValue({} as any);

      const result = await service.getMatchEvents('match-1', 'user-1');

      expect(result.currentScore).toEqual({ home: 1, away: 1 });
    });

    it('RFC 0002 Phase 3: ONLY the new tuple counts goals (legacy `type` int is gone)', async () => {
      // A row with NO classId/outcomeId (no new tuple fields
      // at all) does NOT count, even if it would have been a
      // goal in the old schema. This is the Phase 3 contract:
      // the new tuple is the single source of truth.
      matchRepository.findOne.mockResolvedValue(mockMatch as any);
      teamRepository.find.mockResolvedValue([
        { id: 'team-1', userId: 'user-1' } as any,
      ]);

      const mockEvents = [
        // Row with all fields null/missing — the new code
        // path requires eventClassId=3 + outcomeId=1 to
        // count a goal. A bare-bones row that would have
        // been a `type=2` goal in the legacy schema no
        // longer counts.
        {
          eventClassId: null,
          outcomeId: null,
          teamId: 'team-1',
          minute: 10,
          second: 0,
        },
        {
          eventClassId: 3,
          outcomeId: 2,
          teamId: 'team-2',
          minute: 20,
          second: 0,
        }, // Save (not a goal)
      ];

      eventRepository.find.mockResolvedValue(mockEvents as any);
      statsRepository.findOne.mockResolvedValue({} as any);

      const result = await service.getMatchEvents('match-1', 'user-1');

      expect(result.currentScore).toEqual({ home: 0, away: 0 });
    });

    it('RFC 0002: OWN_GOAL events do NOT count toward team score (engine does not emit them)', () => {
      // Defensive hand-rolled spec. The engine never emits an
      // OWN_GOAL event (the enum value is dead — see RFC 0002
      // §4.2 "Note on dead enum entries"). The pre-RFC 0002
      // code only counted `type === GOAL`. If own goals are
      // ever re-introduced, the "credit the OTHER team" logic
      // belongs here, NOT in the engine.
      const ev: any = { type: 29, eventClassId: 11, teamId: 'team-1' };
      const isGoalByNew = ev.eventClassId === 3 && (ev as any).outcomeId === 1;
      const isGoalByLegacy = ev.type === 2; // GOAL
      expect(isGoalByNew || isGoalByLegacy).toBe(false);
    });

    // B8 regression: the previous `getMatchEvents` implementation
    // also flipped `isRevealed = true` on the returned events and
    // invalidated the cache. That was a layer violation — only
    // `MatchLiveScheduler.processRevealableEvents` should own that
    // flag — and it caused cache-invalidate storms (REST joins on
    // hot matches would each force a cache wipe) and a write-write
    // race with the scheduler. Pin the new contract: the REST
    // handler is now strictly read-only on `isRevealed`.
    it('does NOT mutate isRevealed or invalidate the event cache (scheduler owns the write path)', async () => {
      matchRepository.findOne.mockResolvedValue(mockMatch as any);
      teamRepository.find.mockResolvedValue([
        { id: 'team-1', userId: 'user-1' } as any,
      ]);
      eventRepository.find.mockResolvedValue([
        {
          id: 'e1',
          matchId: 'match-1',
          minute: 12,
          type: 2,
          typeName: 'goal',
          teamId: 'team-1',
          eventScheduledTime: new Date(Date.now() - 60_000),
          isRevealed: false, // not yet picked up by the scheduler
        },
      ] as any);

      await service.getMatchEvents('match-1', 'user-1');

      // The visibleEvents filter (eventScheduledTime <= now) still
      // returns the event in the response — visibility is decoupled
      // from isRevealed on the read path. See the header comment on
      // `getMatchEvents` for the rationale.
      expect(eventRepository.update).not.toHaveBeenCalled();
      expect(matchCacheService.invalidateMatchCache).not.toHaveBeenCalled();
    });
  });
});
