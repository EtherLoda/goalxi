/**
 * Season Test CLI - Full system integration test
 *
 * Usage:
 *   pnpm cli:season-test --tiers 2 --fresh
 *   pnpm cli:season-test --tiers 2
 *   pnpm cli:season-test --weeks 8 --tiers 2
 */

import { parseArgs } from 'util';
import { DataSource } from 'typeorm';
import * as db from '@goalxi/database';
import {
  LeagueEntity,
  TeamEntity,
  PlayerEntity,
  MatchEntity,
  MatchEventEntity,
  MatchStatus,
  MatchType,
  LeagueStandingEntity,
  FinanceEntity,
  StaffEntity,
  StaffRole,
  TrainingCategory,
  MatchPhase,
  MatchEventType,
  PlayerSkills,
  GKTechnical,
  OutfieldTechnical,
  UserEntity,
  StadiumEntity,
  distributeTrainingPoints,
  GAME_SETTINGS,
} from '@goalxi/database';

// ============ CLI Args ============

interface CliArgs {
  tiers: number;
  weeks: number;
  teamsPerLeague: number;
  fresh: boolean;
  help: boolean;
}

function parseCliArgs(): CliArgs {
  const { values } = parseArgs({
    options: {
      tiers: { type: 'string', short: 't', default: '2' },
      weeks: { type: 'string', short: 'w', default: '16' },
      teams: { type: 'string', short: 'n', default: '16' },
      fresh: { type: 'boolean', short: 'f', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help) {
    console.log(`
Season Test CLI - Full system integration test

Usage:
  pnpm cli:season-test --tiers 2 --fresh
  pnpm cli:season-test --tiers 2 --weeks 8

Options:
  --tiers, -t    Number of tiers (default: 2)
  --weeks, -w    Weeks to simulate (default: 16)
  --teams, -n    Teams per league (default: 16)
  --fresh, -f    Drop and recreate database
  --help, -h     Show this help message
    `);
    process.exit(0);
  }

  return {
    tiers: parseInt(values.tiers) || 2,
    weeks: parseInt(values.weeks) || 16,
    teamsPerLeague: parseInt(values.teams) || 16,
    fresh: values.fresh,
    help: values.help as boolean,
  };
}

// ============ DB Setup ============

async function createDataSource(): Promise<DataSource> {
  // Get all entity classes from @goalxi/database
  const entityValues = Object.values(db);
  const entities = entityValues.filter(
    (e) =>
      typeof e === 'function' &&
      (e as any).prototype &&
      (e as any).name.endsWith('Entity') &&
      (e as any).name !== 'AbstractEntity',
  ) as any[];

  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'goalxi',
    entities,
    synchronize: false,
    logging: false,
  });

  await dataSource.initialize();
  return dataSource;
}

// ============ League Generation ============

async function generateLeagues(ds: DataSource, tierNum: number): Promise<void> {
  const leagueRepo = ds.getRepository(LeagueEntity);
  console.log(`[League] Generating ${tierNum} tier pyramid...`);

  // L1: 1 league
  const l1 = leagueRepo.create({
    name: 'Test League L1',
    tier: 1,
    tierDivision: 1,
    maxTeams: 16,
    promotionSlots: 1,
    playoffSlots: 4,
    relegationSlots: 4,
    status: 'active',
  });
  await leagueRepo.save(l1);
  console.log(`[League] Created L1: ${l1.name}`);

  // L2: 4 leagues
  for (let d = 1; d <= 4; d++) {
    const league = leagueRepo.create({
      name: `Test League L2 Div ${d}`,
      tier: 2,
      tierDivision: d,
      maxTeams: 16,
      promotionSlots: 1,
      playoffSlots: 4,
      relegationSlots: 4,
      status: 'active',
      parentLeagueId: l1.id,
    });
    await leagueRepo.save(league);
  }
  console.log(`[League] Created 4 L2 leagues`);

  // L3+ (if more tiers)
  if (tierNum >= 3) {
    for (let d = 1; d <= 16; d++) {
      const l2Div = Math.ceil(d / 4);
      const parent = await leagueRepo.findOne({
        where: { tier: 2, tierDivision: l2Div },
      });
      const league = leagueRepo.create({
        name: `Test League L3 Div ${d}`,
        tier: 3,
        tierDivision: d,
        maxTeams: 16,
        promotionSlots: 1,
        playoffSlots: 4,
        relegationSlots: 4,
        status: 'active',
        parentLeagueId: parent?.id,
      });
      await leagueRepo.save(league);
    }
    console.log(`[League] Created 16 L3 leagues`);
  }
}

// ============ Team Generation ============

const FIRST_NAMES = [
  '伟',
  '明',
  '军',
  '强',
  '磊',
  '涛',
  '勇',
  '杰',
  '鹏',
  '飞',
  '超',
  '波',
  '华',
  '凯',
  '旋',
  '宇',
  '晨',
  '浩',
  '文',
  '龙',
];
const LAST_NAMES = [
  '伟',
  '芳',
  '刚',
  '强',
  '林',
  '敏',
  '静',
  '丽',
  '辉',
  '鹏',
  '杰',
  '涛',
  '勇',
  '飞',
  '超',
  '华',
  '凯',
  '旋',
  '宇',
];
const CITY_NAMES = [
  '北京',
  '上海',
  '广州',
  '深圳',
  '成都',
  '武汉',
  '杭州',
  '南京',
  '西安',
  '苏州',
  '天津',
  '重庆',
  '长沙',
  '郑州',
  '济南',
  '青岛',
];
const SUFFIXES = ['FC', 'United', 'Club', 'City', 'Athletic'];

async function generateTeams(ds: DataSource): Promise<void> {
  const leagueRepo = ds.getRepository(LeagueEntity);
  const teamRepo = ds.getRepository(TeamEntity);
  const playerRepo = ds.getRepository(PlayerEntity);
  const staffRepo = ds.getRepository(StaffEntity);
  const financeRepo = ds.getRepository(FinanceEntity);
  const standingRepo = ds.getRepository(LeagueStandingEntity);
  const stadiumRepo = ds.getRepository(StadiumEntity);

  const leagues = await leagueRepo.find();
  console.log(`[Team] Generating teams for ${leagues.length} leagues...`);

  let totalTeams = 0;
  let totalPlayers = 0;

  for (const league of leagues) {
    for (let i = 0; i < 16; i++) {
      const city = CITY_NAMES[i % CITY_NAMES.length];
      const suffix = SUFFIXES[i % SUFFIXES.length];
      const teamName = `${city}${suffix}`;

      const team = teamRepo.create({
        name: teamName,
        leagueId: league.id,
        isBot: true,
        botLevel: 5,
        nationality: 'CN',
        benchConfig: null,
      });
      const savedTeam = await teamRepo.save(team);
      totalTeams++;

      // Create stadium for the team
      const stadium = stadiumRepo.create({
        teamId: savedTeam.id,
        capacity: 5000 + randomInt(0, 10) * 500,
        isBuilt: true,
      });
      await stadiumRepo.save(stadium);

      // Create 16 players per team
      const players: ReturnType<typeof playerRepo.create>[] = [];
      for (let p = 0; p < 16; p++) {
        const isGK = p < 2;
        const age = randomInt(20, 28);
        const { current, potential } = generatePlayerSkills(isGK, age);

        players.push(
          playerRepo.create({
            name: `${FIRST_NAMES[randomInt(0, FIRST_NAMES.length - 1)]}${LAST_NAMES[randomInt(0, LAST_NAMES.length - 1)]}`,
            teamId: savedTeam.id,
            isGoalkeeper: isGK,
            nationality: 'CN',
            birthday: generateBirthday(age),
            isYouth: false,
            currentSkills: current,
            potentialSkills: potential,
            potentialAbility: Math.round(calculateOvr(potential) * 5),
            experience: randomFloat(5, 15),
            form: randomFloat(3, 5),
            stamina: randomFloat(4, 5),
            currentWage: 5000,
          }),
        );
      }
      await playerRepo.save(players);
      totalPlayers += players.length;

      // Create head coach
      await staffRepo.save(
        staffRepo.create({
          teamId: savedTeam.id,
          name: `${FIRST_NAMES[randomInt(0, FIRST_NAMES.length - 1)]}${LAST_NAMES[randomInt(0, LAST_NAMES.length - 1)]}`,
          role: StaffRole.HEAD_COACH,
          level: 2,
          salary: 4000,
          contractExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          autoRenew: true,
          isActive: true,
          nationality: 'CN',
        }),
      );

      // Create finance
      await financeRepo.save(
        financeRepo.create({
          teamId: savedTeam.id,
          balance: 5000000,
        }),
      );

      // Create standing
      await standingRepo.save(
        standingRepo.create({
          teamId: savedTeam.id,
          leagueId: league.id,
          season: 1,
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
        }),
      );
    }
  }

  console.log(
    `[Team] Created ${totalTeams} teams with ${totalPlayers} players`,
  );
}

function generatePlayerSkills(
  isGK: boolean,
  age: number,
): { current: PlayerSkills; potential: PlayerSkills } {
  const skillBase = randomInt(11, 15);
  const current = generateSkillsForAge(skillBase, age, isGK);
  const potential = generateSkillsForAge(
    skillBase + randomInt(3, 8),
    age + 2,
    isGK,
  );
  return { current, potential };
}

function generateSkillsForAge(
  baseOvr: number,
  age: number,
  isGK: boolean,
): PlayerSkills {
  const skillValue = Math.round(baseOvr / 5);
  const variance = () => Math.random() * 2 - 1;

  if (isGK) {
    return {
      physical: {
        pace: Math.max(1, Math.min(20, skillValue + variance())),
        strength: Math.max(1, Math.min(20, skillValue + variance())),
      },
      technical: {
        reflexes: Math.max(1, Math.min(20, skillValue + 2 + variance())),
        handling: Math.max(1, Math.min(20, skillValue + 2 + variance())),
        aerial: Math.max(1, Math.min(20, skillValue + variance())),
        positioning: Math.max(1, Math.min(20, skillValue + variance())),
      } as GKTechnical,
      mental: {
        positioning: Math.max(1, Math.min(20, skillValue + variance())),
        composure: Math.max(1, Math.min(20, skillValue + variance())),
      },
      setPieces: {
        freeKicks: Math.max(1, Math.min(20, skillValue - 2 + variance())),
        penalties: Math.max(1, Math.min(20, skillValue - 2 + variance())),
      },
    };
  }

  return {
    physical: {
      pace: Math.max(1, Math.min(20, skillValue + variance())),
      strength: Math.max(1, Math.min(20, skillValue + variance())),
    },
    technical: {
      finishing: Math.max(1, Math.min(20, skillValue + 2 + variance())),
      passing: Math.max(1, Math.min(20, skillValue + variance())),
      dribbling: Math.max(1, Math.min(20, skillValue + variance())),
      defending: Math.max(1, Math.min(20, skillValue - 1 + variance())),
    } as OutfieldTechnical,
    mental: {
      positioning: Math.max(1, Math.min(20, skillValue + variance())),
      composure: Math.max(1, Math.min(20, skillValue + variance())),
    },
    setPieces: {
      freeKicks: Math.max(1, Math.min(20, skillValue - 2 + variance())),
      penalties: Math.max(1, Math.min(20, skillValue - 2 + variance())),
    },
  };
}

function calculateOvr(skills: PlayerSkills): number {
  const tech = skills.technical as unknown as Record<string, number>;
  const vals = Object.values(tech);
  return (vals.reduce((a, b) => a + b, 0) / vals.length) * 5;
}

function generateBirthday(age: number): Date {
  const now = Date.now();
  const yearsAgo = age * 365 * 24 * 60 * 60 * 1000;
  const daysVariation = Math.floor(Math.random() * 365) * 24 * 60 * 60 * 1000;
  return new Date(now - yearsAgo - daysVariation);
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(2));
}

