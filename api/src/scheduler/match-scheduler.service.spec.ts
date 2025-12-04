import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { MatchSchedulerService } from './match-scheduler.service';
import {
    MatchEntity,
    MatchTacticsEntity,
    MatchStatus,
    MatchType,
} from '@goalxi/database';

describe('MatchSchedulerService', () => {
    let service: MatchSchedulerService;
    let matchRepository: jest.Mocked<Repository<MatchEntity>>;
    let tacticsRepository: jest.Mocked<Repository<MatchTacticsEntity>>;
    let simulationQueue: jest.Mocked<Queue>;

    const mockMatch = {
        id: 'match-1',
        homeTeamId: 'team-1',
        awayTeamId: 'team-2',
        type: MatchType.LEAGUE,
        scheduledAt: new Date(Date.now() + 30 * 60 * 1000),
        status: MatchStatus.SCHEDULED,
        tacticsLocked: false,
        homeForfeit: false,
        awayForfeit: false,
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                MatchSchedulerService,
                {
                    provide: getRepositoryToken(MatchEntity),
                    useValue: {
                        find: jest.fn(),
                        save: jest.fn(),
                    },
                },
                {
                    provide: getRepositoryToken(MatchTacticsEntity),
                    useValue: {
                        findOne: jest.fn(),
                    },
                },
                {
                    provide: getQueueToken('match-simulation'),
                    useValue: {
                        add: jest.fn(),
                    },
                },
            ],
        }).compile();

        service = module.get<MatchSchedulerService>(MatchSchedulerService);
        matchRepository = module.get(getRepositoryToken(MatchEntity));
        tacticsRepository = module.get(getRepositoryToken(MatchTacticsEntity));
        simulationQueue = module.get(getQueueToken('match-simulation'));
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('lockTacticsAndSimulate', () => {
        it('should not process matches that are not in the time window', async () => {
            matchRepository.find.mockResolvedValue([]);

            await service.lockTacticsAndSimulate();

            expect(simulationQueue.add).not.toHaveBeenCalled();
        });

        it('should mark home team as forfeit if no tactics submitted', async () => {
            matchRepository.find.mockResolvedValue([mockMatch as any]);
            tacticsRepository.findOne
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce({ id: 'tactics-2' } as any);

            await service.lockTacticsAndSimulate();

            expect(matchRepository.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    homeForfeit: true,
                    awayForfeit: false,
                    tacticsLocked: true,
                    status: MatchStatus.TACTICS_LOCKED,
                }),
            );
        });

        it('should queue simulation job with all required fields', async () => {
            const homeTactics = { id: 'tactics-1', formation: '4-4-2' };
            const awayTactics = { id: 'tactics-2', formation: '4-3-3' };

            matchRepository.find.mockResolvedValue([mockMatch as any]);
            tacticsRepository.findOne
                .mockResolvedValueOnce(homeTactics as any)
                .mockResolvedValueOnce(awayTactics as any);

            await service.lockTacticsAndSimulate();

            expect(simulationQueue.add).toHaveBeenCalledWith(
                'simulate-match',
                expect.objectContaining({
                    matchId: 'match-1',
                    homeTeamId: 'team-1',
                    awayTeamId: 'team-2',
                    matchType: MatchType.LEAGUE,
                    homeForfeit: false,
                    awayForfeit: false,
                }),
            );
        });
    });
});
