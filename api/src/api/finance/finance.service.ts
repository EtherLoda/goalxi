import { Uuid } from '@/common/types/common.type';
import {
  FanEntity,
  FINANCE_CONSTANTS,
  FinanceEntity,
  PlayerEntity,
  StadiumEntity,
  StaffEntity,
  StaffRole,
  TeamEntity,
  TransactionEntity,
  TransactionType,
} from '@goalxi/database';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

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
    @InjectRepository(PlayerEntity)
    private readonly playerRepo: Repository<PlayerEntity>,
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

  async getBalanceByUserId(
    userId: Uuid,
  ): Promise<{ balance: number; lockedCash: number }> {
    const finance = await this.financeRepo.findOne({
      where: { team: { userId } },
      relations: ['team'],
    });
    if (!finance) {
      throw new NotFoundException(
        `Finance record not found for user ${userId}`,
      );
    }
    return {
      balance: finance.balance,
      lockedCash: (finance.team as any)?.lockedCash || 0,
    };
  }

  async processTransaction(
    teamId: Uuid,
    amount: number,
    type: TransactionType,
    season: number,
    week: number,
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

      // Update FinanceEntity.balance
      finance.balance += amount;
      await financeRepo.save(finance);

      // Create transaction record
      const transaction = manager.create(TransactionEntity, {
        teamId,
        amount,
        type,
        season,
        week,
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
   * Process weekly settlement for a team (non-atomic, each tx commits independently)
   * @deprecated Use processWeeklySettlementAtomic instead
   */
  async processWeeklySettlement(
    teamId: Uuid,
    season: number,
    week: number,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.processWeeklySettlementAtomic(teamId, season, week, manager);
    });
  }

  /**
   * Process weekly settlement for a team - atomic version
   * Uses provided EntityManager so all operations are in a single transaction
   * Includes: sponsorship (基础值 × 2 × √(球迷数/1万)), staff wages, youth team cost, stadium maintenance
   */
  async processWeeklySettlementAtomic(
    teamId: Uuid,
    season: number,
    week: number,
    manager: EntityManager,
  ): Promise<void> {
    const team = await manager.getRepository(TeamEntity).findOne({
      where: { id: teamId },
      relations: ['league'],
    });
    if (!team) {
      throw new NotFoundException(`Team not found: ${teamId}`);
    }

    const tier = team.league?.tier || 4;
    const financeRepo = manager.getRepository(FinanceEntity);
    const transactionRepo = manager.getRepository(TransactionEntity);

    // Get or create finance record
    let finance = await financeRepo.findOneBy({ teamId });
    if (!finance) {
      finance = financeRepo.create({ teamId, balance: 100000 });
      finance = await financeRepo.save(finance);
    }

    // Income: Sponsorship = 基础值 × 2 × √(球迷数/1万)
    const fan = await manager
      .getRepository(FanEntity)
      .findOne({ where: { teamId } });
    const baseSponsorship =
      FINANCE_CONSTANTS.SPONSORSHIP_BASE[
        tier as keyof typeof FINANCE_CONSTANTS.SPONSORSHIP_BASE
      ] || 30000;
    const fanCount = fan?.totalFans || 1000;
    const sponsorshipMultiplier = Math.sqrt(fanCount / 10000);
    const sponsorship = Math.floor(baseSponsorship * 2 * sponsorshipMultiplier);

    const sponsorshipTx = transactionRepo.create({
      teamId,
      amount: sponsorship,
      type: TransactionType.SPONSORSHIP,
      season,
      week,
      description: `Weekly sponsorship income (Tier ${tier}, ${fanCount} fans)`,
    });
    finance.balance += sponsorship;
    await transactionRepo.save(sponsorshipTx);

    // Expense: Staff wages (HEAD_COACH gets 2x)
    const staffMembers = await manager.getRepository(StaffEntity).find({
      where: { teamId, isActive: true },
    });
    for (const staff of staffMembers) {
      const baseWage =
        FINANCE_CONSTANTS.STAFF_WAGE[
          staff.level as keyof typeof FINANCE_CONSTANTS.STAFF_WAGE
        ] || 15000;
      const staffWage =
        staff.role === StaffRole.HEAD_COACH ? baseWage * 2 : baseWage;

      const staffTx = transactionRepo.create({
        teamId,
        amount: -staffWage,
        type: TransactionType.STAFF_EXPENSES,
        season,
        week,
        description: `Weekly wage for ${staff.name} (${staff.role})`,
        relatedId: staff.id,
      });
      finance.balance -= staffWage;
      await transactionRepo.save(staffTx);
    }

    // Expense: Youth team
    const youthTx = transactionRepo.create({
      teamId,
      amount: -FINANCE_CONSTANTS.YOUTH_TEAM_COST,
      type: TransactionType.YOUTH_TEAM,
      season,
      week,
      description: 'Weekly youth team operation',
    });
    finance.balance -= FINANCE_CONSTANTS.YOUTH_TEAM_COST;
    await transactionRepo.save(youthTx);

    // Expense: Stadium maintenance (based on capacity)
    const stadium = await manager
      .getRepository(StadiumEntity)
      .findOne({ where: { teamId } });
    if (stadium?.isBuilt) {
      const maintenanceCost =
        stadium.capacity * FINANCE_CONSTANTS.STADIUM_MAINTENANCE_PER_SEAT;
      const stadiumTx = transactionRepo.create({
        teamId,
        amount: -maintenanceCost,
        type: TransactionType.OTHER_EXPENSE,
        season,
        week,
        description: `Weekly stadium maintenance (${stadium.capacity} seats)`,
        relatedId: stadium.id,
      });
      finance.balance -= maintenanceCost;
      await transactionRepo.save(stadiumTx);
    }

    // Expense: Player wages (all non-youth players)
    const players = await manager.getRepository(PlayerEntity).find({
      where: { teamId, isYouth: false },
    });
    if (players.length > 0) {
      const totalPlayerWages = players.reduce(
        (sum, player) => sum + (player.currentWage || 0),
        0,
      );
      if (totalPlayerWages > 0) {
        const wagesTx = transactionRepo.create({
          teamId,
          amount: -totalPlayerWages,
          type: TransactionType.WAGES,
          season,
          week,
          description: `Weekly player wages (${players.length} players)`,
        });
        finance.balance -= totalPlayerWages;
        await transactionRepo.save(wagesTx);
      }
    }

    // Save final balance
    await financeRepo.save(finance);
  }
}