// ============ Schedule Generation ============

async function generateSchedule(ds: DataSource, season: number): Promise<void> {
  const leagueRepo = ds.getRepository(LeagueEntity);
  const teamRepo = ds.getRepository(TeamEntity);
  const matchRepo = ds.getRepository(MatchEntity);

  // Base date for scheduling (Season 1 starts at week 1)
  const seasonStartDate = new Date();
  seasonStartDate.setHours(13, 0, 0, 0); // 1 PM

  const leagues = await leagueRepo.find();
  let totalMatches = 0;

  for (const league of leagues) {
    const teams = await teamRepo.find({ where: { leagueId: league.id } });
    const teamIds = teams.map((t) => t.id);

    if (teamIds.length < 4) continue;

    // Double round-robin
    const numRounds = teamIds.length - 1;

    // First round (home games)
    for (let round = 0; round < numRounds; round++) {
      const matchups = generateRoundMatchups(
        teamIds[0],
        teamIds.slice(1),
        round,
      );
      const matchDate = new Date(seasonStartDate);
      matchDate.setDate(matchDate.getDate() + round * 7); // Each round is 1 week apart

      for (const { home, away } of matchups) {
        await matchRepo.save(
          matchRepo.create({
            leagueId: league.id,
            homeTeamId: home,
            awayTeamId: away,
            season,
            week: round + 1,
            status: MatchStatus.SCHEDULED,
            type: MatchType.LEAGUE,
            scheduledAt: matchDate,
            tacticsLocked: false,
            homeForfeit: false,
            awayForfeit: false,
          }),
        );
        totalMatches++;
      }
    }

    // Second round (away games)
    for (let round = 0; round < numRounds; round++) {
      const matchups = generateRoundMatchups(
        teamIds[0],
        teamIds.slice(1),
        round,
      );
      const matchDate = new Date(seasonStartDate);
      matchDate.setDate(matchDate.getDate() + (numRounds + round) * 7);

      for (const { home, away } of matchups) {
        await matchRepo.save(
          matchRepo.create({
            leagueId: league.id,
            homeTeamId: away,
            awayTeamId: home,
            season,
            week: numRounds + round + 1,
            status: MatchStatus.SCHEDULED,
            type: MatchType.LEAGUE,
            scheduledAt: matchDate,
            tacticsLocked: false,
            homeForfeit: false,
            awayForfeit: false,
          }),
        );
        totalMatches++;
      }
    }
  }

  console.log(
    `[Schedule] Generated ${totalMatches} matches for Season ${season}`,
  );
}

