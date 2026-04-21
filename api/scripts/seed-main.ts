import {
  FanEntity,
  FINANCE_CONSTANTS,
  FinanceEntity,
  GAME_SETTINGS,
  LeagueEntity,
  LeagueStandingEntity,
  MatchEntity,
  MatchEventEntity,
  MatchEventType,
  MatchPhase,
  MatchStatus,
  MatchTacticsEntity,
  PlayerEntity,
  PlayerEventEntity,
  PlayerEventType,
  PlayerSkills,
  PotentialTier,
  StadiumEntity,
  StaffEntity,
  StaffRole,
  TeamEntity,
  TrainingSlot,
  TransactionEntity,
  TransactionType,
  UserEntity,
  Uuid,
} from '@goalxi/database';
import { calculatePlayerWage } from '@goalxi/database/src/constants/finance.constants';
import 'reflect-metadata';
import { v4 as uuidv4 } from 'uuid';
import { getRandomNameByNationality } from '../src/constants/name-database';
import { AppDataSource } from '../src/database/data-source';

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

// Completed match dates (Week 1 & 2)
const MATCH_WEEK_1_DAY_1 = new Date('2026-04-09T20:00:00Z'); // Wed
const MATCH_WEEK_1_DAY_2 = new Date('2026-04-12T15:00:00Z'); // Sat
const MATCH_WEEK_2_DAY_1 = new Date('2026-04-16T20:00:00Z'); // Wed
const MATCH_WEEK_2_DAY_2 = new Date('2026-04-19T15:00:00Z'); // Sat

// Settlement dates (Sundays after each week)
const SETTLEMENT_WEEK_1 = new Date('2026-04-13T00:00:00Z');
const SETTLEMENT_WEEK_2 = new Date('2026-04-20T00:00:00Z');

// Future scheduled matches (not yet played)
const MATCH_WEEK_3_DAY_1 = new Date('2026-04-23T20:00:00Z'); // Wed
const MATCH_WEEK_3_DAY_2 = new Date('2026-04-26T15:00:00Z'); // Sat
const MATCH_WEEK_4_DAY_1 = new Date('2026-04-30T20:00:00Z'); // Wed
const MATCH_WEEK_4_DAY_2 = new Date('2026-05-03T15:00:00Z'); // Sat

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

function generatePlayerPotential(): { tier: PotentialTier; ability: number } {
  // Shifted distribution: higher overall abilities for more competitive feel
  const rand = Math.random() * 100;
  if (rand < 1)
    return { tier: PotentialTier.LEGEND, ability: randomInt(88, 99) };
  if (rand < 8)
    return { tier: PotentialTier.ELITE, ability: randomInt(78, 92) };
  if (rand < 25)
    return { tier: PotentialTier.HIGH_PRO, ability: randomInt(68, 82) };
  if (rand < 60)
    return { tier: PotentialTier.REGULAR, ability: randomInt(55, 72) };
  return { tier: PotentialTier.LOW, ability: randomInt(40, 58) };
}

function generatePlayerAttributes(
  isGK: boolean,
  potentialAbility: number,
  age: number,
): { current: PlayerSkills; potential: PlayerSkills } {
  // Target average skill on 0-20 scale = potentialAbility / 5
  const targetPotentialAvg = potentialAbility / 5;

  const outfieldKeys = {
    physical: ['pace', 'strength'],
    technical: ['finishing', 'passing', 'dribbling', 'defending'],
    mental: ['positioning', 'composure'],
    setPieces: ['freeKicks', 'penalties'],
  };

  const gkKeys = {
    physical: ['pace', 'strength'],
    technical: ['reflexes', 'handling', 'aerial'],
    mental: ['positioning', 'composure'],
    setPieces: ['freeKicks', 'penalties'],
  };

  const keys = isGK ? gkKeys : outfieldKeys;

  const potential: Record<string, any> = {
    physical: {},
    technical: {},
    mental: {},
    setPieces: {},
  };
  const current: Record<string, any> = {
    physical: {},
    technical: {},
    mental: {},
    setPieces: {},
  };

  // Generate potential skills (full development)
  Object.entries(keys).forEach(([category, attrs]) => {
    attrs.forEach((attr) => {
      let val = targetPotentialAvg + (Math.random() * 6 - 3);
      val = Math.max(5, Math.min(20, val));
      potential[category][attr] = parseFloat(val.toFixed(2));
    });
  });

  // Generate current skills based on age ratio
  // Age 18-20: 60-80% of potential, Age 21-25: 80-95%, Age 26+: 95-100%
  let ageRatio: number;
  if (age <= 17) {
    ageRatio = 0.4 + Math.random() * 0.1;
  } else if (age <= 20) {
    ageRatio = 0.6 + Math.random() * 0.2;
  } else if (age <= 25) {
    ageRatio = 0.8 + Math.random() * 0.15;
  } else if (age <= 30) {
    ageRatio = 0.92 + Math.random() * 0.08;
  } else {
    ageRatio = 0.95 + Math.random() * 0.05;
  }
  ageRatio = Math.min(1.0, ageRatio);

  Object.entries(keys).forEach(([category, attrs]) => {
    attrs.forEach((attr) => {
      let ca = potential[category][attr] * ageRatio;
      ca += Math.random() * 2 - 1; // ±1 variance
      ca = Math.max(5, Math.min(potential[category][attr], ca));
      current[category][attr] = parseFloat(ca.toFixed(2));
    });
  });

  return {
    current: current as PlayerSkills,
    potential: potential as PlayerSkills,
  };
}

