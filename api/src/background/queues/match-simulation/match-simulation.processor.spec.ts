
import { Test, TestingModule } from '@nestjs/testing';
import { MatchSimulationProcessor } from './match-simulation.processor';
import { Logger } from '@nestjs/common';
import { SimulationService } from '../../../simulation/simulation.service';
import { Job } from 'bullmq';
import {
    MatchEntity,
    MatchStatus,
    MatchEventEntity,
    MatchTeamStatsEntity,
    MatchTacticsEntity,
    PlayerEntity,
    TeamEntity,
} from '@goalxi/database';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

describe('MatchSimulationProcessor', () => {
    let processor: MatchSimulationProcessor;
    let simulationService: SimulationService;
    let matchRepository: Repository<MatchEntity>;
    let eventRepository: Repository<MatchEventEntity>;
    let statsRepository: Repository<MatchTeamStatsEntity>;
    let tacticsRepository: Repository<MatchTacticsEntity>;
    let playerRepository: Repository<PlayerEntity>;
    let teamRepository: Repository<TeamEntity>;

    const mockSimulationService = {
        simulateMatch: jest.fn(),
    };

    const mockMatchRepo = {
        findOne: jest.fn(),
        save: jest.fn(),
    };
    const mockTacticsRepo = {
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
    };
    const mockEventRepo = {
        create: jest.fn(),
        save: jest.fn(),
    };
    const mockStatsRepo = {
        create: jest.fn(),
        save: jest.fn(),
    };
    const mockGenericRepo = {
        find: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                MatchSimulationProcessor,
                { provide: SimulationService, useValue: mockSimulationService },
                { provide: getRepositoryToken(MatchEntity), useValue: mockMatchRepo },
                { provide: getRepositoryToken(MatchEventEntity), useValue: mockEventRepo },
                { provide: getRepositoryToken(MatchTeamStatsEntity), useValue: mockStatsRepo },
                { provide: getRepositoryToken(MatchTacticsEntity), useValue: mockTacticsRepo },
                { provide: getRepositoryToken(PlayerEntity), useValue: mockGenericRepo },
                { provide: getRepositoryToken(TeamEntity), useValue: mockGenericRepo },
            ],
        }).compile();

        processor = module.get<MatchSimulationProcessor>(MatchSimulationProcessor);
        simulationService = module.get<SimulationService>(SimulationService);
        matchRepository = module.get<Repository<MatchEntity>>(getRepositoryToken(MatchEntity));
        eventRepository = module.get<Repository<MatchEventEntity>>(getRepositoryToken(MatchEventEntity));
        statsRepository = module.get<Repository<MatchTeamStatsEntity>>(getRepositoryToken(MatchTeamStatsEntity));
        tacticsRepository = module.get<Repository<MatchTacticsEntity>>(getRepositoryToken(MatchTacticsEntity));
        playerRepository = module.get<Repository<PlayerEntity>>(getRepositoryToken(PlayerEntity));

        // Mock Logger to prevent console output during tests
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => { });
        jest.spyOn(Logger.prototype, 'error').mockImplementation(() => { });
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => { });
        jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => { });
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    it('should be defined', () => {
        expect(processor).toBeDefined();
    });

    describe('process', () => {
        const matchId = 'match-123';
        const job = {
            data: { matchId, homeForfeit: false, awayForfeit: false },
        } as Job;

        let mockMatch: MatchEntity;
        let mockTactics: MatchTacticsEntity;
        let mockPlayers: PlayerEntity[];

        beforeEach(() => {
            mockMatch = {
                id: matchId,
                homeTeamId: 'home-team-id',
                awayTeamId: 'away-team-id',
                homeTeam: { name: 'Home FC' },
                awayTeam: { name: 'Away FC' },
                status: MatchStatus.SCHEDULED,
            } as MatchEntity;

            mockTactics = {
                id: 'tactics-1',
                matchId: matchId,
                teamId: 'team-1',
                formation: '4-4-2',
                submittedAt: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
                lineup: { GK: 'p1', ST: 'p2' },
            } as unknown as MatchTacticsEntity;

            mockPlayers = [
                { id: 'p1', name: 'Player 1' },
                { id: 'p2', name: 'Player 2' },
            ] as PlayerEntity[];
        });

        it('should successfully simulate a match and save results', async () => {
            // Mocks
            // Mocks
            mockMatchRepo.findOne.mockResolvedValue({ ...mockMatch });
            mockTacticsRepo.findOne.mockResolvedValue({ ...mockTactics });

            mockGenericRepo.find.mockResolvedValue(mockPlayers); // Players

            mockSimulationService.simulateMatch.mockReturnValue([
                { minute: 10, type: 'goal', teamName: 'Home FC', description: 'Goal' },
                { minute: 90, type: 'snapshot', description: 'End' },
            ]);

            mockMatchRepo.save.mockResolvedValue({});
            mockEventRepo.save.mockResolvedValue({});
            mockStatsRepo.save.mockResolvedValue({});

            // Execute
            await processor.process(job);

            // Verify
            expect(mockMatchRepo.findOne).toHaveBeenCalledWith({
                where: { id: matchId },
                relations: ['homeTeam', 'awayTeam'],
            });
            expect(simulationService.simulateMatch).toHaveBeenCalled();
            expect(mockEventRepo.save).toHaveBeenCalled(); // Events saved
            expect(mockStatsRepo.save).toHaveBeenCalled(); // Stats saved
            expect(matchRepository.save).toHaveBeenCalledWith(expect.objectContaining({
                id: matchId,
                status: MatchStatus.COMPLETED,
                homeScore: 1,
                awayScore: 0,
            }));
        });

        it('should skip simulation if match is already completed', async () => {
            mockMatchRepo.findOne.mockResolvedValue({ ...mockMatch, status: MatchStatus.COMPLETED });

            await processor.process(job);

            expect(simulationService.simulateMatch).not.toHaveBeenCalled();
        });

        it('should throw error if tactics are missing and no forfeit', async () => {
            mockMatchRepo.findOne.mockResolvedValue({ ...mockMatch });
            mockTacticsRepo.findOne.mockResolvedValue(null);

            await expect(processor.process(job)).rejects.toThrow('Missing tactics for simulation');
        });

        it('should handle forfeit if tactics are missing', async () => {
            const forfeitJob = {
                data: { matchId, homeForfeit: true, awayForfeit: false },
            } as Job;

            mockMatchRepo.findOne.mockResolvedValue({ ...mockMatch });
            mockTacticsRepo.findOne.mockResolvedValue(null);

            await processor.process(forfeitJob);

            expect(simulationService.simulateMatch).not.toHaveBeenCalled();
            expect(matchRepository.save).toHaveBeenCalledWith(expect.objectContaining({
                status: MatchStatus.COMPLETED,
                homeScore: 0,
                awayScore: 3,
            }));
        });
    });
});
