import {
  displayIdFromUuid,
  FanEntity,
  FinanceEntity,
  formatDisplayId,
  FormationKey,
  generateAutoLineup,
  generateUniqueShortCode,
  LeagueEntity,
  LeagueStandingEntity,
  MatchEntity,
  MatchStatus,
  MatchTacticsEntity,
  PlayerEntity,
  StadiumEntity,
  StaffEntity,
  TeamEntity,
  UserEntity,
  Uuid,
} from '@goalxi/database';
import { calculatePlayerWage } from '@goalxi/database/src/constants/finance.constants';
import 'reflect-metadata';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { getRandomNameByNationality } from '../src/constants/name-database';
import { AppDataSource } from '../src/database/data-source';
import { generatePlayerData } from '../src/utils/player-generator';

/**
 * Seed Main - Season 1 Starting Point (Apr 6, 2026)
 *
 * Creates a realistic starting state with:
 * - 2 weeks of completed matches (4 matchdays)
 * - 2 more weeks of scheduled matches (future)
 * - Proper financial settlements for completed weeks
 * - User teams with competitive players
 */

// ============================================================================
// DATE CONFIGURATION
// ============================================================================

// Season 1 starts at Apr 6, 2026 (Monday)
const SEASON_START_DATE = new Date('2026-04-06T00:00:00Z');

// ============================================================================
// DYNAMIC SCHEDULE CALCULATION
// ============================================================================

/**
 * Get the next occurrence of a specific day of week
 * @param date - Starting date
 * @param targetDay - 0 = Sunday, 1 = Monday, ..., 3 = Wednesday, 6 = Saturday
 * @param includeDate - If true and date falls on target day, return that day
 */
function getNextDayOfWeek(
  date: Date,
  targetDay: number,
  includeDate: boolean = false,
): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);

  const currentDay = result.getDay();
  let daysUntilTarget = targetDay - currentDay;

  if (daysUntilTarget < 0) {
    daysUntilTarget += 7;
  } else if (daysUntilTarget === 0 && !includeDate) {
    daysUntilTarget = 7;
  }

  result.setDate(result.getDate() + daysUntilTarget);
  return result;
}

/**
 * Calculate all match dates for a season
 * - Season starts from next Wednesday after initialDate
 * - 15 weeks, 2 matchdays per week (Wed + Sat)
 * - Total: 30 rounds
 */
function calculateSeasonMatchDates(
  initialDate: Date,
): { date: Date; week: number; matchday: number; round: number }[] {
  const matchDates: {
    date: Date;
    week: number;
    matchday: number;
    round: number;
  }[] = [];

  // Get first Wednesday after initial date
  const firstWednesday = getNextDayOfWeek(initialDate, 3, false); // 3 = Wednesday
  firstWednesday.setHours(20, 0, 0, 0); // 20:00 UTC

  const weeksPerSeason = 15;
  const roundsPerWeek = 2;

  for (let week = 1; week <= weeksPerSeason; week++) {
    // Matchday 1 (Wednesday)
    const matchDay1 = new Date(firstWednesday);
    matchDay1.setDate(firstWednesday.getDate() + (week - 1) * 7);
    matchDates.push({
      date: new Date(matchDay1),
      week,
      matchday: 1,
      round: (week - 1) * roundsPerWeek + 1,
    });

    // Matchday 2 (Saturday) - 3 days after Wednesday
    const matchDay2 = new Date(matchDay1);
    matchDay2.setDate(matchDay1.getDate() + 3);
    matchDay2.setHours(15, 0, 0, 0); // 15:00 UTC
    matchDates.push({
      date: new Date(matchDay2),
      week,
      matchday: 2,
      round: (week - 1) * roundsPerWeek + 2,
    });
  }

  return matchDates;
}

// Get today's date as the initial reference
const INITIAL_DATE = new Date();
console.log(`[SEED] Initial date: ${INITIAL_DATE.toISOString().split('T')[0]}`);

// Calculate all match dates for the season
const allMatchDates = calculateSeasonMatchDates(INITIAL_DATE);
console.log(`[SEED] Season schedule:`);
console.log(
  `  - First match: ${allMatchDates[0].date.toISOString().split('T')[0]} (Round ${allMatchDates[0].round})`,
);
console.log(
  `  - Last match: ${allMatchDates[allMatchDates.length - 1].date.toISOString().split('T')[0]} (Round ${allMatchDates[allMatchDates.length - 1].round})`,
);
console.log(`  - Total rounds: ${allMatchDates.length}`);

