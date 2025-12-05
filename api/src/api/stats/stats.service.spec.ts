import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StatsService } from './stats.service';
import {
    MatchEntity,
    MatchTeamStatsEntity,
    TeamEntity,
    MatchStatus,
} from '@goalxi/database';
import { NotFoundException } from '@nestjs/common';

describe('StatsService', () => {
    let service: StatsService;
    let matchRepository: Repository<MatchEntity>;
    let matchStatsRepository: Repository<MatchTeamStatsEntity>;
    let teamRepository: Repository<TeamEntity>;

    const mockMatch = {
        id: 'match-1',
        homeTeamId: 'team-1',
        awayTeamId: 'team-2',
        homeScore: 2,
        awayScore: 1,
        status: MatchStatus.COMPLETED,
        season: 1,
    };

    const mockTeam = {
        id: 'team-1',
        name: 'Team 1',
    };

    const mockStats = [
        {
            matchId: 'match-1',
            teamId: 'team-1',
            possession: 60,
            shots: 10,
            goals: 2,
        },
        {
            matchId: 'match-1',
            teamId: 'team-2',
            possession: 40,
            shots: 5,
            goals: 1,
        },
    ];

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                StatsService,
                {
                    provide: getRepositoryToken(MatchEntity),
                    useValue: {
                        findOne: jest.fn(),
                        find: jest.fn(),
                    },
                },
                {
                    provide: getRepositoryToken(MatchTeamStatsEntity),
                    useValue: {
                        find: jest.fn(),
                    },
                },
                {
                    provide: getRepositoryToken(TeamEntity),
                    useValue: {
                        findOne: jest.fn(),
                    },
                },
            ],
        }).compile();

        service = module.get<StatsService>(StatsService);
        matchRepository = module.get<Repository<MatchEntity>>(getRepositoryToken(MatchEntity));
        matchStatsRepository = module.get<Repository<MatchTeamStatsEntity>>(getRepositoryToken(MatchTeamStatsEntity));
        teamRepository = module.get<Repository<TeamEntity>>(getRepositoryToken(TeamEntity));
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('getMatchStats', () => {
        it('should return match stats', async () => {
            jest.spyOn(matchRepository, 'findOne').mockResolvedValue(mockMatch as any);
            jest.spyOn(matchStatsRepository, 'find').mockResolvedValue(mockStats as any);

            const result = await service.getMatchStats('match-1');

            expect(result.matchId).toBe('match-1');
            expect(result.homeTeamStats).toBeDefined();
            expect(result.awayTeamStats).toBeDefined();
        });

        it('should throw NotFoundException if match not found', async () => {
            jest.spyOn(matchRepository, 'findOne').mockResolvedValue(null);

            await expect(service.getMatchStats('invalid')).rejects.toThrow(NotFoundException);
        });

        it('should throw NotFoundException if match not completed', async () => {
            jest.spyOn(matchRepository, 'findOne').mockResolvedValue({
                ...mockMatch,
                status: MatchStatus.SCHEDULED,
            } as any);

            await expect(service.getMatchStats('match-1')).rejects.toThrow(NotFoundException);
        });
    });

    describe('getTeamSeasonStats', () => {
        it('should calculate team season stats correctly', async () => {
            jest.spyOn(teamRepository, 'findOne').mockResolvedValue(mockTeam as any);
            jest.spyOn(matchRepository, 'find').mockResolvedValue([
                { ...mockMatch, homeTeamId: 'team-1', awayTeamId: 'team-2', homeScore: 2, awayScore: 1 }, // Win
                { ...mockMatch, homeTeamId: 'team-2', awayTeamId: 'team-1', homeScore: 1, awayScore: 1 }, // Draw
                { ...mockMatch, homeTeamId: 'team-1', awayTeamId: 'team-3', homeScore: 0, awayScore: 1 }, // Loss
            ] as any);

            const result = await service.getTeamSeasonStats('team-1', 1);

            expect(result.matchesPlayed).toBe(3);
            expect(result.wins).toBe(1);
            expect(result.draws).toBe(1);
            expect(result.losses).toBe(1);
            expect(result.goalsFor).toBe(3); // 2 + 1 + 0
            expect(result.goalsAgainst).toBe(3); // 1 + 1 + 1
            expect(result.points).toBe(4); // 3 + 1 + 0
        });

        it('should throw NotFoundException if team not found', async () => {
            jest.spyOn(teamRepository, 'findOne').mockResolvedValue(null);

            await expect(service.getTeamSeasonStats('invalid', 1)).rejects.toThrow(NotFoundException);
        });
    });
});
