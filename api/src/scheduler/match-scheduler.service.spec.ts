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

    const createMockMatch = (overrides = {}) => ({
        id: 'match-1',
        homeTeamId: 'team-1',
        awayTeamId: 'team-2',
        type: MatchType.LEAGUE,
        scheduledAt: new Date(Date.now() + 30 * 60 * 1000),
        status: MatchStatus.SCHEDULED,
        tacticsLocked: false,
        homeForfeit: false,
        awayForfeit: false,
        ...overrides,
    });

    const mockMatch = createMockMatch();

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
        beforeEach(() => {
            jest.clearAllMocks();
        });

        it('should not process matches that are not in the time window', async () => {
            matchRepository.find.mockResolvedValue([]);

            await service.lockTacticsAndSimulate();

            expect(simulationQueue.add).not.toHaveBeenCalled();
            expect(matchRepository.save).not.toHaveBeenCalled();
        });

        it('should skip matches that are already locked', async () => {
            const lockedMatch = createMockMatch({ tacticsLocked: true });
            // Query should filter out locked matches, so find should return empty
            matchRepository.find.mockResolvedValue([]);

            await service.lockTacticsAndSimulate();

            expect(matchRepository.save).not.toHaveBeenCalled();
            expect(simulationQueue.add).not.toHaveBeenCalled();
        });

        it('should mark home team as forfeit if no tactics submitted', async () => {
            matchRepository.find.mockResolvedValue([mockMatch as any]);
            tacticsRepository.findOne
                .mockResolvedValueOnce(null) // No home tactics
                .mockResolvedValueOnce({ id: 'tactics-2' } as any); // Away tactics exist

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

        it('should mark away team as forfeit if no tactics submitted', async () => {
            const match = createMockMatch();
            matchRepository.find.mockResolvedValue([match as any]);
            tacticsRepository.findOne
                .mockResolvedValueOnce({ id: 'tactics-1' } as any) // Home tactics exist
                .mockResolvedValueOnce(null); // No away tactics
            matchRepository.save.mockResolvedValue(match as any);

            await service.lockTacticsAndSimulate();

            expect(matchRepository.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    homeForfeit: false,
                    awayForfeit: true,
                    tacticsLocked: true,
                    status: MatchStatus.TACTICS_LOCKED,
                }),
            );
        });

        it('should mark both teams as forfeit if no tactics submitted', async () => {
            const match = createMockMatch();
            matchRepository.find.mockResolvedValue([match as any]);
            tacticsRepository.findOne
                .mockResolvedValueOnce(null) // No home tactics
                .mockResolvedValueOnce(null); // No away tactics
            matchRepository.save.mockResolvedValue(match as any);

            await service.lockTacticsAndSimulate();

            expect(matchRepository.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    homeForfeit: true,
                    awayForfeit: true,
                    tacticsLocked: true,
                    status: MatchStatus.TACTICS_LOCKED,
                }),
            );
        });

        it('should queue simulation job with all required fields', async () => {
            const homeTactics = { id: 'tactics-1', formation: '4-4-2' };
            const awayTactics = { id: 'tactics-2', formation: '4-3-3' };
            const match = createMockMatch();

            matchRepository.find.mockResolvedValue([match as any]);
            tacticsRepository.findOne
                .mockResolvedValueOnce(homeTactics as any)
                .mockResolvedValueOnce(awayTactics as any);
            matchRepository.save.mockResolvedValue(match as any);

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
                    homeTactics: homeTactics,
                    awayTactics: awayTactics,
                }),
            );
        });

        it('should queue simulation job with null tactics for forfeiting teams', async () => {
            const match = createMockMatch();
            matchRepository.find.mockResolvedValue([match as any]);
            tacticsRepository.findOne
                .mockResolvedValueOnce(null) // No home tactics
                .mockResolvedValueOnce({ id: 'tactics-2' } as any); // Away tactics exist
            matchRepository.save.mockResolvedValue(match as any);

            await service.lockTacticsAndSimulate();

            expect(simulationQueue.add).toHaveBeenCalledWith(
                'simulate-match',
                expect.objectContaining({
                    matchId: 'match-1',
                    homeTactics: null,
                    awayTactics: { id: 'tactics-2' },
                    homeForfeit: true,
                    awayForfeit: false,
                }),
            );
        });

        it('should only process matches with SCHEDULED status', async () => {
            // The query should filter by status, so we shouldn't get non-SCHEDULED matches
            // But we can test that the query includes the status filter
            matchRepository.find.mockResolvedValue([]);

            await service.lockTacticsAndSimulate();

            expect(matchRepository.find).toHaveBeenCalledWith({
                where: {
                    status: MatchStatus.SCHEDULED,
                    tacticsLocked: false,
                    scheduledAt: expect.any(Object),
                },
            });
        });

        it('should handle errors gracefully and continue processing other matches', async () => {
            const match1 = createMockMatch({ id: 'match-1' });
            const match2 = createMockMatch({ id: 'match-2' });

            matchRepository.find.mockResolvedValue([match1 as any, match2 as any]);
            tacticsRepository.findOne
                .mockResolvedValueOnce({ id: 'tactics-1' } as any)
                .mockResolvedValueOnce({ id: 'tactics-2' } as any)
                .mockResolvedValueOnce({ id: 'tactics-3' } as any)
                .mockResolvedValueOnce({ id: 'tactics-4' } as any);

            // First match save fails
            matchRepository.save
                .mockRejectedValueOnce(new Error('Database error'))
                .mockResolvedValueOnce(match2 as any);

            await service.lockTacticsAndSimulate();

            // Should still process the second match
            expect(matchRepository.save).toHaveBeenCalledTimes(2);
            expect(simulationQueue.add).toHaveBeenCalledTimes(1); // Only match-2 queued
        });

        it('should process multiple matches in one cycle', async () => {
            const match1 = createMockMatch({ id: 'match-1' });
            const match2 = createMockMatch({ id: 'match-2' });
            const match3 = createMockMatch({ id: 'match-3' });

            matchRepository.find.mockResolvedValue([
                match1 as any,
                match2 as any,
                match3 as any,
            ]);

            tacticsRepository.findOne
                .mockResolvedValue({ id: 'tactics' } as any);

            matchRepository.save
                .mockResolvedValueOnce(match1 as any)
                .mockResolvedValueOnce(match2 as any)
                .mockResolvedValueOnce(match3 as any);

            await service.lockTacticsAndSimulate();

            expect(matchRepository.save).toHaveBeenCalledTimes(3);
            expect(simulationQueue.add).toHaveBeenCalledTimes(3);
        });
    });
});
