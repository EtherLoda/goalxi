import {
  FanEntity,
  FinanceEntity,
  PlayerEntity,
  StadiumEntity,
  StaffEntity,
  TeamEntity,
  TransactionEntity,
} from '@goalxi/database';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { FinanceService } from './finance.service';

const mockFinanceRepo = () => ({
  save: jest.fn(),
  findOneBy: jest.fn(),
  findOne: jest.fn(),
});

const mockTransactionRepo = () => ({
  save: jest.fn(),
  find: jest.fn(),
});

const mockTeamRepo = () => ({
  findOne: jest.fn(),
});

const mockFanRepo = () => ({
  findOne: jest.fn(),
});

const mockStadiumRepo = () => ({
  findOne: jest.fn(),
});

const mockStaffRepo = () => ({
  find: jest.fn(),
});

const mockPlayerRepo = () => ({
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
  let teamRepo: MockType<Repository<TeamEntity>>;
  let fanRepo: MockType<Repository<FanEntity>>;
  let stadiumRepo: MockType<Repository<any>>;
  let staffRepo: MockType<Repository<any>>;
  let playerRepo: MockType<Repository<any>>;
  let dataSource: MockType<DataSource>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinanceService,
        {
          provide: getRepositoryToken(FinanceEntity),
          useFactory: mockFinanceRepo,
        },
        {
          provide: getRepositoryToken(TransactionEntity),
          useFactory: mockTransactionRepo,
        },
        {
          provide: getRepositoryToken(TeamEntity),
          useFactory: mockTeamRepo,
        },
        {
          provide: getRepositoryToken(FanEntity),
          useFactory: mockFanRepo,
        },
        {
          provide: getRepositoryToken(StadiumEntity),
          useFactory: mockStadiumRepo,
        },
        {
          provide: getRepositoryToken(StaffEntity),
          useFactory: mockStaffRepo,
        },
        {
          provide: getRepositoryToken(PlayerEntity),
          useFactory: mockPlayerRepo,
        },
        { provide: DataSource, useFactory: mockDataSource },
      ],
    }).compile();

    service = module.get<FinanceService>(FinanceService);
    financeRepo = module.get(getRepositoryToken(FinanceEntity));
    transactionRepo = module.get(getRepositoryToken(TransactionEntity));
    teamRepo = module.get(getRepositoryToken(TeamEntity));
    fanRepo = module.get(getRepositoryToken(FanEntity));
    stadiumRepo = module.get(getRepositoryToken(StadiumEntity));
    staffRepo = module.get(getRepositoryToken(StaffEntity));
    playerRepo = module.get(getRepositoryToken(PlayerEntity));
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

      expect(financeRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          teamId,
          balance: 100000,
        }),
      );
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
