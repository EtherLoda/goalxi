import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjuryRecoveryService } from './injury-recovery.service';
import { PlayerEntity, InjuryEntity } from '@goalxi/database';

describe('InjuryRecoveryService', () => {
    let service: InjuryRecoveryService;
    let playerRepo: jest.Mocked<Repository<PlayerEntity>>;
    let injuryRepo: jest.Mocked<Repository<InjuryEntity>>;

    const mockPlayer = {
        id: 'player-uuid-1',
        name: 'Test Player',
        age: 25,
        currentInjuryValue: 50,
        injuryType: 'muscle' as const,
        injuredAt: new Date('2024-01-15'),
    };

    const mockInjury = {
        id: 'injury-uuid-1',
        playerId: 'player-uuid-1',
        injuryType: 'muscle' as const,
        severity: 2 as const,
        injuryValue: 50,
        estimatedMinDays: 5,
        estimatedMaxDays: 10,
        occurredAt: new Date('2024-01-15'),
        isRecovered: false,
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                InjuryRecoveryService,
                {
                    provide: getRepositoryToken(PlayerEntity),
                    useValue: {
                        find: jest.fn(),
                        findOne: jest.fn(),
                        save: jest.fn(),
                    },
                },
                {
                    provide: getRepositoryToken(InjuryEntity),
                    useValue: {
                        findOne: jest.fn(),
                        save: jest.fn(),
                    },
                },
            ],
        }).compile();

        service = module.get<InjuryRecoveryService>(InjuryRecoveryService);
        playerRepo = module.get(getRepositoryToken(PlayerEntity));
        injuryRepo = module.get(getRepositoryToken(InjuryEntity));
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('processDailyInjuryRecovery', () => {
        it('should process all injured players', async () => {
            playerRepo.find.mockResolvedValue([mockPlayer] as PlayerEntity[]);
            playerRepo.save.mockImplementation(async (p) => p as PlayerEntity);

            await service.processDailyInjuryRecovery();

            expect(playerRepo.find).toHaveBeenCalled();
            // Verify it was called with some query for injured players
            expect(playerRepo.find).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.any(Object),
                })
            );
        });

        it('should reduce injury value for each player', async () => {
            playerRepo.find.mockResolvedValue([{ ...mockPlayer, currentInjuryValue: 50 }] as PlayerEntity[]);
            playerRepo.save.mockImplementation(async (p) => p as PlayerEntity);

            await service.processDailyInjuryRecovery();

            const savedPlayer = playerRepo.save.mock.calls[0][0] as PlayerEntity;
            expect(savedPlayer.currentInjuryValue).toBeLessThan(50);
        });

        it('should not reduce injury below zero', async () => {
            playerRepo.find.mockResolvedValue([{ ...mockPlayer, currentInjuryValue: 3 }] as PlayerEntity[]);
            playerRepo.save.mockImplementation(async (p) => p as PlayerEntity);

            await service.processDailyInjuryRecovery();

            const savedPlayer = playerRepo.save.mock.calls[0][0] as PlayerEntity;
            expect(savedPlayer.currentInjuryValue).toBe(0);
        });

        it('should clear injury fields when fully recovered', async () => {
            playerRepo.find.mockResolvedValue([{ ...mockPlayer, currentInjuryValue: 3 }] as PlayerEntity[]);
            playerRepo.save.mockImplementation(async (p) => p as PlayerEntity);
            injuryRepo.findOne.mockResolvedValue({ ...mockInjury, isRecovered: false } as InjuryEntity);
            injuryRepo.save.mockImplementation(async (i) => i as InjuryEntity);

            await service.processDailyInjuryRecovery();

            // Get the last call (second save clears injury fields)
            const calls = playerRepo.save.mock.calls;
            const lastSavedPlayer = calls[calls.length - 1][0] as PlayerEntity;
            expect(lastSavedPlayer.injuryType).toBeNull();
            expect(lastSavedPlayer.injuredAt).toBeNull();
        });

        it('should update injury record when player recovers', async () => {
            playerRepo.find.mockResolvedValue([{ ...mockPlayer, currentInjuryValue: 3 }] as PlayerEntity[]);
            playerRepo.save.mockImplementation(async (p) => p as PlayerEntity);
            injuryRepo.findOne.mockResolvedValue({ ...mockInjury, isRecovered: false } as InjuryEntity);
            injuryRepo.save.mockImplementation(async (i) => i as InjuryEntity);

            await service.processDailyInjuryRecovery();

            const savedInjury = injuryRepo.save.mock.calls[0][0] as InjuryEntity;
            expect(savedInjury.isRecovered).toBe(true);
            expect(savedInjury.recoveredAt).toBeDefined();
        });

        it('should handle multiple injured players', async () => {
            const players = [
                { ...mockPlayer, id: 'player-1', currentInjuryValue: 50 },
                { ...mockPlayer, id: 'player-2', currentInjuryValue: 30 },
                { ...mockPlayer, id: 'player-3', currentInjuryValue: 10 },
            ] as PlayerEntity[];
            playerRepo.find.mockResolvedValue(players);
            playerRepo.save.mockImplementation(async (p) => p as PlayerEntity);
            injuryRepo.findOne.mockResolvedValue({ ...mockInjury } as InjuryEntity);
            injuryRepo.save.mockImplementation(async (i) => i as InjuryEntity);

            await service.processDailyInjuryRecovery();

            // At least 3 saves (one per player)
            expect(playerRepo.save.mock.calls.length).toBeGreaterThanOrEqual(3);
        });

        it('should use age in recovery calculation', async () => {
            const youngPlayer = { ...mockPlayer, id: 'young', age: 20, currentInjuryValue: 100 };
            const oldPlayer = { ...mockPlayer, id: 'old', age: 35, currentInjuryValue: 100 };
            playerRepo.find.mockResolvedValue([youngPlayer, oldPlayer] as PlayerEntity[]);
            playerRepo.save.mockImplementation(async (p) => p as PlayerEntity);
            injuryRepo.findOne.mockResolvedValue({ ...mockInjury } as InjuryEntity);
            injuryRepo.save.mockImplementation(async (i) => i as InjuryEntity);

            // Run multiple times to account for random fluctuation
            let youngWinsCount = 0;
            for (let i = 0; i < 10; i++) {
                playerRepo.save.mockClear();
                injuryRepo.save.mockClear();

                await service.processDailyInjuryRecovery();

                const calls = playerRepo.save.mock.calls;
                // Find saves for each player
                const youngCall = calls.find((c: any[]) => c[0].id === 'young');
                const oldCall = calls.find((c: any[]) => c[0].id === 'old');

                if (youngCall && oldCall) {
                    const youngRecovery = 100 - youngCall[0].currentInjuryValue;
                    const oldRecovery = 100 - oldCall[0].currentInjuryValue;
                    if (youngRecovery > oldRecovery) {
                        youngWinsCount++;
                    }
                }
            }

            // Young player should recover faster most of the time
            expect(youngWinsCount).toBeGreaterThanOrEqual(7);
        });

        it('should handle empty list of injured players', async () => {
            playerRepo.find.mockResolvedValue([]);

            await service.processDailyInjuryRecovery();

            expect(playerRepo.save).not.toHaveBeenCalled();
        });

        it('should handle errors for individual players gracefully', async () => {
            playerRepo.find.mockResolvedValue([mockPlayer] as PlayerEntity[]);
            playerRepo.save.mockRejectedValue(new Error('Database error'));

            // Should not throw
            await expect(service.processDailyInjuryRecovery()).resolves.not.toThrow();
        });
    });
});
