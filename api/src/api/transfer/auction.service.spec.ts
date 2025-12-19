import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuctionService } from './auction.service';
import {
    AuctionEntity,
    AuctionStatus,
    PlayerEntity,
    TeamEntity,
    PlayerHistoryEntity,
} from '@goalxi/database';
import { FinanceService } from '../finance/finance.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('AuctionService', () => {
    let service: AuctionService;
    let auctionRepo: any;
    let playerRepo: any;
    let teamRepo: any;
    let historyRepo: any;
    let financeService: any;
    let dataSource: any;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuctionService,
                {
                    provide: getRepositoryToken(AuctionEntity),
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
                    useValue: {
                        transaction: jest.fn(),
                    },
                },
            ],
        }).compile();

        service = module.get<AuctionService>(AuctionService);
        auctionRepo = module.get(getRepositoryToken(AuctionEntity));
        playerRepo = module.get(getRepositoryToken(PlayerEntity));
        teamRepo = module.get(getRepositoryToken(TeamEntity));
        historyRepo = module.get(getRepositoryToken(PlayerHistoryEntity));
        financeService = module.get(FinanceService);
        dataSource = module.get(DataSource);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('findAllActive', () => {
        it('should return all active auctions', async () => {
            const mockAuctions = [
                { id: '1', status: AuctionStatus.ACTIVE },
                { id: '2', status: AuctionStatus.ACTIVE },
            ];
            auctionRepo.find.mockResolvedValue(mockAuctions);

            const result = await service.findAllActive();

            expect(result).toEqual(mockAuctions);
            expect(auctionRepo.find).toHaveBeenCalledWith({
                where: { status: AuctionStatus.ACTIVE },
                relations: ['player', 'team', 'currentBidder'],
                order: { expiresAt: 'ASC' },
            });
        });
    });

    describe('createAuction', () => {
        it('should create an auction successfully', async () => {
            const userId = 'user-1' as any;
            const dto = {
                playerId: 'player-1',
                startPrice: 10000,
                buyoutPrice: 50000,
                durationHours: 24,
            };

            const mockTeam = { id: 'team-1', userId };
            const mockPlayer = { id: 'player-1', teamId: 'team-1' };
            const mockAuction = { id: 'auction-1', ...dto };

            teamRepo.findOneBy.mockResolvedValue(mockTeam);
            playerRepo.findOneBy.mockResolvedValue(mockPlayer);
            auctionRepo.findOne.mockResolvedValue(null);
            auctionRepo.save.mockResolvedValue(mockAuction);

            const result = await service.createAuction(userId, dto);

            expect(result).toEqual(mockAuction);
            expect(auctionRepo.save).toHaveBeenCalled();
        });

        it('should throw error if user has no team', async () => {
            const userId = 'user-1' as any;
            const dto = {
                playerId: 'player-1',
                startPrice: 10000,
                buyoutPrice: 50000,
                durationHours: 24,
            };

            teamRepo.findOneBy.mockResolvedValue(null);

            await expect(service.createAuction(userId, dto)).rejects.toThrow(NotFoundException);
        });

        it('should throw error if player not found', async () => {
            const userId = 'user-1' as any;
            const dto = {
                playerId: 'player-1',
                startPrice: 10000,
                buyoutPrice: 50000,
                durationHours: 24,
            };

            const mockTeam = { id: 'team-1', userId };
            teamRepo.findOneBy.mockResolvedValue(mockTeam);
            playerRepo.findOneBy.mockResolvedValue(null);

            await expect(service.createAuction(userId, dto)).rejects.toThrow(NotFoundException);
        });

        it('should throw error if user does not own player', async () => {
            const userId = 'user-1' as any;
            const dto = {
                playerId: 'player-1',
                startPrice: 10000,
                buyoutPrice: 50000,
                durationHours: 24,
            };

            const mockTeam = { id: 'team-1', userId };
            const mockPlayer = { id: 'player-1', teamId: 'team-2' };

            teamRepo.findOneBy.mockResolvedValue(mockTeam);
            playerRepo.findOneBy.mockResolvedValue(mockPlayer);

            await expect(service.createAuction(userId, dto)).rejects.toThrow(BadRequestException);
        });

        it('should throw error if player already in auction', async () => {
            const userId = 'user-1' as any;
            const dto = {
                playerId: 'player-1',
                startPrice: 10000,
                buyoutPrice: 50000,
                durationHours: 24,
            };

            const mockTeam = { id: 'team-1', userId };
            const mockPlayer = { id: 'player-1', teamId: 'team-1' };
            const existingAuction = { id: 'auction-1', status: AuctionStatus.ACTIVE };

            teamRepo.findOneBy.mockResolvedValue(mockTeam);
            playerRepo.findOneBy.mockResolvedValue(mockPlayer);
            auctionRepo.findOne.mockResolvedValue(existingAuction);

            await expect(service.createAuction(userId, dto)).rejects.toThrow(BadRequestException);
        });

        it('should throw error if buyout price <= start price', async () => {
            const userId = 'user-1' as any;
            const dto = {
                playerId: 'player-1',
                startPrice: 50000,
                buyoutPrice: 40000,
                durationHours: 24,
            };

            const mockTeam = { id: 'team-1', userId };
            const mockPlayer = { id: 'player-1', teamId: 'team-1' };

            teamRepo.findOneBy.mockResolvedValue(mockTeam);
            playerRepo.findOneBy.mockResolvedValue(mockPlayer);
            auctionRepo.findOne.mockResolvedValue(null);

            await expect(service.createAuction(userId, dto)).rejects.toThrow(BadRequestException);
        });
    });
});