function generateRoundMatchups(
  fixedTeam: string,
  rotatingTeams: string[],
  round: number,
): Array<{ home: string; away: string }> {
  const matchups: Array<{ home: string; away: string }> = [];
  const rotated = [...rotatingTeams];
  const last = rotated.pop()!;
  rotated.unshift(last);

  matchups.push({ home: fixedTeam, away: rotated[0] });
  for (let i = 1; i < rotated.length / 2; i++) {
    matchups.push({
      home: rotated[rotatingTeams.length - i],
      away: rotated[i],
    });
  }

  return matchups;
}

// ============ Match Simulation (Simplified for testing) ============

/**
 * Simplified match simulation - generates realistic random scores for integration testing
 * Uses basic team strength estimation from player overall ratings
 */
async function simulateMatch(
  ds: DataSource,
  match: MatchEntity,
): Promise<void> {
  const matchRepo = ds.getRepository(MatchEntity);
  const eventRepo = ds.getRepository(MatchEventEntity);
  const playerRepo = ds.getRepository(PlayerEntity);

  // Get players for both teams
  const homePlayers = await playerRepo.find({
    where: { teamId: match.homeTeamId },
  });
  const awayPlayers = await playerRepo.find({
    where: { teamId: match.awayTeamId },
  });

  if (homePlayers.length < 11 || awayPlayers.length < 11) {
    console.warn(`[Sim] Team has insufficient players for match ${match.id}`);
    return;
  }

  // Calculate team strength from player overall
  const calcTeamOvr = (players: PlayerEntity[]) => {
    if (players.length === 0) return 60;
    const techVals = players.slice(0, 11).map((p) => {
      const t = p.currentSkills.technical as unknown as Record<string, number>;
      return (
        Object.values(t).reduce((a, b) => a + b, 0) / Object.values(t).length
      );
    });
    return Math.round(techVals.reduce((a, b) => a + b, 0) / techVals.length);
  };

  const homeOvr = calcTeamOvr(homePlayers);
  const awayOvr = calcTeamOvr(awayPlayers);

  // Generate realistic score based on team strength
  const homeGoals = Math.max(
    0,
    Math.round((homeOvr - 50 + Math.random() * 20 - awayOvr + 50) / 10),
  );
  const awayGoals = Math.max(
    0,
    Math.round((awayOvr - 50 + Math.random() * 20 - homeOvr + 50) / 10),
  );

  // Generate match events (goals)
  const events: ReturnType<typeof eventRepo.create>[] = [];
  for (let i = 0; i < homeGoals; i++) {
    const scorer = homePlayers[randomInt(0, homePlayers.length - 1)];
    const minute = randomInt(1, 90);
    events.push(
      eventRepo.create({
        matchId: match.id,
        minute,
        type: MatchEventType.GOAL,
        typeName: 'Goal',
        teamId: match.homeTeamId,
        playerId: scorer?.id,
        eventScheduledTime: new Date(Date.now() + minute * 60 * 1000),
        phase: minute <= 45 ? MatchPhase.FIRST_HALF : MatchPhase.SECOND_HALF,
      }),
    );
  }
  for (let i = 0; i < awayGoals; i++) {
    const scorer = awayPlayers[randomInt(0, awayPlayers.length - 1)];
    const minute = randomInt(1, 90);
    events.push(
      eventRepo.create({
        matchId: match.id,
        minute,
        type: MatchEventType.GOAL,
        typeName: 'Goal',
        teamId: match.awayTeamId,
        playerId: scorer?.id,
        eventScheduledTime: new Date(Date.now() + minute * 60 * 1000),
        phase: minute <= 45 ? MatchPhase.FIRST_HALF : MatchPhase.SECOND_HALF,
      }),
    );
  }

  // Update match
  match.status = MatchStatus.IN_PROGRESS;
  match.homeScore = homeGoals;
  match.awayScore = awayGoals;
  match.startedAt = new Date();
  match.completedAt = new Date(Date.now() + 90 * 60 * 1000);
  match.actualEndTime = match.completedAt;
  await matchRepo.save(match);

  // Save events
  await eventRepo.save(events);

  // Update standings
  await updateStandings(ds, match);

  console.log(
    `  [Match] ${match.homeTeam?.name || 'Home'} ${homeGoals} - ${awayGoals} ${match.awayTeam?.name || 'Away'}`,
  );
}