// ============================================================================
// LEAGUE CONFIG
// ============================================================================

const LEAGUE_CONFIG = {
  L1: { count: 1, teamsPerLeague: 16 },
  L2: { count: 4, teamsPerLeague: 16 },
};

const TEAM_ROSTER_SIZE = 16;
const GK_COUNT = 2;
const SEASON = 1;

// ============================================================================
// HELPERS
// ============================================================================

function randomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number, decimals: number = 1): number {
  const value = Math.random() * (max - min) + min;
  return Math.round(value * 10) / 10;
}

function generatePlayerAppearance() {
  return {
    skinTone: randomInt(1, 6),
    hairStyle: randomInt(1, 20),
    hairColor: randomElement(['black', 'brown', 'blonde', 'red', 'gray']),
    facialHair: randomElement(['none', 'beard', 'mustache', 'goatee']),
  };
}

function generateTeamName(
  tier: number,
  division: number,
  index: number,
): string {
  return `Team ${index + 1}`;
}

/**
 * Generate a short code that doesn't collide with any team in the DB.
 * Used during seeding and idempotent re-runs (existing teams already have one).
 */
async function generateFreshShortCode(
  teamRepo: Repository<TeamEntity>,
): Promise<string> {
  return generateUniqueShortCode(async (code) => {
    const hit = await teamRepo.findOne({
      where: { shortCode: code },
      select: { id: true },
    });
    return hit !== null;
  });
}

function getLeagueOvrRange(tier: number): { min: number; max: number } {
  // Higher OVR ranges for more competitive feel
  switch (tier) {
    case 1:
      return { min: 65, max: 85 };
    case 2:
      return { min: 55, max: 75 };
    case 3:
      return { min: 45, max: 65 };
    case 4:
      return { min: 35, max: 55 };
    default:
      return { min: 50, max: 70 };
  }
}

/**
 * Calculate team overall rating from player skills
 */
function calculateTeamOvr(players: PlayerEntity[]): number {
  if (players.length === 0) return 50;
  let total = 0;
  for (const player of players) {
    const skills = player.currentSkills;
    const values = [
      ...Object.values(skills.physical || {}),
      ...Object.values(skills.technical || {}),
      ...Object.values(skills.mental || {}),
      ...Object.values(skills.setPieces || {}),
    ].filter((v) => typeof v === 'number') as number[];
    const avg =
      values.length > 0
        ? values.reduce((a, b) => a + b, 0) / values.length
        : 10;
    total += avg;
  }
  return Math.round((total / players.length) * 5); // Scale to 0-100
}

/**
 * Create MatchTacticsEntity for a team using auto-lineup generator
 */
async function createTeamTactics(
  matchId: string,
  teamId: string,
  players: PlayerEntity[],
  formation: FormationKey = '4-4-2',
): Promise<MatchTacticsEntity> {
  const result = generateAutoLineup(players, formation);
  const tactics = new MatchTacticsEntity({
    matchId,
    teamId,
    formation: result.formation,
    lineup: result.lineup,
    substitutions: result.bench.slice(0, 3).map((playerId, idx) => ({
      minute: 60 + idx * 5,
      out: '', // filled below
      in: playerId,
    })),
    submittedAt: new Date(),
  });

  // Fill in substitution "out" positions from lineup
  const lineupPositions = Object.keys(result.lineup).filter((k) => k !== 'GK');
  tactics.substitutions = tactics.substitutions
    .map((sub, idx) => {
      if (lineupPositions[idx] && result.lineup[lineupPositions[idx]]) {
        return {
          ...sub,
          out: result.lineup[lineupPositions[idx]],
        };
      }
      return sub;
    })
    .filter((s) => s.out);

  return tactics;
}

// ============================================================================
// MAIN SEED FUNCTION
// ============================================================================

