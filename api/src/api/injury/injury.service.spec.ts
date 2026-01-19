import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Uuid } from '@/common/types/common.type';
import { InjuryService } from './injury.service';
import { PlayerEntity, InjuryEntity } from '@goalxi/database';

describe('InjuryService', () => {
    let service: InjuryService;
    let playerRepo: jest.Mocked<Repository<PlayerEntity>>;
    let injuryRepo: jest.Mocked<Repository<InjuryEntity>>;

    const mockPlayer: Partial<PlayerEntity> = {
        id: 'player-uuid-1' as Uuid,
        name: 'Test Player',
        teamId: 'team-uuid-1' as Uuid,
        age: 25,
        currentInjuryValue: 50,
        injuryType: 'muscle',
        injuredAt: new Date('2024-01-15'),
    };

    const mockInjury: Partial<InjuryEntity> = {
        id: 'injury-uuid-1' as Uuid,
        playerId: 'player-uuid-1' as Uuid,
        injuryType: 'muscle',
        severity: 2,
        injuryValue: 50,
        estimatedMinDays: 5,
        estimatedMaxDays: 10,
        occurredAt: new Date('2024-01-15'),
        isRecovered: false,
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                InjuryService,
                {
                    provide: getRepositoryToken(PlayerEntity),
                    useValue: {
                        find: jest.fn(),
                        findOneBy: jest.fn(),
                        findOne: jest.fn(),
                        count: jest.fn(),
                        save: jest.fn(),
                        update: jest.fn(),
                    },
                },
                {
                    provide: getRepositoryToken(InjuryEntity),
                    useValue: {
                        find: jest.fn(),
                        findOne: jest.fn(),
                        create: jest.fn(),
                        save: jest.fn(),
                    },
                },
            ],
        }).compile();

        service = module.get<InjuryService>(InjuryService);
        playerRepo = module.get(getRepositoryToken(PlayerEntity));
        injuryRepo = module.get(getRepositoryToken(InjuryEntity));
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('getPlayerInjuryHistory', () => {
        it('should return injury history for a player', async () => {
            const mockInjuries = [mockInjury];
            injuryRepo.find.mockResolvedValue(mockInjuries as InjuryEntity[]);

            const result = await service.getPlayerInjuryHistory('player-uuid-1');

            expect(injuryRepo.find).toHaveBeenCalledWith({
                where: { playerId: 'player-uuid-1' },
                order: { occurredAt: 'DESC' },
            });
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('injury-uuid-1');
            expect(result[0].injuryType).toBe('muscle');
            expect(result[0].severity).toBe(2);
        });

        it('should return empty array when player has no injury history', async () => {
            injuryRepo.find.mockResolvedValue([]);

            const result = await service.getPlayerInjuryHistory('player-uuid-1');

            expect(result).toEqual([]);
        });

        it('should map injury entity to DTO correctly', async () => {
            injuryRepo.find.mockResolvedValue([mockInjury] as InjuryEntity[]);

            const result = await service.getPlayerInjuryHistory('player-uuid-1');

            expect(result[0]).toEqual({
                id: 'injury-uuid-1',
                injuryType: 'muscle',
                severity: 2,
                estimatedMinDays: 5,
                estimatedMaxDays: 10,
                occurredAt: mockInjury.occurredAt,
                recoveredAt: mockInjury.recoveredAt,
                isRecovered: false,
            });
        });
    });

    describe('getTeamInjuredPlayers', () => {
        it('should return injured players for a team', async () => {
            playerRepo.find.mockResolvedValue([mockPlayer] as PlayerEntity[]);

            const result = await service.getTeamInjuredPlayers('team-uuid-1');

            expect(playerRepo.find).toHaveBeenCalledWith({
                where: { teamId: 'team-uuid-1', currentInjuryValue: expect.any(Object) },
            });
            expect(result).toHaveLength(1);
            expect(result[0].playerId).toBe('player-uuid-1');
            expect(result[0].playerName).toBe('Test Player');
            expect(result[0].isInjured).toBe(true);
            expect(result[0].currentInjuryValue).toBe(50);
        });

        it('should calculate recovery days based on injury value', async () => {
            playerRepo.find.mockResolvedValue([mockPlayer] as PlayerEntity[]);

            const result = await service.getTeamInjuredPlayers('team-uuid-1');

            // Injury value 50, range should be calculated
            expect(result[0].estimatedRecoveryDays).toBeDefined();
            expect(result[0].estimatedRecoveryDays!.min).toBeGreaterThan(0);
            expect(result[0].estimatedRecoveryDays!.max).toBeGreaterThanOrEqual(result[0].estimatedRecoveryDays!.min);
        });

        it('should return empty array when no players are injured', async () => {
            playerRepo.find.mockResolvedValue([]);

            const result = await service.getTeamInjuredPlayers('team-uuid-1');

            expect(result).toEqual([]);
        });

        it('should include injury type when available', async () => {
            playerRepo.find.mockResolvedValue([mockPlayer] as PlayerEntity[]);

            const result = await service.getTeamInjuredPlayers('team-uuid-1');

            expect(result[0].injuryType).toBe('muscle');
            expect(result[0].injuredAt).toBeDefined();
        });
    });

    describe('getPlayersPendingRecovery', () => {
        it('should return all players with active injuries', async () => {
            playerRepo.find.mockResolvedValue([mockPlayer] as PlayerEntity[]);

            const result = await service.getPlayersPendingRecovery();

            expect(playerRepo.find).toHaveBeenCalledWith({
                where: { currentInjuryValue: expect.any(Object) },
            });
            expect(result).toHaveLength(1);
        });
    });

    describe('updatePlayerInjury', () => {
        it('should reduce injury value by recovery amount', async () => {
            const playerWithInjury = { ...mockPlayer, currentInjuryValue: 50 } as PlayerEntity;
            playerRepo.findOneBy.mockResolvedValue(playerWithInjury);
            playerRepo.save.mockImplementation(async (p) => p as PlayerEntity);
            injuryRepo.findOne.mockResolvedValue(mockInjury as InjuryEntity);
            injuryRepo.save.mockImplementation(async (i) => i as InjuryEntity);

            const result = await service.updatePlayerInjury('player-uuid-1', 10);

            expect(result).toBeDefined();
            expect(result!.currentInjuryValue).toBe(40);
        });

        it('should return null if player not found', async () => {
            playerRepo.findOneBy.mockResolvedValue(null);

            const result = await service.updatePlayerInjury('unknown-player', 10);

            expect(result).toBeNull();
        });

        it('should return null if player has no injury', async () => {
            playerRepo.findOneBy.mockResolvedValue({ ...mockPlayer, currentInjuryValue: 0 } as PlayerEntity);

            const result = await service.updatePlayerInjury('player-uuid-1', 10);

            expect(result).toBeNull();
        });

        it('should clear injury fields when fully recovered', async () => {
            const playerWithInjury = { ...mockPlayer, currentInjuryValue: 5 } as PlayerEntity;
            playerRepo.findOneBy.mockResolvedValue(playerWithInjury);
            playerRepo.save.mockImplementation(async (p) => p as PlayerEntity);
            injuryRepo.findOne.mockResolvedValue(mockInjury as InjuryEntity);
            injuryRepo.save.mockImplementation(async (i) => ({ ...i, isRecovered: true, recoveredAt: new Date() }) as InjuryEntity);

            const result = await service.updatePlayerInjury('player-uuid-1', 10);

            expect(result!.currentInjuryValue).toBe(0);
            expect(result!.injuryType).toBeNull();
            expect(result!.injuredAt).toBeNull();
        });

        it('should update injury record when player recovers', async () => {
            const playerWithInjury = { ...mockPlayer, currentInjuryValue: 5 } as PlayerEntity;
            playerRepo.findOneBy.mockResolvedValue(playerWithInjury);
            playerRepo.save.mockImplementation(async (p) => p as PlayerEntity);
            injuryRepo.findOne.mockResolvedValue({ ...mockInjury, isRecovered: false } as InjuryEntity);
            const saveSpy = injuryRepo.save.mockImplementation(async (i) => i as InjuryEntity);

            await service.updatePlayerInjury('player-uuid-1', 10);

            expect(saveSpy).toHaveBeenCalled();
            const savedInjury = saveSpy.mock.calls[0][0] as InjuryEntity;
            expect(savedInjury.isRecovered).toBe(true);
            expect(savedInjury.recoveredAt).toBeDefined();
        });
    });

    describe('applyInjury', () => {
        it('should create injury record and update player', async () => {
            playerRepo.update.mockResolvedValue({ affected: 1 } as any);
            injuryRepo.create.mockReturnValue(mockInjury as InjuryEntity);
            injuryRepo.save.mockResolvedValue(mockInjury as InjuryEntity);

            const result = await service.applyInjury(
                'player-uuid-1',
                'muscle',
                2,
                50,
                5,
                10,
                'match-uuid-1'
            );

            expect(playerRepo.update).toHaveBeenCalledWith('player-uuid-1', expect.objectContaining({
                currentInjuryValue: 50,
                injuryType: 'muscle',
            }));
            expect(injuryRepo.create).toHaveBeenCalled();
            expect(injuryRepo.save).toHaveBeenCalled();
            expect(result).toBeDefined();
        });

        it('should include matchId when provided', async () => {
            playerRepo.update.mockResolvedValue({ affected: 1 } as any);
            injuryRepo.create.mockImplementation((data) => data as InjuryEntity);
            injuryRepo.save.mockImplementation(async (i) => i as InjuryEntity);

            const result = await service.applyInjury(
                'player-uuid-1',
                'muscle',
                2,
                50,
                5,
                10,
                'match-uuid-1'
            );

            expect(result.matchId).toBe('match-uuid-1');
        });
    });

    describe('getInjuredCountByTeamIds', () => {
        it('should return injury count for each team', async () => {
            playerRepo.count.mockResolvedValue(3);

            const result = await service.getInjuredCountByTeamIds(['team-1', 'team-2']);

            expect(result['team-1']).toBe(3);
            expect(result['team-2']).toBe(3);
        });

        it('should handle empty team list', async () => {
            const result = await service.getInjuredCountByTeamIds([]);
            expect(result).toEqual({});
        });

        it('should return 0 for teams with no injuries', async () => {
            playerRepo.count.mockResolvedValue(0);

            const result = await service.getInjuredCountByTeamIds(['team-1']);

            expect(result['team-1']).toBe(0);
        });
    });
});
