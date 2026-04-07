import { Uuid } from '@/common/types/common.type';
import {
  FanEntity,
  FINANCE_CONSTANTS,
  FinanceEntity,
  StadiumEntity,
  StaffEntity,
  StaffRole,
  TeamEntity,
  TransactionEntity,
  TransactionType,
} from '@goalxi/database';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class FinanceService {
  constructor(
    @InjectRepository(FinanceEntity)
    private readonly financeRepo: Repository<FinanceEntity>,
    @InjectRepository(TransactionEntity)
    private readonly transactionRepo: Repository<TransactionEntity>,
    @InjectRepository(TeamEntity)
    private readonly teamRepo: Repository<TeamEntity>,
    @InjectRepository(FanEntity)
    private readonly fanRepo: Repository<FanEntity>,
    @InjectRepository(StadiumEntity)
    private readonly stadiumRepo: Repository<StadiumEntity>,
    @InjectRepository(StaffEntity)
    private readonly staffRepo: Repository<StaffEntity>,
    private readonly dataSource: DataSource,
  ) {}

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
      throw new NotFoundException(
        `Finance record not found for team ${teamId}`,
      );
    }
    return finance.balance;
  }

  async getBalanceByUserId(userId: Uuid): Promise<number> {
    const finance = await this.financeRepo.findOne({
      where: { team: { userId } },
      relations: ['team'],
    });
    if (!finance) {
      throw new NotFoundException(
        `Finance record not found for user ${userId}`,
      );
    }
    return finance.balance;
  }

  async processTransaction(
    teamId: Uuid,
    amount: number,
    type: TransactionType,
    season: number,
    description?: string,
    relatedId?: string,
  ): Promise<TransactionEntity> {
    return this.dataSource.transaction(async (manager) => {
      const financeRepo = manager.getRepository(FinanceEntity);
      const transactionRepo = manager.getRepository(TransactionEntity);

      const finance = await financeRepo.findOneBy({ teamId });
      if (!finance) {
        throw new NotFoundException(
          `Finance record not found for team ${teamId}`,
        );
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
        description,
        relatedId,
      });
      return transactionRepo.save(transaction);
    });
  }

  async getTransactions(
    teamId: Uuid,
    season?: number,
  ): Promise<TransactionEntity[]> {
    const query = { teamId } as any;
    if (season) {
      query.season = season;
    }
    return this.transactionRepo.find({
      where: query,
      order: { createdAt: 'DESC' },
    });
  }

  async getTransactionsByUserId(
    userId: Uuid,
    season?: number,
    type?: TransactionType,
  ): Promise<TransactionEntity[]> {
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

  /**
   * Process weekly settlement for a team
   * Includes: sponsorship (基础值 × 2 × √(球迷数/1万)), staff wages, youth team cost, stadium maintenance
   */
  async processWeeklySettlement(teamId: Uuid, season: number): Promise<void> {
    const team = await this.teamRepo.findOne({
      where: { id: teamId },
      relations: ['league'],
    });
    if (!team) {
      throw new NotFoundException(`Team not found: ${teamId}`);
    }

    const tier = team.league?.tier || 4;

    // Income: Sponsorship = 基础值 × 2 × √(球迷数/1万)
    const fan = await this.fanRepo.findOne({ where: { teamId } });
    const baseSponsorship =
      FINANCE_CONSTANTS.SPONSORSHIP_BASE[
        tier as keyof typeof FINANCE_CONSTANTS.SPONSORSHIP_BASE
      ] || 30000;
    const fanCount = fan?.totalFans || 1000;
    const sponsorshipMultiplier = Math.sqrt(fanCount / 10000);
    const sponsorship = Math.floor(baseSponsorship * 2 * sponsorshipMultiplier);
    await this.processTransaction(
      teamId,
      sponsorship,
      TransactionType.SPONSORSHIP,
      season,
      `Weekly sponsorship income (Tier ${tier}, ${fanCount} fans)`,
    );

    // Expense: Staff wages (HEAD_COACH gets 2x)
    const staffMembers = await this.staffRepo.find({
      where: { teamId, isActive: true },
    });
    for (const staff of staffMembers) {
      const baseWage =
        FINANCE_CONSTANTS.STAFF_WAGE[
          staff.level as keyof typeof FINANCE_CONSTANTS.STAFF_WAGE
        ] || 15000;
      const staffWage =
        staff.role === StaffRole.HEAD_COACH ? baseWage * 2 : baseWage;
      await this.processTransaction(
        teamId,
        -staffWage,
        TransactionType.STAFF_WAGES,
        season,
        `Weekly wage for ${staff.name} (${staff.role})`,
        staff.id,
      );
    }

    // Expense: Youth team
    await this.processTransaction(
      teamId,
      -FINANCE_CONSTANTS.YOUTH_TEAM_COST,
      TransactionType.YOUTH_TEAM,
      season,
      'Weekly youth team operation',
    );

    // Expense: Stadium maintenance (based on capacity)
    const stadium = await this.stadiumRepo.findOne({ where: { teamId } });
    if (stadium?.isBuilt) {
      const maintenanceCost =
        stadium.capacity * FINANCE_CONSTANTS.STADIUM_MAINTENANCE_PER_SEAT;
      await this.processTransaction(
        teamId,
        -maintenanceCost,
        TransactionType.STADIUM_MAINTENANCE,
        season,
        `Weekly stadium maintenance (${stadium.capacity} seats)`,
        stadium.id,
      );
    }
  }
}