async function createLeaguePyramid() {
  console.log('🚀 Initializing database connection...');
  await AppDataSource.initialize();
  console.log('✅ Database connected\n');

  const userRepo = AppDataSource.getRepository(UserEntity);
  const teamRepo = AppDataSource.getRepository(TeamEntity);
  const leagueRepo = AppDataSource.getRepository(LeagueEntity);
  const playerRepo = AppDataSource.getRepository(PlayerEntity);
  const financeRepo = AppDataSource.getRepository(FinanceEntity);
  const standingRepo = AppDataSource.getRepository(LeagueStandingEntity);
  const stadiumRepo = AppDataSource.getRepository(StadiumEntity);
  const fanRepo = AppDataSource.getRepository(FanEntity);
  const staffRepo = AppDataSource.getRepository(StaffEntity);
  const matchRepo = AppDataSource.getRepository(MatchEntity);
  const matchTacticsRepo = AppDataSource.getRepository(MatchTacticsEntity);

  // ==========================================================================
  // 1. CREATE USERS
  // ==========================================================================
  console.log('👤 Creating users...');

  // Admin
  const adminEmail = 'admin@goalxi.com';
  let adminUser = await userRepo.findOneBy({ email: adminEmail });
  if (!adminUser) {
    adminUser = new UserEntity({
      username: 'admin',
      email: adminEmail,
      password: 'Test123456!',
      nickname: 'Admin Manager',
      bio: 'System Administrator',
      supporterLevel: 99,
    });
    await userRepo.save(adminUser);
  }
  console.log(`   ✓ Admin: ${adminEmail} / Test123456!`);

  // Bot Manager
  const botEmail = 'bot@goalxi.com';
  let botUser = await userRepo.findOneBy({ email: botEmail });
  if (!botUser) {
    botUser = new UserEntity({
      username: 'bot_manager',
      email: botEmail,
      password: 'Bot123456!',
      nickname: 'Bot Manager',
      bio: 'System Bot Manager',
      supporterLevel: 0,
    });
    await userRepo.save(botUser);
  }
  console.log(`   ✓ Bot Manager: ${botEmail}`);

  // Test User 1 (Test City FC)
  const testEmail1 = 'test@goalxi.com';
  let testUser1 = await userRepo.findOneBy({ email: testEmail1 });
  if (!testUser1) {
    testUser1 = new UserEntity({
      username: 'testuser1',
      email: testEmail1,
      password: 'password123',
      nickname: 'Test City Manager',
      bio: 'Test user 1',
      supporterLevel: 1,
    });
    await userRepo.save(testUser1);
    console.log(`   ✓ Test User 1: ${testEmail1} / password123`);
  } else {
    testUser1.password = 'password123';
    await userRepo.save(testUser1);
    console.log(`   ✓ Updated: ${testEmail1} / password123`);
  }

  // Test User 2 (Test United)
  const testEmail2 = 'test2@goalxi.com';
  let testUser2 = await userRepo.findOneBy({ email: testEmail2 });
  if (!testUser2) {
    testUser2 = new UserEntity({
      username: 'testuser2',
      email: testEmail2,
      password: 'password123',
      nickname: 'Test United Manager',
      bio: 'Test user 2',
      supporterLevel: 1,
    });
    await userRepo.save(testUser2);
    console.log(`   ✓ Test User 2: ${testEmail2} / password123`);
  } else {
    testUser2.password = 'password123';
    await userRepo.save(testUser2);
    console.log(`   ✓ Updated: ${testEmail2} / password123`);
  }

  // ==========================================================================
  // 2. CREATE LEAGUES
  // ==========================================================================
  console.log('\n🏆 Creating leagues...');
  const leagues: LeagueEntity[] = [];

  // L1: Elite League
  const l1Id = uuidv4();
  let l1League = await leagueRepo.findOneBy({ id: l1Id as any });
  if (!l1League) {
    l1League = new LeagueEntity({
      id: l1Id as any,
      name: 'Elite League',
      tier: 1,
      tierDivision: 1,
      maxTeams: 16,
      promotionSlots: 1,
      playoffSlots: 4,
      relegationSlots: 4,
      status: 'active',
      parentLeagueId: undefined,
    });
    await leagueRepo.save(l1League);
  }
  leagues.push(l1League);
  console.log(`   ✓ L1: Elite League`);

  // L2: 4 Professional Divisions
  for (let d = 1; d <= 4; d++) {
    const l2Id = uuidv4();
    let l2League = await leagueRepo.findOneBy({ id: l2Id as any });
    if (!l2League) {
      l2League = new LeagueEntity({
        id: l2Id as any,
        name: `Professional League Div ${d}`,
        tier: 2,
        tierDivision: d,
        maxTeams: 16,
        promotionSlots: 1,
        playoffSlots: 4,
        relegationSlots: 4,
        status: 'active',
        parentLeagueId: l1Id as Uuid,
      });
      await leagueRepo.save(l2League);
    }
    leagues.push(l2League);
    console.log(`   ✓ L2 Div ${d}: ${l2League.name}`);
  }

  // ==========================================================================
  // 3. CREATE TEAMS WITH PLAYERS
  // ==========================================================================
  console.log('\n⚽ Creating teams and players...');

  for (const league of leagues) {
    const isL2Div1 = league.tier === 2 && league.tierDivision === 1;
    const tierOvrRange = getLeagueOvrRange(league.tier);

    // For L2 Div 1, create user-owned teams first
    if (isL2Div1) {
      // Team 1 (test@goalxi.com)
      let team1 = await teamRepo.findOne({ where: { userId: testUser1.id } });
      if (!team1) {
        team1 = new TeamEntity({
          id: uuidv4() as any,
          userId: testUser1.id,
          name: 'Team 1',
          shortCode: await generateFreshShortCode(teamRepo),
          leagueId: league.id,
          isBot: false,
          logoUrl: '',
          jerseyColorPrimary: '#00E479',
          jerseyColorSecondary: '#FFFFFF',
        });
        await teamRepo.save(team1);
      }
      await createTeamData(team1, tierOvrRange, false);

      // Team 2 (test2@goalxi.com)
      let team2 = await teamRepo.findOne({ where: { userId: testUser2.id } });
      if (!team2) {
        team2 = new TeamEntity({
          id: uuidv4() as any,
          userId: testUser2.id,
          name: 'Team 2',
          shortCode: await generateFreshShortCode(teamRepo),
          leagueId: league.id,
          isBot: false,
          logoUrl: '',
          jerseyColorPrimary: '#FFDB9D',
          jerseyColorSecondary: '#FFFFFF',
        });
        await teamRepo.save(team2);
      }
      await createTeamData(team2, tierOvrRange, false);

      // Fill remaining slots with bot teams (need 16 total, 2 user teams already exist)
      await createBotTeams(league, botUser, tierOvrRange, 16);
      console.log(`   ✓ ${league.name}: 2 user teams + 14 bot teams`);
    } else {
      // All bot teams for other leagues
      await createBotTeams(league, botUser, tierOvrRange, 16);
      console.log(`   ✓ ${league.name}: 16 bot teams`);
    }
  }

  async function createTeamData(
    team: TeamEntity,
    ovrRange: { min: number; max: number },
    isBot: boolean,
  ) {
    // Finance
    let finance = await financeRepo.findOne({ where: { teamId: team.id } });
    if (!finance) {
      finance = new FinanceEntity({
        teamId: team.id,
        balance: isBot ? 5000000 : 500000,
      });
      await financeRepo.save(finance);
    }

    // Stadium — upsert to ensure every team has a 10 000-seat stadium
    const existingStadium = await stadiumRepo.findOne({
      where: { teamId: team.id },
    });
    if (existingStadium) {
      existingStadium.capacity = 10000;
      existingStadium.isBuilt = true;
      await stadiumRepo.save(existingStadium);
    } else {
      await stadiumRepo.save(
        stadiumRepo.create({
          teamId: team.id,
          capacity: 10000,
          isBuilt: true,
        }),
      );
    }

    // Fan
    let fan = await fanRepo.findOne({ where: { teamId: team.id } });
    if (!fan) {
      fan = new FanEntity({
        teamId: team.id,
        totalFans: isBot ? 10000 : 100000,
        fanEmotion: 70,
        recentForm: '',
      });
      await fanRepo.save(fan);
    }

    // Standing
    let standing = await standingRepo.findOne({
      where: { leagueId: team.leagueId, teamId: team.id, season: SEASON },
    });
    if (!standing) {
      standing = standingRepo.create({
        leagueId: team.leagueId,
        teamId: team.id,
        season: SEASON,
        position: 0,
        played: 0,
        points: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        recentForm: '',
      });
      await standingRepo.save(standing);
    }

    // Create players
    const existingPlayers = await playerRepo.count({
      where: { teamId: team.id },
    });
    if (existingPlayers > 0) return; // Already has players

    const players: PlayerEntity[] = [];

    for (let p = 0; p < TEAM_ROSTER_SIZE; p++) {
      const isGK = p < GK_COUNT;
      const nationality = randomElement([
        'CN',
        'GB',
        'ES',
        'BR',
        'IT',
        'DE',
        'FR',
      ]);
      const { firstName, lastName } = getRandomNameByNationality(nationality);

      // Game age 20-32 for competitive players
      const gameAge = randomInt(20, 32);

      // Generate player using new generator
      const playerData = generatePlayerData({
        isGoalkeeper: isGK,
        nationality,
        firstName,
        lastName,
        age: gameAge,
      });

      // Calculate wage based on current skills
      const tech = playerData.currentSkills.technical as unknown as Record<
        string,
        number
      >;
      const phys = playerData.currentSkills.physical as unknown as Record<
        string,
        number
      >;
      const ment = playerData.currentSkills.mental as unknown as Record<
        string,
        number
      >;
      let skillValues: number[], skillKeys: string[];
      if (isGK) {
        skillValues = [
          tech.reflexes,
          tech.handling,
          tech.aerial,
          ment.positioning,
        ];
        skillKeys = ['gk_reflexes', 'gk_handling', 'gk_aerial', 'positioning'];
      } else {
        skillValues = [
          phys.pace,
          phys.strength,
          tech.finishing,
          tech.passing,
          tech.dribbling,
          tech.defending,
          ment.positioning,
          ment.composure,
        ];
        skillKeys = [
          'pace',
          'strength',
          'finishing',
          'passing',
          'dribbling',
          'defending',
          'positioning',
          'composure',
        ];
      }
      const currentWage = calculatePlayerWage(skillValues, skillKeys);

      const playerId = uuidv4();
      const player = new PlayerEntity({
        id: playerId as any,
        displayId: formatDisplayId(displayIdFromUuid(playerId)),
        name: playerData.name,
        teamId: team.id,
        isGoalkeeper: isGK,
        birthday: playerData.birthday,
        isYouth: false,
        potentialAbility: playerData.potentialAbility,
        currentSkills: playerData.currentSkills as any,
        potentialSkills: playerData.potentialSkills as any,
        experience: randomFloat(isBot ? 5 : 10, isBot ? 15 : 20),
        form: randomFloat(3.5, 5.0),
        stamina: randomFloat(4.0, 5.0),
        onTransfer: false,
        currentWage,
      });
      players.push(player);
    }

    await playerRepo.save(players);
  }

  async function createBotTeams(
    league: LeagueEntity,
    botUser: UserEntity,
    ovrRange: { min: number; max: number },
    count: number,
  ) {
    for (let i = 0; i < count; i++) {
      const teamName = generateTeamName(league.tier, league.tierDivision, i);
      let team = await teamRepo.findOne({
        where: { name: teamName, leagueId: league.id },
      });
      if (team) continue;

      team = new TeamEntity({
        id: uuidv4() as any,
        userId: botUser.id,
        name: teamName,
        shortCode: await generateFreshShortCode(teamRepo),
        leagueId: league.id,
        isBot: true,
        botLevel: 5,
        logoUrl: '',
        jerseyColorPrimary: `#${Math.floor(Math.random() * 16777215)
          .toString(16)
          .padStart(6, '0')}`,
        jerseyColorSecondary: '#FFFFFF',
      });
      await teamRepo.save(team);
      await createTeamData(team, ovrRange, true);
    }
  }

  // ==========================================================================
  // 4. CREATE MATCHES (Basic structure only - no simulation)
  // ==========================================================================
  console.log('\n📅 Creating matches...');

  for (const league of leagues) {
    const teamsInLeague = await teamRepo.find({
      where: { leagueId: league.id },
      order: { createdAt: 'ASC' },
    });
    if (teamsInLeague.length < 2) continue;

    // Check if matches already exist
    const existingMatches = await matchRepo.count({
      where: { leagueId: league.id, season: SEASON },
    });
    if (existingMatches > 0) {
      console.log(
        `   ⊙ ${league.name}: ${existingMatches} matches already exist`,
      );
      continue;
    }

    const MATCHES_PER_DAY = teamsInLeague.length / 2;
    console.log(
      `[SEED] League ${league.name}: ${teamsInLeague.length} teams, ${MATCHES_PER_DAY} matches per round, ${allMatchDates.length} rounds`,
    );

    for (let mdIndex = 0; mdIndex < allMatchDates.length; mdIndex++) {
      const { date, week, matchday, round } = allMatchDates[mdIndex];
      console.log(
        `[SEED] Creating round ${round} (week ${week}, md${matchday})`,
      );

      // Build rotating teams array (indices 0 to n-2, excluding fixed team at n-1)
      const n = teamsInLeague.length; // 16
      const fixedTeamIdx = n - 1; // 15
      const fixedTeam = teamsInLeague[fixedTeamIdx];
      const rotatingTeamIndices: number[] = [];
      for (let t = 0; t < n - 1; t++) {
        rotatingTeamIndices.push(t);
      }
      // Rotate by mdIndex positions (each round shifts by 1)
      const rotatedIndices = [
        ...rotatingTeamIndices.slice(mdIndex),
        ...rotatingTeamIndices.slice(0, mdIndex),
      ];

      // Match 1: fixed team (team n-1) vs rotating opponent (rotatedIndices[0])
      const rotatingOpponentIdx = rotatedIndices[0];
      const rotatingOpponent = teamsInLeague[rotatingOpponentIdx];
      if (fixedTeam && rotatingOpponent) {
        const homePlayers = await playerRepo.find({
          where: { teamId: fixedTeam.id },
        });
        const awayPlayers = await playerRepo.find({
          where: { teamId: rotatingOpponent.id },
        });

        const match = new MatchEntity({
          id: uuidv4() as any,
          leagueId: league.id,
          season: SEASON,
          week,
          round,
          homeTeamId: fixedTeam.id,
          awayTeamId: rotatingOpponent.id,
          homeScore: null,
          awayScore: null,
          status: MatchStatus.SCHEDULED,
          type: 'league' as any,
          scheduledAt: date,
          homeForfeit: false,
          awayForfeit: false,
          tacticsLocked: false,
          hasExtraTime: false,
          requiresWinner: false,
          hasPenaltyShootout: false,
          startedAt: null,
          completedAt: null,
        });
        await matchRepo.save(match);

        // Create tactics for both teams (for lineup display)
        const homeTactics = await createTeamTactics(
          match.id,
          fixedTeam.id,
          homePlayers,
        );
        const awayTactics = await createTeamTactics(
          match.id,
          rotatingOpponent.id,
          awayPlayers,
        );
        await matchTacticsRepo.save([homeTactics, awayTactics]);
      }

      // 7 pairs from remaining 14 teams
      for (let i = 1; i < rotatedIndices.length / 2; i++) {
        const awayIdx = rotatedIndices[i];
        const homeIdx = rotatedIndices[rotatedIndices.length - i];

        const homeTeam = teamsInLeague[homeIdx];
        const awayTeam = teamsInLeague[awayIdx];
        if (!homeTeam || !awayTeam || homeTeam.id === awayTeam.id) continue;

        const homePlayers = await playerRepo.find({
          where: { teamId: homeTeam.id },
        });
        const awayPlayers = await playerRepo.find({
          where: { teamId: awayTeam.id },
        });

        const match = new MatchEntity({
          id: uuidv4() as any,
          leagueId: league.id,
          season: SEASON,
          week,
          round,
          homeTeamId: homeTeam.id,
          awayTeamId: awayTeam.id,
          homeScore: null,
          awayScore: null,
          status: MatchStatus.SCHEDULED,
          type: 'league' as any,
          scheduledAt: date,
          homeForfeit: false,
          awayForfeit: false,
          tacticsLocked: false,
          hasExtraTime: false,
          requiresWinner: false,
          hasPenaltyShootout: false,
          startedAt: null,
          completedAt: null,
        });
        await matchRepo.save(match);

        const homeTactics = await createTeamTactics(
          match.id,
          homeTeam.id,
          homePlayers,
        );
        const awayTactics = await createTeamTactics(
          match.id,
          awayTeam.id,
          awayPlayers,
        );
        await matchTacticsRepo.save([homeTactics, awayTactics]);
      }
    }

    console.log(
      `   ✓ ${league.name}: created ${(teamsInLeague.length / 2) * allMatchDates.length} matches`,
    );
  }

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log('\n' + '='.repeat(60));
  console.log('✅ Season 1 seed complete!');
  console.log('='.repeat(60));
  console.log(`   Initial Date: ${INITIAL_DATE.toISOString().split('T')[0]}`);
  console.log(
    `   First Match: ${allMatchDates[0].date.toISOString().split('T')[0]} (Round ${allMatchDates[0].round})`,
  );
  console.log(
    `   Last Match: ${allMatchDates[allMatchDates.length - 1].date.toISOString().split('T')[0]} (Round ${allMatchDates[allMatchDates.length - 1].round})`,
  );
  console.log(`   Total Rounds: ${allMatchDates.length}`);
  console.log(`   L1: 1 league (16 teams)`);
  console.log(`   L2: 4 leagues (16 teams each)`);
  console.log(`   User Teams: Team 1, Team 2`);
  console.log(`   Login: test@goalxi.com / test2@goalxi.com / password123`);
  console.log('='.repeat(60));

  await AppDataSource.destroy();
}

createLeaguePyramid().catch((e) => {
  console.error('❌ Seed failed:', e);
  process.exit(1);
});
