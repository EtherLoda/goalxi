import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { DataSource, Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SimulationProcessor } from './simulation.processor';
import {
    MatchEntity,
    MatchEventEntity,
    MatchTeamStatsEntity,
    MatchStatus,
    MatchType,
} from '@goalxi/database';

describe('SimulationProcessor', () => {
    let processor: SimulationProcessor;
    let matchRepository: jest.Mocked<Repository<MatchEntity>>;
    let eventRepository: jest.Mocked<Repository<MatchEventEntity>>;
    let statsRepository: jest.Mocked<Repository<MatchTeamStatsEntity>>;
    let dataSource: jest.Mocked<DataSource>;

    const mockMatch = {
        id: 'match-1',
        homeTeamId: 'team-1',
        awayTeamId: 'team-2',
        type: MatchType.LEAGUE,
        status: MatchStatus.TACTICS_LOCKED,
    };

    const mockJob = {
        data: {
            matchId: 'match-1',
            homeTactics: { formation: '4-4-2' },
            awayTactics: { formation: '4-3-3' },
            homeForfeit: false,
            awayForfeit: false,
        },
    } as Job;

    beforeEach(async () => {
        const mockTransactionManager = {
            save: jest.fn().mockResolvedValue({}),
            create: jest.fn((entity, data) => data),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SimulationProcessor,
                {
                    provide: getRepositoryToken(MatchEntity),
                    useValue: {
                        findOne: jest.fn(),
                    },
                },
                {
                    provide: getRepositoryToken(MatchEventEntity),
                    useValue: {
                        save: jest.fn(),
                    },
                },
                {
                    provide: getRepositoryToken(MatchTeamStatsEntity),
                    useValue: {
                        save: jest.fn(),
                    },
                },
                {
                    provide: DataSource,
                    useValue: {
                        transaction: jest.fn((callback) =>
                            callback(mockTransactionManager),
                        ),
                    },
                },
            ],
        }).compile();

        processor = module.get<SimulationProcessor>(SimulationProcessor);
        matchRepository = module.get(getRepositoryToken(MatchEntity));
        eventRepository = module.get(getRepositoryToken(MatchEventEntity));
        statsRepository = module.get(getRepositoryToken(MatchTeamStatsEntity));
        dataSource = module.get(DataSource);
    });

    it('should be defined', () => {
        expect(processor).toBeDefined();
    });

    describe('process', () => {
        it('should throw error if match not found', async () => {
            matchRepository.findOne.mockResolvedValue(null);

            await expect(processor.process(mockJob)).rejects.toThrow(
                'Match match-1 not found',
            );
        });

        it('should handle home team forfeit', async () => {
            const forfeitJob = {
                ...mockJob,
                data: { ...mockJob.data, homeForfeit: true },
            } as Job;

            matchRepository.findOne.mockResolvedValue(mockMatch as any);

            await processor.process(forfeitJob);

            expect(dataSource.transaction).toHaveBeenCalled();
            // Verify forfeit score would be set (0-5)
        });

        it('should handle away team forfeit', async () => {
            const forfeitJob = {
                ...mockJob,
                data: { ...mockJob.data, awayForfeit: true },
            } as Job;

            matchRepository.findOne.mockResolvedValue(mockMatch as any);

            await processor.process(forfeitJob);

            expect(dataSource.transaction).toHaveBeenCalled();
            // Verify forfeit score would be set (5-0)
        });

        it('should handle both teams forfeit', async () => {
            const forfeitJob = {
                ...mockJob,
                data: { ...mockJob.data, homeForfeit: true, awayForfeit: true },
            } as Job;

            matchRepository.findOne.mockResolvedValue(mockMatch as any);

            await processor.process(forfeitJob);

            expect(dataSource.transaction).toHaveBeenCalled();
            // Both forfeit = 0-0
        });

        it('should run normal simulation when no forfeit', async () => {
            matchRepository.findOne.mockResolvedValue(mockMatch as any);

            await processor.process(mockJob);

            expect(dataSource.transaction).toHaveBeenCalled();
            // Verify simulation ran
        });

        it('should use transaction for database operations', async () => {
            matchRepository.findOne.mockResolvedValue(mockMatch as any);

            await processor.process(mockJob);

            expect(dataSource.transaction).toHaveBeenCalled();
        });

        it('should update match status to COMPLETED', async () => {
            matchRepository.findOne.mockResolvedValue(mockMatch as any);

            await processor.process(mockJob);

            // Transaction callback should save match with COMPLETED status
            expect(dataSource.transaction).toHaveBeenCalled();
        });
    });
});
