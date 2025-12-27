import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MatchEventService } from './match-event.service';
import { MatchCacheService } from './match-cache.service';
import {
    MatchEntity,
    MatchEventEntity,
    MatchTeamStatsEntity,
    TeamEntity,
    MatchStatus,
} from '@goalxi/database';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

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

            await expect(
                service.getMatchEvents('match-1', 'user-1'),
            ).rejects.toThrow(ForbiddenException);
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
                    type: 2, // GOAL
                    typeName: 'GOAL',
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
                { type: 2, teamId: 'team-1', minute: 10, second: 0 }, // Home goal
                { type: 2, teamId: 'team-2', minute: 20, second: 0 }, // Away goal
                { type: 2, teamId: 'team-1', minute: 30, second: 0 }, // Home goal
                { type: 3, teamId: 'team-1', minute: 40, second: 0 }, // Shot (not a goal)
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
    });
});