function selectRandomPlayers(
  players: PlayerEntity[],
  count: number,
): PlayerEntity[] {
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

async function updateStandings(
  ds: DataSource,
  match: MatchEntity,
): Promise<void> {
  const standingRepo = ds.getRepository(LeagueStandingEntity);

  const homeStanding = await standingRepo.findOne({
    where: {
      teamId: match.homeTeamId,
      leagueId: match.leagueId,
      season: match.season,
    },
  });
  const awayStanding = await standingRepo.findOne({
    where: {
      teamId: match.awayTeamId,
      leagueId: match.leagueId,
      season: match.season,
    },
  });

  if (homeStanding && awayStanding) {
    homeStanding.played += 1;
    awayStanding.played += 1;
    homeStanding.goalsFor += match.homeScore || 0;
    homeStanding.goalsAgainst += match.awayScore || 0;
    awayStanding.goalsFor += match.awayScore || 0;
    awayStanding.goalsAgainst += match.homeScore || 0;
    homeStanding.goalDifference =
      homeStanding.goalsFor - homeStanding.goalsAgainst;
    awayStanding.goalDifference =
      awayStanding.goalsFor - awayStanding.goalsAgainst;

    if ((match.homeScore || 0) > (match.awayScore || 0)) {
      homeStanding.wins += 1;
      homeStanding.points += 3;
      awayStanding.losses += 1;
    } else if ((match.homeScore || 0) < (match.awayScore || 0)) {
      awayStanding.wins += 1;
      awayStanding.points += 3;
      homeStanding.losses += 1;
    } else {
      homeStanding.draws += 1;
      awayStanding.draws += 1;
      homeStanding.points += 1;
      awayStanding.points += 1;
    }

    homeStanding.recentForm = (homeStanding.recentForm + 'W').slice(-5);
    awayStanding.recentForm = (
      awayStanding.recentForm +
      (match.homeScore! > match.awayScore!
        ? 'L'
        : match.homeScore! < match.awayScore!
          ? 'W'
          : 'D')
    ).slice(-5);

    await standingRepo.save([homeStanding, awayStanding]);
  }
}

// ============ Weekly Training Settlement ============

async function processWeeklyTraining(ds: DataSource): Promise<void> {
  const teamRepo = ds.getRepository(TeamEntity);
  const playerRepo = ds.getRepository(PlayerEntity);
  const staffRepo = ds.getRepository(StaffEntity);

  const teams = await teamRepo.find();
  let totalTrained = 0;

  for (const team of teams) {
    const players = await playerRepo.find({ where: { teamId: team.id } });
    const staffList = await staffRepo.find({
      where: { teamId: team.id, isActive: true },
    });

    // Select 3-6 players randomly for training (max 6 regular slots)
    const traineeCount = randomInt(3, 6);
    const trainees = selectRandomPlayers(
      players.filter((p) => !p.isYouth),
      traineeCount,
    );

    for (const player of trainees) {
      const age = player.birthday
        ? Math.floor(
            (Date.now() - new Date(player.birthday).getTime()) /
              GAME_SETTINGS.MS_PER_YEAR,
          )
        : 25;

      // Random training category
      const categories = Object.values(TrainingCategory);
      const category = categories[randomInt(0, categories.length - 1)];

      // Calculate training points (simplified)
      const basePoints = 20; // BASE_WEEKLY_TRAINING
      const slotMultiplier = 1.0; // REGULAR
      const ageFactor =
        age <= 17 ? 1.0 : Math.max(0.65, 1.0 - (age - 17) * 0.02);

      const points =
        Math.round(basePoints * slotMultiplier * ageFactor * 100) / 100;

      // Distribute points to skills
      const result = distributeTrainingPoints(
        player.currentSkills,
        player.potentialSkills,
        points,
        player.isGoalkeeper,
        null,
      );

      // Update stamina (simplified fatigue)
      player.stamina = Math.min(5.0, player.stamina + randomFloat(0.1, 0.3));

      // Update experience
      player.experience += randomFloat(0.1, 0.5);

      await playerRepo.save(player);

      if (result.gains.length > 0) {
        totalTrained++;
      }
    }
  }

  console.log(`[Training] Trained ${totalTrained} player slot updates`);
}

// ============ User Creation ============

async function createTestUser(ds: DataSource): Promise<void> {
  const userRepo = ds.getRepository(UserEntity);
  const teamRepo = ds.getRepository(TeamEntity);

  const existing = await userRepo.findOne({
    where: { email: 'test@goalxi.com' },
  });

  if (existing) {
    console.log('[User] Test user already exists');
    return;
  }

  // Find first team to link to user
  const team = await teamRepo.findOne({ where: {} });
  if (!team) {
    console.log('[User] No team available to link to user');
    return;
  }

  const user = userRepo.create({
    username: 'testuser',
    email: 'test@goalxi.com',
    password: 'password123', // UserEntity @BeforeInsert hook will hash it
    nickname: 'Test User',
  });
  await userRepo.save(user);

  // Link team to user
  team.userId = user.id;
  await teamRepo.save(team);

  console.log(
    `[User] Created test user: test@goalxi.com / password123 (linked to team: ${team.name})`,
  );
}

// ============ Main ============

async function main() {
  const args = parseCliArgs();

  console.log('='.repeat(60));
  console.log('Season Test CLI - Full System Integration Test');
  console.log('='.repeat(60));
  console.log(
    `Tiers: ${args.tiers}, Weeks: ${args.weeks}, Fresh: ${args.fresh}`,
  );

  const ds = await createDataSource();
  console.log('[DB] Connected');

  if (args.fresh) {
    console.log('[DB] Dropping all tables...');
    await ds.dropDatabase();
    await ds.synchronize();
    console.log('[DB] Tables recreated');
  }

  // Check if data exists
  const leagueRepo = ds.getRepository(LeagueEntity);
  const existingLeagues = await leagueRepo.count();

  if (existingLeagues === 0) {
    // Generate leagues, teams, schedule
    await generateLeagues(ds, args.tiers);
    await generateTeams(ds);
    await generateSchedule(ds, 1);
    await createTestUser(ds);
  } else {
    console.log('[Data] Using existing data');
  }

  // Run simulation weeks
  const matchRepo = ds.getRepository(MatchEntity);
  const standingRepo = ds.getRepository(LeagueStandingEntity);

  let currentSeason = 1;

  for (let week = 1; week <= args.weeks; week++) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Week ${week} (Season ${currentSeason})`);
    console.log('='.repeat(60));

    // Get matches for this week
    const matches = await matchRepo.find({
      where: { week, season: currentSeason },
      relations: ['homeTeam', 'awayTeam'],
    });

    console.log(`[Week ${week}] Found ${matches.length} matches`);

    // Simulate each match
    for (const match of matches) {
      if (
        match.status === MatchStatus.SCHEDULED ||
        match.status === MatchStatus.TACTICS_LOCKED
      ) {
        await simulateMatch(ds, match);
      }
    }

    // Weekly training settlement
    await processWeeklyTraining(ds);

    // Update standings positions
    await recalculateStandings(ds, currentSeason);

    // Weekly summary
    await printWeekSummary(ds, week, currentSeason);

    // Week 15: generate playoff matches for promotion/relegation
    if (week === 15) {
      console.log(`\n[Week ${week}] Generating playoff matches...`);
      // For simplicity, process promotions directly
      await processPromotions(ds, currentSeason);
    }

    // Week 16: end of season
    if (week === 16) {
      console.log(`\n[Season ${currentSeason}] Season complete!`);
      currentSeason++;
      // Generate new season schedule
      await generateSchedule(ds, currentSeason);
      console.log(`[Season ${currentSeason}] New season schedule generated`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('Simulation Complete!');
  console.log('='.repeat(60));

  await ds.destroy();
  process.exit(0);
}

async function recalculateStandings(
  ds: DataSource,
  season: number,
): Promise<void> {
  const standingRepo = ds.getRepository(LeagueStandingEntity);
  const leagueRepo = ds.getRepository(LeagueEntity);

  const leagues = await leagueRepo.find();

  for (const league of leagues) {
    const standings = await standingRepo.find({
      where: { leagueId: league.id, season },
      order: { points: 'DESC', goalDifference: 'DESC', goalsFor: 'DESC' },
    });

    for (let i = 0; i < standings.length; i++) {
      standings[i].position = i + 1;
    }
    await standingRepo.save(standings);
  }
}

async function printWeekSummary(
  ds: DataSource,
  week: number,
  season: number,
): Promise<void> {
  const standingRepo = ds.getRepository(LeagueStandingEntity);
  const leagueRepo = ds.getRepository(LeagueEntity);

  const leagues = await leagueRepo.find();

  for (const league of leagues) {
    const standings = await standingRepo.find({
      where: { leagueId: league.id, season },
      order: { position: 'ASC' },
      take: 5,
    });

    if (standings.length === 0) continue;

    const top = standings
      .map((s) => `${s.position}. ${s.teamId?.slice(0, 8)}... Pts:${s.points}`)
      .join(' | ');

    console.log(`  ${league.name}: ${top}`);
  }
}

async function processPromotions(
  ds: DataSource,
  season: number,
): Promise<void> {
  const leagueRepo = ds.getRepository(LeagueEntity);
  const standingRepo = ds.getRepository(LeagueStandingEntity);
  const teamRepo = ds.getRepository(TeamEntity);

  const leagues = await leagueRepo.find({ order: { tier: 'ASC' } });

  for (const league of leagues) {
    const standings = await standingRepo.find({
      where: { leagueId: league.id, season },
      order: { position: 'ASC' },
    });

    if (standings.length === 0) continue;

    // Promote top team
    if (standings[0] && league.tier > 1) {
      const upperLeague = await leagueRepo.findOne({
        where: { tier: league.tier - 1, tierDivision: league.tierDivision },
      });
      if (upperLeague) {
        const team = await teamRepo.findOne({
          where: { id: standings[0].teamId as any },
        });
        if (team) {
          team.leagueId = upperLeague.id;
          await teamRepo.save(team);
          console.log(`  [Promo] ${team.name} promoted to ${upperLeague.name}`);
        }
      }
    }

    // Relegate bottom team
    if (standings[standings.length - 1] && league.tier < 4) {
      const lowerLeague = await leagueRepo.findOne({
        where: { tier: league.tier + 1, tierDivision: league.tierDivision },
      });
      if (lowerLeague) {
        const team = await teamRepo.findOne({
          where: { id: standings[standings.length - 1].teamId as any },
        });
        if (team) {
          team.leagueId = lowerLeague.id;
          await teamRepo.save(team);
          console.log(
            `  [Releg] ${team.name} relegated to ${lowerLeague.name}`,
          );
        }
      }
    }
  }
}

main().catch((err) => {
  console.error('[Error]', err);
  process.exit(1);
});