function generateTeamName(
  tier: number,
  division: number,
  index: number,
): string {
  return `Team ${index + 1}`;
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
 * Calculate game age from birthday
 * 1 game year = SEASON_LENGTH_WEEKS * DAYS_PER_WEEK * 24 * 60 * 60 * 1000 ms
 */
function calculateGameAge(birthday: Date): number {
  const gameYearMs =
    GAME_SETTINGS.SEASON_LENGTH_WEEKS *
    GAME_SETTINGS.DAYS_PER_WEEK *
    24 *
    60 *
    60 *
    1000;
  const ageMs = SEASON_START_DATE.getTime() - birthday.getTime();
  return Math.floor(ageMs / gameYearMs);
}

/**
 * Generate birthday for a player of given game age
 */
function generateBirthday(gameAge: number): Date {
  const gameYearMs =
    GAME_SETTINGS.SEASON_LENGTH_WEEKS *
    GAME_SETTINGS.DAYS_PER_WEEK *
    24 *
    60 *
    60 *
    1000;
  const ageMs = gameAge * gameYearMs;
  const birthdayTime = SEASON_START_DATE.getTime() - ageMs;
  // Add some random days within the year
  const randomDays = Math.floor(Math.random() * 365);
  return new Date(birthdayTime - randomDays * 24 * 60 * 60 * 1000);
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
 * Generate realistic match score based on team OVRs
 */
function generateMatchScore(
  homeOvr: number,
  awayOvr: number,
): { homeScore: number; awayScore: number } {
  const ovrDiff = homeOvr - awayOvr;
  // Home advantage: ~3 OVR equivalent
  const effectiveDiff = ovrDiff + 3;

  // Base expected goals for each team
  const homeExpected = 1.3 + effectiveDiff / 50;
  const awayExpected = 1.3 - effectiveDiff / 50;

  // Poisson-like distribution for goals
  const homeScore = Math.max(
    0,
    Math.min(5, Math.round(homeExpected + (Math.random() - 0.5) * 3)),
  );
  const awayScore = Math.max(
    0,
    Math.min(5, Math.round(awayExpected + (Math.random() - 0.5) * 3)),
  );

  return { homeScore, awayScore };
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
  const matchEventRepo = AppDataSource.getRepository(MatchEventEntity);
  const matchTacticsRepo = AppDataSource.getRepository(MatchTacticsEntity);
  const transactionRepo = AppDataSource.getRepository(TransactionEntity);

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

    // Stadium
    let stadium = await stadiumRepo.findOne({ where: { teamId: team.id } });
    if (!stadium) {
      stadium = new StadiumEntity({
        teamId: team.id,
        capacity: isBot ? 10000 : 50000,
        isBuilt: true,
      });
      await stadiumRepo.save(stadium);
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
    const baseOvr = randomInt(ovrRange.min, ovrRange.max);

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
      const name = `${firstName} ${lastName}`;

      // Game age 20-32 for competitive players
      const gameAge = randomInt(20, 32);
      const birthday = generateBirthday(gameAge);

      // Slightly higher OVR than bot teams for user teams
      const playerOvrOffset = isBot ? randomInt(-2, 2) : randomInt(0, 5);
      const ability = Math.round(((baseOvr + playerOvrOffset) / 5) * 10) / 10;

      const { tier: potentialTier, ability: potentialAbility } =
        generatePlayerPotential();
      const { current, potential } = generatePlayerAttributes(
        isGK,
        potentialAbility * 5,
        gameAge,
      );

      // Calculate wage
      const tech = current.technical as unknown as Record<string, number>;
      const phys = current.physical as unknown as Record<string, number>;
      const ment = current.mental as unknown as Record<string, number>;
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

      const player = new PlayerEntity({
        name,
        teamId: team.id,
        isGoalkeeper: isGK,
        birthday,
        isYouth: false,
        potentialAbility: Math.round(potentialAbility),
        potentialTier,
        trainingSlot: TrainingSlot.REGULAR,
        appearance: generatePlayerAppearance(),
        currentSkills: current,
        potentialSkills: potential,
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
  // 4. CREATE MATCHES (2 completed weeks + 2 future weeks)
  // ==========================================================================
  console.log('\n📅 Creating matches...');

  const completedMatchDates = [
    MATCH_WEEK_1_DAY_1,
    MATCH_WEEK_1_DAY_2,
    MATCH_WEEK_2_DAY_1,
    MATCH_WEEK_2_DAY_2,
  ];
  const futureMatchDates = [
    MATCH_WEEK_3_DAY_1,
    MATCH_WEEK_3_DAY_2,
    MATCH_WEEK_4_DAY_1,
    MATCH_WEEK_4_DAY_2,
  ];
  const allMatchDates = [
    { date: MATCH_WEEK_1_DAY_1, week: 1, matchday: 1 },
    { date: MATCH_WEEK_1_DAY_2, week: 1, matchday: 2 },
    { date: MATCH_WEEK_2_DAY_1, week: 2, matchday: 1 },
    { date: MATCH_WEEK_2_DAY_2, week: 2, matchday: 2 },
    { date: MATCH_WEEK_3_DAY_1, week: 3, matchday: 1 },
    { date: MATCH_WEEK_3_DAY_2, week: 3, matchday: 2 },
    { date: MATCH_WEEK_4_DAY_1, week: 4, matchday: 1 },
    { date: MATCH_WEEK_4_DAY_2, week: 4, matchday: 2 },
  ];

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
      `[SEED] League ${league.name}: ${teamsInLeague.length} teams, ${MATCHES_PER_DAY} matches per round, ${allMatchDates.length} total rounds`,
    );

    for (let mdIndex = 0; mdIndex < allMatchDates.length; mdIndex++) {
      const { date, week, matchday } = allMatchDates[mdIndex];
      const isCompleted = mdIndex < 4; // First 4 matchdays are completed
      const roundNum = mdIndex + 1;
      console.log(
        `[SEED] Creating round ${roundNum} (week ${week}, mdIndex ${mdIndex}): ${MATCHES_PER_DAY} matches`,
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
      // rotatedIndices[0] is the rotating opponent for this round

      // Match 1: fixed team (team n-1) vs rotating opponent (rotatedIndices[0])
      const rotatingOpponentIdx = rotatedIndices[0];
      const rotatingOpponent = teamsInLeague[rotatingOpponentIdx];
      if (fixedTeam && rotatingOpponent) {
        let homeScore = 0,
          awayScore = 0;
        if (isCompleted) {
          const homePlayers = await playerRepo.find({
            where: { teamId: fixedTeam.id },
          });
          const awayPlayers = await playerRepo.find({
            where: { teamId: rotatingOpponent.id },
          });
          const score = generateMatchScore(
            calculateTeamOvr(homePlayers),
            calculateTeamOvr(awayPlayers),
          );
          homeScore = score.homeScore;
          awayScore = score.awayScore;
        }
        const match = new MatchEntity({
          id: uuidv4() as any,
          leagueId: league.id,
          season: SEASON,
          week,
          round: roundNum,
          homeTeamId: fixedTeam.id,
          awayTeamId: rotatingOpponent.id,
          homeScore: isCompleted ? homeScore : null,
          awayScore: isCompleted ? awayScore : null,
          status: isCompleted ? MatchStatus.COMPLETED : MatchStatus.SCHEDULED,
          type: 'league' as any,
          scheduledAt: date,
          homeForfeit: false,
          awayForfeit: false,
          tacticsLocked: isCompleted,
          hasExtraTime: false,
          requiresWinner: false,
          hasPenaltyShootout: false,
          startedAt: isCompleted ? date : null,
          completedAt: isCompleted
            ? new Date(date.getTime() + 2 * 60 * 60 * 1000)
            : null,
        });
        await matchRepo.save(match);
        if (isCompleted)
          await generateMatchEvents(match, homeScore, awayScore, date);
      }

      // 7 pairs from remaining 14 teams (excluding rotating opponent)
      // Proper round-robin: first half (indices 1-7 of rotatedIndices) vs second half (indices 8-14)
      for (let i = 1; i < rotatedIndices.length / 2; i++) {
        const awayIdx = rotatedIndices[i]; // First half plays away
        const homeIdx = rotatedIndices[rotatedIndices.length - i]; // Second half plays home

        const homeTeam = teamsInLeague[homeIdx];
        const awayTeam = teamsInLeague[awayIdx];
        if (!homeTeam || !awayTeam || homeTeam.id === awayTeam.id) continue;

        let homeScore = 0,
          awayScore = 0;
        if (isCompleted) {
          const homePlayers = await playerRepo.find({
            where: { teamId: homeTeam.id },
          });
          const awayPlayers = await playerRepo.find({
            where: { teamId: awayTeam.id },
          });
          const score = generateMatchScore(
            calculateTeamOvr(homePlayers),
            calculateTeamOvr(awayPlayers),
          );
          homeScore = score.homeScore;
          awayScore = score.awayScore;
        }

        const match = new MatchEntity({
          id: uuidv4() as any,
          leagueId: league.id,
          season: SEASON,
          week,
          round: roundNum,
          homeTeamId: homeTeam.id,
          awayTeamId: awayTeam.id,
          homeScore: isCompleted ? homeScore : null,
          awayScore: isCompleted ? awayScore : null,
          status: isCompleted ? MatchStatus.COMPLETED : MatchStatus.SCHEDULED,
          type: 'league' as any,
          scheduledAt: date,
          homeForfeit: false,
          awayForfeit: false,
          tacticsLocked: isCompleted,
          hasExtraTime: false,
          requiresWinner: false,
          hasPenaltyShootout: false,
          startedAt: isCompleted ? date : null,
          completedAt: isCompleted
            ? new Date(date.getTime() + 2 * 60 * 60 * 1000)
            : null,
        });
        await matchRepo.save(match);
        if (isCompleted)
          await generateMatchEvents(match, homeScore, awayScore, date);
      }
    }

    console.log(
      `   ✓ ${league.name}: created ${MATCHES_PER_DAY * allMatchDates.length} matches (4 completed, 4 scheduled)`,
    );
  }

  async function generateMatchEvents(
    match: MatchEntity,
    homeScore: number,
    awayScore: number,
    scheduledAt: Date,
  ) {
    // Create basic goal events
    const events: Partial<MatchEventEntity>[] = [];

    // Kickoff
    events.push({
      matchId: match.id,
      minute: 0,
      second: 0,
      type: MatchEventType.KICKOFF,
      typeName: 'kickoff',
      teamId: match.homeTeamId,
      phase: MatchPhase.FIRST_HALF,
      data: { period: 'first_half' } as any,
      eventScheduledTime: scheduledAt,
      isRevealed: true,
    });

    // Home goals
    for (let g = 0; g < homeScore; g++) {
      const minute = randomInt(5, 90);
      events.push({
        matchId: match.id,
        minute,
        second: 0,
        type: MatchEventType.GOAL,
        typeName: 'goal',
        teamId: match.homeTeamId,
        isHome: true,
        phase: minute <= 45 ? MatchPhase.FIRST_HALF : MatchPhase.SECOND_HALF,
        data: {
          teamName: 'Home Team',
          playerName: 'Player',
          assistPlayerName: null,
        } as any,
        eventScheduledTime: new Date(
          scheduledAt.getTime() + minute * 60 * 1000,
        ),
        isRevealed: true,
      });
    }

    // Away goals
    for (let g = 0; g < awayScore; g++) {
      const minute = randomInt(5, 90);
      events.push({
        matchId: match.id,
        minute,
        second: 0,
        type: MatchEventType.GOAL,
        typeName: 'goal',
        teamId: match.awayTeamId,
        isHome: false,
        phase: minute <= 45 ? MatchPhase.FIRST_HALF : MatchPhase.SECOND_HALF,
        data: {
          teamName: 'Away Team',
          playerName: 'Player',
          assistPlayerName: null,
        } as any,
        eventScheduledTime: new Date(
          scheduledAt.getTime() + minute * 60 * 1000,
        ),
        isRevealed: true,
      });
    }

    // Half time
    events.push({
      matchId: match.id,
      minute: 45,
      second: 0,
      type: MatchEventType.HALF_TIME,
      typeName: 'half_time',
      teamId: undefined,
      phase: MatchPhase.FIRST_HALF,
      data: {} as any,
      eventScheduledTime: new Date(scheduledAt.getTime() + 45 * 60 * 1000),
      isRevealed: true,
    });

    // Second half kickoff
    events.push({
      matchId: match.id,
      minute: 45,
      second: 0,
      type: MatchEventType.KICKOFF,
      typeName: 'kickoff',
      teamId: match.awayTeamId,
      phase: MatchPhase.SECOND_HALF,
      data: { period: 'second_half' } as any,
      eventScheduledTime: new Date(scheduledAt.getTime() + 60 * 60 * 1000),
      isRevealed: true,
    });

    // Full time
    events.push({
      matchId: match.id,
      minute: 90,
      second: 0,
      type: MatchEventType.FULL_TIME,
      typeName: 'full_time',
      teamId: undefined,
      phase: MatchPhase.SECOND_HALF,
      data: {} as any,
      eventScheduledTime: new Date(scheduledAt.getTime() + 90 * 60 * 1000),
      isRevealed: true,
    });

    await matchEventRepo.save(events.map((e) => matchEventRepo.create(e)));
  }

  // ==========================================================================
  // 5. UPDATE STANDINGS FOR COMPLETED MATCHES
  // ==========================================================================
  console.log('\n📊 Updating standings for completed matches...');

  const completedMatches = await matchRepo.find({
    where: { season: SEASON, status: MatchStatus.COMPLETED },
    relations: ['homeTeam', 'awayTeam'],
  });

  for (const match of completedMatches) {
    if (match.homeScore === undefined || match.awayScore === undefined)
      continue;

    const homeStanding = await standingRepo.findOne({
      where: {
        leagueId: match.leagueId,
        teamId: match.homeTeamId,
        season: SEASON,
      },
    });
    const awayStanding = await standingRepo.findOne({
      where: {
        leagueId: match.leagueId,
        teamId: match.awayTeamId,
        season: SEASON,
      },
    });

    if (homeStanding && awayStanding) {
      homeStanding.played += 1;
      homeStanding.goalsFor += match.homeScore;
      homeStanding.goalsAgainst += match.awayScore;
      homeStanding.goalDifference =
        homeStanding.goalsFor - homeStanding.goalsAgainst;

      awayStanding.played += 1;
      awayStanding.goalsFor += match.awayScore;
      awayStanding.goalsAgainst += match.homeScore;
      awayStanding.goalDifference =
        awayStanding.goalsFor - awayStanding.goalsAgainst;

      if (match.homeScore > match.awayScore) {
        homeStanding.wins += 1;
        homeStanding.points += 3;
        homeStanding.recentForm = (homeStanding.recentForm + 'W').slice(-5);
        awayStanding.losses += 1;
        awayStanding.recentForm = (awayStanding.recentForm + 'L').slice(-5);
      } else if (match.homeScore < match.awayScore) {
        awayStanding.wins += 1;
        awayStanding.points += 3;
        awayStanding.recentForm = (awayStanding.recentForm + 'W').slice(-5);
        homeStanding.losses += 1;
        homeStanding.recentForm = (homeStanding.recentForm + 'L').slice(-5);
      } else {
        homeStanding.draws += 1;
        awayStanding.draws += 1;
        homeStanding.points += 1;
        homeStanding.recentForm = (homeStanding.recentForm + 'D').slice(-5);
        awayStanding.points += 1;
        awayStanding.recentForm = (awayStanding.recentForm + 'D').slice(-5);
      }

      await standingRepo.save([homeStanding, awayStanding]);
    }
  }
  console.log(
    `   ✓ Updated standings for ${completedMatches.length} completed matches`,
  );

  // ==========================================================================
  // 6. GENERATE TICKET REVENUE FOR COMPLETED MATCHES
  // ==========================================================================
  console.log('\n💰 Generating ticket revenue...');

  for (const match of completedMatches) {
    const homeStadium = await stadiumRepo.findOne({
      where: { teamId: match.homeTeamId },
    });
    const homeFan = await fanRepo.findOne({
      where: { teamId: match.homeTeamId },
    });
    if (!homeStadium?.isBuilt || !homeFan) continue;

    // Calculate attendance (~70% of capacity for bot teams, 85% for user teams)
    const homeTeam = await teamRepo.findOne({
      where: { id: match.homeTeamId as Uuid },
    });
    const attendanceRate = homeTeam?.isBot ? 0.5 : 0.85;
    const attendance = Math.floor(homeStadium.capacity * attendanceRate);

    // Base ticket price 20, tier multiplier
    const tier = match.league?.tier || 2;
    const tierMultiplier = { 1: 2.0, 2: 1.5, 3: 1.0, 4: 0.7 }[tier] || 1.0;
    const revenue = Math.floor(attendance * 20 * tierMultiplier);

    // Create transaction
    const tx = transactionRepo.create({
      teamId: match.homeTeamId,
      amount: revenue,
      season: SEASON,
      type: TransactionType.TICKET_INCOME,
      description: `Match ticket revenue (${attendance} attendance)`,
      relatedId: match.id as Uuid,
    });
    await transactionRepo.save(tx);

    // Update finance balance
    await financeRepo.increment(
      { teamId: match.homeTeamId as Uuid },
      'balance',
      revenue,
    );

    console.log(
      `   ✓ ${homeTeam?.name || 'Home'}: ${revenue} ticket revenue (${attendance} attendance)`,
    );
  }

  // ==========================================================================
  // 7. WEEKLY SETTLEMENT (2 weeks completed)
  // ==========================================================================
  console.log('\n💵 Processing weekly settlements...');

  const settlements = [
    { date: SETTLEMENT_WEEK_1, label: 'Week 1' },
    { date: SETTLEMENT_WEEK_2, label: 'Week 2' },
  ];

  for (const settlement of settlements) {
    const allTeams = await teamRepo.find();
    console.log(
      `\n   Processing ${settlement.label} settlement (${settlement.date.toISOString().split('T')[0]})...`,
    );

    for (const team of allTeams) {
      const tier = team.league?.tier || 2;
      const finance = await financeRepo.findOne({ where: { teamId: team.id } });
      const fan = await fanRepo.findOne({ where: { teamId: team.id } });
      const stadium = await stadiumRepo.findOne({ where: { teamId: team.id } });
      const players = await playerRepo.find({
        where: { teamId: team.id, isYouth: false },
      });
      const staffMembers = await staffRepo.find({
        where: { teamId: team.id, isActive: true },
      });

      // 1. Sponsorship income
      const baseSponsorship =
        FINANCE_CONSTANTS.SPONSORSHIP_BASE[
          tier as keyof typeof FINANCE_CONSTANTS.SPONSORSHIP_BASE
        ] || 30000;
      const fanCount = fan?.totalFans || 1000;
      const sponsorshipMultiplier = Math.sqrt(fanCount / 10000);
      const sponsorship = Math.floor(
        baseSponsorship * 2 * sponsorshipMultiplier,
      );

      let tx = transactionRepo.create({
        teamId: team.id,
        amount: sponsorship,
        season: SEASON,
        type: TransactionType.SPONSORSHIP,
        description: `Weekly sponsorship (Tier ${tier}, ${fanCount} fans)`,
      });
      await transactionRepo.save(tx);
      if (finance) {
        finance.balance += sponsorship;
      }

      // 2. Staff wages
      for (const staff of staffMembers) {
        const baseWage =
          FINANCE_CONSTANTS.STAFF_WAGE[
            staff.level as keyof typeof FINANCE_CONSTANTS.STAFF_WAGE
          ] || 15000;
        const staffWage =
          staff.role === StaffRole.HEAD_COACH ? baseWage * 2 : baseWage;

        tx = transactionRepo.create({
          teamId: team.id,
          amount: -staffWage,
          season: SEASON,
          type: TransactionType.STAFF_WAGES,
          description: `Weekly wage for ${staff.name} (${staff.role})`,
          relatedId: staff.id as Uuid,
        });
        await transactionRepo.save(tx);
        if (finance) {
          finance.balance -= staffWage;
        }
      }

      // 3. Youth team cost
      tx = transactionRepo.create({
        teamId: team.id,
        amount: -FINANCE_CONSTANTS.YOUTH_TEAM_COST,
        season: SEASON,
        type: TransactionType.YOUTH_TEAM,
        description: 'Weekly youth team operation',
      });
      await transactionRepo.save(tx);
      if (finance) {
        finance.balance -= FINANCE_CONSTANTS.YOUTH_TEAM_COST;
      }

      // 4. Stadium maintenance
      if (stadium?.isBuilt) {
        const maintenanceCost =
          stadium.capacity * FINANCE_CONSTANTS.STADIUM_MAINTENANCE_PER_SEAT;
        tx = transactionRepo.create({
          teamId: team.id,
          amount: -maintenanceCost,
          season: SEASON,
          type: TransactionType.OTHER_EXPENSE,
          description: `Weekly stadium maintenance (${stadium.capacity} seats)`,
          relatedId: stadium.id as Uuid,
        });
        await transactionRepo.save(tx);
        if (finance) {
          finance.balance -= maintenanceCost;
        }
      }

      // 5. Player wages
      if (players.length > 0) {
        const totalWages = players.reduce(
          (sum, p) => sum + (p.currentWage || 0),
          0,
        );
        if (totalWages > 0) {
          tx = transactionRepo.create({
            teamId: team.id,
            amount: -totalWages,
            season: SEASON,
            type: TransactionType.WAGES,
            description: `Weekly player wages (${players.length} players)`,
          });
          await transactionRepo.save(tx);
          if (finance) {
            finance.balance -= totalWages;
          }
        }
      }

      await financeRepo.save(finance);
    }
    console.log(
      `   ✓ ${settlement.label} settlement completed for ${allTeams.length} teams`,
    );
  }

  // ==========================================================================
  // 8. CREATE PLAYER EVENTS FOR USER TEAM PLAYERS
  // ==========================================================================
  console.log('\n🎯 Creating player events...');
  const playerEventRepo = AppDataSource.getRepository(PlayerEventEntity);

  const userTeams = await teamRepo.find({ where: { isBot: false } });
  for (const team of userTeams) {
    const players = await playerRepo.find({
      where: { teamId: team.id },
      take: 3,
    });
    for (const player of players) {
      // League debut
      await playerEventRepo.save(
        playerEventRepo.create({
          playerId: player.id,
          season: SEASON,
          date: new Date(SEASON_START_DATE.getTime() + 3 * 24 * 60 * 60 * 1000),
          eventType: PlayerEventType.LEAGUE_DEBUT,
          icon: 'stadium',
          titleKey: 'player_events.league_debut',
          details: { teamName: team.name, leagueId: team.leagueId },
        }),
      );

      // Random events
      if (Math.random() > 0.5) {
        await playerEventRepo.save(
          playerEventRepo.create({
            playerId: player.id,
            season: SEASON,
            date: new Date(
              SEASON_START_DATE.getTime() + 10 * 24 * 60 * 60 * 1000,
            ),
            eventType: PlayerEventType.MAN_OF_THE_MATCH,
            icon: 'star',
            titleKey: 'player_events.man_of_the_match',
            details: { matchId: null },
          }),
        );
      }
    }
  }
  console.log('   ✓ Player events created');

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log('\n' + '='.repeat(60));
  console.log('✅ Season 1 seed complete!');
  console.log('='.repeat(60));
  console.log(
    `   Start Date: ${SEASON_START_DATE.toISOString().split('T')[0]}`,
  );
  console.log(`   Completed Matches: 4 matchdays (Apr 9, 12, 16, 19)`);
  console.log(`   Scheduled Matches: 4 matchdays (Apr 23, 26, 30, May 3)`);
  console.log(`   Settlements: 2 weeks (Apr 13, Apr 20)`);
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
