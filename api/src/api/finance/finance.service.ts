import { Uuid } from '@/common/types/common.type';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { FinanceEntity } from './entities/finance.entity';
import { TransactionEntity } from './entities/transaction.entity';
import { TransactionType } from './finance.constants';

@Injectable()
export class FinanceService {
    constructor(
        @InjectRepository(FinanceEntity)
        private readonly financeRepo: Repository<FinanceEntity>,
        @InjectRepository(TransactionEntity)
        private readonly transactionRepo: Repository<TransactionEntity>,
        private readonly dataSource: DataSource,
    ) { }

    async createWallet(teamId: Uuid): Promise<FinanceEntity> {
        const finance = new FinanceEntity({
            teamId,
            balance: 100000, // Default starting budget
        });
        return this.financeRepo.save(finance);
    }

    async getBalance(teamId: Uuid): Promise<number> {
        const finance = await this.financeRepo.findOneBy({ teamId });
        if (!finance) {
            throw new NotFoundException(`Finance record not found for team ${teamId}`);
        }
        return finance.balance;
    }

    async getBalanceByUserId(userId: Uuid): Promise<number> {
        const finance = await this.financeRepo.findOne({
            where: { team: { userId } },
            relations: ['team'],
        });
        if (!finance) {
            // If team exists but no finance, maybe create it? Or throw.
            // For now, throw not found.
            throw new NotFoundException(`Finance record not found for user ${userId}`);
        }
        return finance.balance;
    }

    async processTransaction(
        teamId: Uuid,
        amount: number,
        type: TransactionType,
        season: number,
    ): Promise<TransactionEntity> {
        return this.dataSource.transaction(async (manager) => {
            const financeRepo = manager.getRepository(FinanceEntity);
            const transactionRepo = manager.getRepository(TransactionEntity);

            const finance = await financeRepo.findOneBy({ teamId });
            if (!finance) {
                throw new NotFoundException(`Finance record not found for team ${teamId}`);
            }

            // Update balance
            finance.balance += amount;
            await financeRepo.save(finance);

            // Create transaction record
            const transaction = new TransactionEntity({
                teamId,
                amount,
                type,
                season,
            });
            return transactionRepo.save(transaction);
        });
    }

    async getTransactions(teamId: Uuid, season?: number): Promise<TransactionEntity[]> {
        const query = { teamId } as any;
        if (season) {
            query.season = season;
        }
        return this.transactionRepo.find({
            where: query,
            order: { createdAt: 'DESC' },
        });
    }

    async getTransactionsByUserId(userId: Uuid, season?: number, type?: TransactionType): Promise<TransactionEntity[]> {
        const query = { team: { userId } } as any;
        if (season) {
            query.season = season;
        }
        if (type) {
            query.type = type;
        }
        return this.transactionRepo.find({
            where: query,
            relations: ['team'],
            order: { createdAt: 'DESC' },
        });
    }

    async getSeasonalStats(teamId: Uuid, season: number) {
        const transactions = await this.transactionRepo.find({
            where: { teamId, season },
        });

        const stats = {
            season,
            totalIncome: 0,
            totalExpense: 0,
            breakdown: {} as Record<TransactionType, number>,
        };

        for (const tx of transactions) {
            if (tx.amount > 0) {
                stats.totalIncome += tx.amount;
            } else {
                stats.totalExpense += Math.abs(tx.amount);
            }

            if (!stats.breakdown[tx.type]) {
                stats.breakdown[tx.type] = 0;
            }
            stats.breakdown[tx.type] += tx.amount;
        }

        return stats;
    }
}
