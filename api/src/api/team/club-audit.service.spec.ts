import { TeamEntity, TransactionEntity, TransactionType, Uuid } from '@goalxi/database';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClubAuditService } from './club-audit.service';

describe('ClubAuditService', () => {
    let service: ClubAuditService;
    let transactionRepo: jest.Mocked<Repository<TransactionEntity>>;
    let teamRepo: jest.Mocked<Repository<TeamEntity>>;

    const mockTeam = { id: 'team-1' as Uuid } as TeamEntity;

    const tx = (overrides: Partial<TransactionEntity>): TransactionEntity =>
        ({
            id: 'tx-1' as Uuid,
            teamId: 'team-1' as Uuid,
            type: TransactionType.OTHER_EXPENSE,
            amount: 500000,
            season: 1,
            week: 5,
            description: 'Stadium construction (10000 seats)',
            createdAt: new Date('2026-04-01'),
            ...overrides,
        } as TransactionEntity);

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ClubAuditService,
                {
                    provide: getRepositoryToken(TransactionEntity),
                    useValue: { find: jest.fn() },
                },
                {
                    provide: getRepositoryToken(TeamEntity),
                    useValue: { findOne: jest.fn() },
                },
            ],
        }).compile();

        service = module.get<ClubAuditService>(ClubAuditService);
        transactionRepo = module.get(getRepositoryToken(TransactionEntity));
        teamRepo = module.get(getRepositoryToken(TeamEntity));
    });

    it('throws NotFound when team does not exist', async () => {
        teamRepo.findOne.mockResolvedValue(null);
        await expect(service.getRecent('missing')).rejects.toBeInstanceOf(NotFoundException);
        expect(transactionRepo.find).not.toHaveBeenCalled();
    });

    it('returns classified entries sorted desc by createdAt', async () => {
        teamRepo.findOne.mockResolvedValue(mockTeam);
        transactionRepo.find.mockResolvedValue([
            tx({ id: 'a' as Uuid, description: 'Stadium construction (10000 seats)', createdAt: new Date('2026-04-02') }),
            tx({ id: 'b' as Uuid, description: 'Stadium demolition (10000 seats)', createdAt: new Date('2026-03-15') }),
        ]);

        const result = await service.getRecent('team-1');

        expect(result).toHaveLength(2);
        expect(result[0].type).toBe('stadium_build');
        expect(result[0].cost).toBe(500000);
        expect(result[1].type).toBe('stadium_demolish');
        // The Like('Stadium%') filter is applied at the SQL layer
        expect(transactionRepo.find).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    teamId: 'team-1',
                    type: TransactionType.OTHER_EXPENSE,
                }),
            }),
        );
    });

    it('returns empty array when no stadium events exist', async () => {
        teamRepo.findOne.mockResolvedValue(mockTeam);
        transactionRepo.find.mockResolvedValue([]);

        const result = await service.getRecent('team-1');
        expect(result).toEqual([]);
    });
});
