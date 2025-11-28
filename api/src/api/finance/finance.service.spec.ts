import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { FinanceEntity } from './entities/finance.entity';
import { TransactionEntity } from './entities/transaction.entity';
import { TransactionType } from './finance.constants';
import { FinanceService } from './finance.service';

const mockFinanceRepo = () => ({
    save: jest.fn(),
    findOneBy: jest.fn(),
});

const mockTransactionRepo = () => ({
    save: jest.fn(),
    find: jest.fn(),
});

const mockDataSource = () => ({
    transaction: jest.fn(),
});

type MockType<T> = {
    [P in keyof T]?: jest.Mock;
};

describe('FinanceService', () => {
    let service: FinanceService;
    let financeRepo: MockType<Repository<FinanceEntity>>;
    let transactionRepo: MockType<Repository<TransactionEntity>>;
    let dataSource: MockType<DataSource>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                FinanceService,
                { provide: getRepositoryToken(FinanceEntity), useFactory: mockFinanceRepo },
                { provide: getRepositoryToken(TransactionEntity), useFactory: mockTransactionRepo },
                { provide: DataSource, useFactory: mockDataSource },
            ],
        }).compile();

        service = module.get<FinanceService>(FinanceService);
        financeRepo = module.get(getRepositoryToken(FinanceEntity));
        transactionRepo = module.get(getRepositoryToken(TransactionEntity));
        dataSource = module.get(DataSource);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('createWallet', () => {
        it('should create a new finance record with default balance', async () => {
            const teamId = 'team-uuid' as any;
            const expectedFinance = { teamId, balance: 100000 };
            financeRepo.save?.mockResolvedValue(expectedFinance);

            const result = await service.createWallet(teamId);

            expect(financeRepo.save).toHaveBeenCalledWith(expect.objectContaining({
                teamId,
                balance: 100000,
            }));
            expect(result).toEqual(expectedFinance);
        });
    });

    describe('getBalance', () => {
        it('should return the balance', async () => {
            const teamId = 'team-uuid' as any;
            const finance = { teamId, balance: 50000 };
            financeRepo.findOneBy?.mockResolvedValue(finance);

            const result = await service.getBalance(teamId);

            expect(result).toBe(50000);
        });

        it('should throw error if finance record not found', async () => {
            const teamId = 'team-uuid' as any;
            financeRepo.findOneBy?.mockResolvedValue(null as any);

            await expect(service.getBalance(teamId)).rejects.toThrow();
        });
    });
});
