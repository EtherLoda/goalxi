import {
  FanEntity,
  FINANCE_CONSTANTS,
  FinanceEntity,
  PlayerEntity,
  SeasonResultEntity,
  StadiumEntity,
  StaffEntity,
  TeamEntity,
  TransactionEntity,
  TransactionType,
} from '@goalxi/database';
import 'reflect-metadata';
import { AppDataSource } from '../src/database/data-source';

const SEASONS = [1, 2, 3, 4];
const WEEKS_PER_SEASON = 16;

interface WeeklyFinanceData {
  ticketIncome: number;
  sponsorship: number;
  merchandising: number;
  prizeMoney: number;
  playerWages: number;
  staffWages: number;
  transferOut: number;
  transferIn: number;
  stadiumMaintenance: number;
  youthTeam: number;
  medical: number;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate realistic weekly finance data for a team
 */
function generateWeeklyFinance(
  team: TeamEntity,
  tier: number,
  fanCount: number,
  week: number,
  season: number,
): WeeklyFinanceData {
  // Sponsorship: 基础值 × 2 × √(球迷数/1万)
  const baseSponsorship = FINANCE_CONSTANTS.SPONSORSHIP_BASE[tier] || 30000;
  const sponsorshipMultiplier = Math.sqrt(fanCount / 10000);
  const sponsorship = Math.floor(baseSponsorship * 2 * sponsorshipMultiplier);

  // Ticket income varies by stadium and week
  const stadium = team.leagueId; // Just for type reference
  const baseAttendance = Math.floor(fanCount * 0.3); // 30% of fans attend
  const ticketIncome = Math.floor(baseAttendance * randomInt(15, 25)); // £15-25 per ticket

  // Merchandising: roughly 5-15% of ticket income
  const merchandising = Math.floor((ticketIncome * randomInt(5, 15)) / 100);

  // Prize money: only in final weeks of season
  const prizeMoney = week === 16 ? randomInt(50000, 500000) : 0;

  // Player wages: based on team tier (higher tier = higher wages)
  const playerWageMultiplier = [0, 1.5, 1.2, 1.0, 0.8, 0.6][tier] || 1.0;
  const playerWages = Math.floor(
    randomInt(80000, 200000) * playerWageMultiplier,
  );

  // Staff wages: tier-based
  const staffWages = FINANCE_CONSTANTS.STAFF_WAGE[tier] || 15000;

  // Stadium maintenance
  const stadiumMaintenance =
    FINANCE_CONSTANTS.STADIUM_MAINTENANCE_PER_SEAT * 10000; // 10k seats

  // Youth team
  const youthTeam = FINANCE_CONSTANTS.YOUTH_TEAM_COST;

  // Medical (random伤病)
  const medical = Math.random() < 0.2 ? randomInt(5000, 50000) : 0;

  // Transfer activity (random)
  const transferOut = Math.random() < 0.1 ? randomInt(100000, 2000000) : 0;
  const transferIn = Math.random() < 0.05 ? randomInt(50000, 1000000) : 0;

  return {
    ticketIncome,
    sponsorship,
    merchandising,
    prizeMoney,
    playerWages,
    staffWages,
    transferOut,
    transferIn,
    stadiumMaintenance,
    youthTeam,
    medical,
  };
}

/**
 * Seed Finance Data for all teams across seasons 1-4
 */
async function seedFinanceData() {
  console.log('🚀 Starting finance data seed...');
  await AppDataSource.initialize();
  console.log('✅ Database connected\n');

  const teamRepo = AppDataSource.getRepository(TeamEntity);
  const financeRepo = AppDataSource.getRepository(FinanceEntity);
  const transactionRepo = AppDataSource.getRepository(TransactionEntity);
  const fanRepo = AppDataSource.getRepository(FanEntity);
  const playerRepo = AppDataSource.getRepository(PlayerEntity);
  const staffRepo = AppDataSource.getRepository(StaffEntity);
  const stadiumRepo = AppDataSource.getRepository(StadiumEntity);
  const seasonResultRepo = AppDataSource.getRepository(SeasonResultEntity);

  // Get all teams with their leagues
  const teams = await teamRepo.find({
    relations: ['league'],
  });

  console.log(`Found ${teams.length} teams\n`);

  let totalTransactions = 0;

  for (const team of teams) {
    console.log(`Processing team: ${team.name} (${team.id})`);

    // Get or create finance record
    let finance = await financeRepo.findOne({ where: { teamId: team.id } });
    if (!finance) {
      finance = financeRepo.create({
        teamId: team.id,
        balance: 5000000, // Starting balance
      });
      await financeRepo.save(finance);
    }

    // Get fan data for this team
    const fan = await fanRepo.findOne({ where: { teamId: team.id } });
    const fanCount = fan?.totalFans || 10000;

    // Get player count for wage calculation
    const playerCount = await playerRepo.count({
      where: { teamId: team.id, isYouth: false },
    });
    const staffCount = await staffRepo.count({
      where: { teamId: team.id, isActive: true },
    });
    const stadium = await stadiumRepo.findOne({ where: { teamId: team.id } });
    const stadiumCapacity = stadium?.capacity || 10000;

    // Get tier from league
    const tier = (team as any).league?.tier || 4;

    // Calculate average player wage per week (simplified)
    const avgPlayerWage = playerCount > 0 ? randomInt(15000, 80000) : 0;
    const totalStaffWage =
      staffCount * (FINANCE_CONSTANTS.STAFF_WAGE[tier] || 15000);
    const weeklyStadiumMaintenance =
      FINANCE_CONSTANTS.STADIUM_MAINTENANCE_PER_SEAT * stadiumCapacity;
    const weeklyYouthTeam = FINANCE_CONSTANTS.YOUTH_TEAM_COST;

    // Season result for prize money
    const seasonResult = await seasonResultRepo.findOne({
      where: { teamId: team.id, season: 4 },
    });

    let weeklyTransactions: {
      week: number;
      season: number;
      data: WeeklyFinanceData;
    }[] = [];

    for (const season of SEASONS) {
      for (let week = 1; week <= WEEKS_PER_SEASON; week++) {
        const baseData = generateWeeklyFinance(
          team,
          tier,
          fanCount,
          week,
          season,
        );

        // Override with calculated values
        const weeklyData: WeeklyFinanceData = {
          ticketIncome: baseData.ticketIncome,
          sponsorship: baseData.sponsorship,
          merchandising: baseData.merchandising,
          prizeMoney:
            week === 16 && season === 4 && seasonResult
              ? Math.floor(seasonResult.points * 1000)
              : 0,
          playerWages: avgPlayerWage,
          staffWages: totalStaffWage,
          transferOut: baseData.transferOut,
          transferIn: baseData.transferIn,
          stadiumMaintenance: weeklyStadiumMaintenance,
          youthTeam: weeklyYouthTeam,
          medical: baseData.medical,
        };

        weeklyTransactions.push({ week, season, data: weeklyData });
      }
    }

    // Calculate running balance
    let runningBalance = 5000000; // Starting balance

    // Process all transactions
    for (const { week, season, data } of weeklyTransactions) {
      const weekInSeason = week;

      const transactionsToCreate: Partial<TransactionEntity>[] = [];

      // Income transactions
      if (data.ticketIncome > 0) {
        transactionsToCreate.push({
          teamId: team.id,
          amount: data.ticketIncome,
          type: TransactionType.TICKET_INCOME,
          season,
          description: `Week ${weekInSeason} ticket revenue`,
        });
        runningBalance += data.ticketIncome;
      }

      if (data.sponsorship > 0) {
        transactionsToCreate.push({
          teamId: team.id,
          amount: data.sponsorship,
          type: TransactionType.SPONSORSHIP,
          season,
          description: `Week ${weekInSeason} sponsorship`,
        });
        runningBalance += data.sponsorship;
      }

      if (data.merchandising > 0) {
        // Merchandising is part of TICKET_INCOME for simplicity
        transactionsToCreate.push({
          teamId: team.id,
          amount: data.merchandising,
          type: TransactionType.TICKET_INCOME,
          season,
          description: `Week ${weekInSeason} merchandising`,
        });
        runningBalance += data.merchandising;
      }

      if (data.prizeMoney > 0) {
        transactionsToCreate.push({
          teamId: team.id,
          amount: data.prizeMoney,
          type: TransactionType.PRIZE_MONEY,
          season,
          description: `Season ${season} prize money`,
        });
        runningBalance += data.prizeMoney;
      }

      if (data.transferIn > 0) {
        transactionsToCreate.push({
          teamId: team.id,
          amount: data.transferIn,
          type: TransactionType.TRANSFER_IN,
          season,
          description: `Week ${weekInSeason} player transfer in`,
        });
        runningBalance += data.transferIn;
      }

      // Expense transactions
      if (data.playerWages > 0) {
        transactionsToCreate.push({
          teamId: team.id,
          amount: -data.playerWages,
          type: TransactionType.WAGES,
          season,
          description: `Week ${weekInSeason} player wages (${playerCount} players)`,
        });
        runningBalance -= data.playerWages;
      }

      if (data.staffWages > 0) {
        transactionsToCreate.push({
          teamId: team.id,
          amount: -data.staffWages,
          type: TransactionType.STAFF_WAGES,
          season,
          description: `Week ${weekInSeason} staff wages (${staffCount} staff)`,
        });
        runningBalance -= data.staffWages;
      }

      if (data.stadiumMaintenance > 0) {
        transactionsToCreate.push({
          teamId: team.id,
          amount: -data.stadiumMaintenance,
          type: TransactionType.STADIUM_MAINTENANCE,
          season,
          description: `Week ${weekInSeason} stadium maintenance`,
        });
        runningBalance -= data.stadiumMaintenance;
      }

      if (data.youthTeam > 0) {
        transactionsToCreate.push({
          teamId: team.id,
          amount: -data.youthTeam,
          type: TransactionType.YOUTH_TEAM,
          season,
          description: `Week ${weekInSeason} youth team`,
        });
        runningBalance -= data.youthTeam;
      }

      if (data.transferOut > 0) {
        transactionsToCreate.push({
          teamId: team.id,
          amount: -data.transferOut,
          type: TransactionType.TRANSFER_OUT,
          season,
          description: `Week ${weekInSeason} player transfer out`,
        });
        runningBalance -= data.transferOut;
      }

      if (data.medical > 0) {
        transactionsToCreate.push({
          teamId: team.id,
          amount: -data.medical,
          type: TransactionType.MEDICAL,
          season,
          description: `Week ${weekInSeason} medical expenses`,
        });
        runningBalance -= data.medical;
      }

      // Save all transactions for this week
      if (transactionsToCreate.length > 0) {
        await transactionRepo.save(transactionsToCreate);
        totalTransactions += transactionsToCreate.length;
      }
    }

    // Update final finance balance
    finance.balance = runningBalance;
    await financeRepo.save(finance);

    console.log(
      `   ✓ ${team.name}: ${weeklyTransactions.length} weeks × ${Object.keys(weeklyTransactions[0]?.data || {}).length} categories = ~${totalTransactions} transactions`,
    );
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Finance seed complete!');
  console.log('='.repeat(60));
  console.log(`   Seasons: ${SEASONS.join(', ')}`);
  console.log(`   Weeks per season: ${WEEKS_PER_SEASON}`);
  console.log(`   Total transactions: ${totalTransactions}`);
  console.log('='.repeat(60));

  await AppDataSource.destroy();
}

seedFinanceData().catch((e) => {
  console.error('❌ Finance seed failed:', e);
  process.exit(1);
});
