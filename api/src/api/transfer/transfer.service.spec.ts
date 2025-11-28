import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TransferService } from './transfer.service';
import { TransferEntity, TransferStatus } from './entities/transfer.entity';
import { PlayerEntity } from '../player/entities/player.entity';
import { TeamEntity } from '../team/entities/team.entity';
import { PlayerHistoryEntity } from './entities/player-history.entity';
import { FinanceService } from '../finance/finance.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('TransferService', () => {
    let service: TransferService;
    let transferRepo: any;
    let playerRepo: any;
    let teamRepo: any;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TransferService,
                {
                    provide: getRepositoryToken(TransferEntity),
                    useValue: {
                        find: jest.fn(),
                        findOne: jest.fn(),
                        save: jest.fn(),
                    },
                },
                {
                    provide: getRepositoryToken(PlayerEntity),
                    useValue: {
                        findOneBy: jest.fn(),
                    },
                },
                {
                    provide: getRepositoryToken(TeamEntity),
                    useValue: {
                        findOneBy: jest.fn(),
                    },
                },
                {
                    provide: getRepositoryToken(PlayerHistoryEntity),
                    useValue: {},
                },
                {
                    provide: FinanceService,
                    useValue: {},
                },
                {
                    provide: DataSource,
                    useValue: {},
                },
            ],
        }).compile();

        service = module.get<TransferService>(TransferService);
        transferRepo = module.get(getRepositoryToken(TransferEntity));
        playerRepo = module.get(getRepositoryToken(PlayerEntity));
        teamRepo = module.get(getRepositoryToken(TeamEntity));
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('findAll', () => {
        it('should return all listed transfers', async () => {
            const mockTransfers = [
                { id: '1', status: TransferStatus.LISTED },
                { id: '2', status: TransferStatus.LISTED },
            ];
            transferRepo.find.mockResolvedValue(mockTransfers);

            const result = await service.findAll();

            expect(result).toEqual(mockTransfers);
            expect(transferRepo.find).toHaveBeenCalledWith({
                where: { status: TransferStatus.LISTED },
                relations: ['player', 'fromTeam'],
                order: { createdAt: 'DESC' },
            });
        });
    });

    describe('listPlayer', () => {
        it('should list a player successfully', async () => {
            const userId = 'user-1' as any;
            const dto = {
                playerId: 'player-1',
                price: 10000,
            };

            const mockTeam = { id: 'team-1', userId };
            const mockPlayer = { id: 'player-1', teamId: 'team-1' };
            const mockTransfer = { id: 'transfer-1', ...dto };

            teamRepo.findOneBy.mockResolvedValue(mockTeam);
            playerRepo.findOneBy.mockResolvedValue(mockPlayer);
            transferRepo.findOne.mockResolvedValue(null);
            transferRepo.save.mockResolvedValue(mockTransfer);

            const result = await service.listPlayer(userId, dto);

            expect(result).toEqual(mockTransfer);
            expect(transferRepo.save).toHaveBeenCalled();
        });

        it('should throw error if user has no team', async () => {
            const userId = 'user-1' as any;
            const dto = {
                playerId: 'player-1',
                price: 10000,
            };

            teamRepo.findOneBy.mockResolvedValue(null);

            await expect(service.listPlayer(userId, dto)).rejects.toThrow(NotFoundException);
        });

        it('should throw error if player not found', async () => {
            const userId = 'user-1' as any;
            const dto = {
                playerId: 'player-1',
                price: 10000,
            };

            const mockTeam = { id: 'team-1', userId };
            teamRepo.findOneBy.mockResolvedValue(mockTeam);
            playerRepo.findOneBy.mockResolvedValue(null);

            await expect(service.listPlayer(userId, dto)).rejects.toThrow(NotFoundException);
        });

        it('should throw error if user does not own player', async () => {
            const userId = 'user-1' as any;
            const dto = {
                playerId: 'player-1',
                price: 10000,
            };

            const mockTeam = { id: 'team-1', userId };
            const mockPlayer = { id: 'player-1', teamId: 'team-2' };

            teamRepo.findOneBy.mockResolvedValue(mockTeam);
            playerRepo.findOneBy.mockResolvedValue(mockPlayer);

            await expect(service.listPlayer(userId, dto)).rejects.toThrow(BadRequestException);
        });

        it('should throw error if player already listed', async () => {
            const userId = 'user-1' as any;
            const dto = {
                playerId: 'player-1',
                price: 10000,
            };

            const mockTeam = { id: 'team-1', userId };
            const mockPlayer = { id: 'player-1', teamId: 'team-1' };
            const existingTransfer = { id: 'transfer-1', status: TransferStatus.LISTED };

            teamRepo.findOneBy.mockResolvedValue(mockTeam);
            playerRepo.findOneBy.mockResolvedValue(mockPlayer);
            transferRepo.findOne.mockResolvedValue(existingTransfer);

            await expect(service.listPlayer(userId, dto)).rejects.toThrow(BadRequestException);
        });
    });
});
