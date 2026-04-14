import {
  FanEntity,
  FinanceEntity,
  GAME_SETTINGS,
  LeagueEntity,
  LeagueStandingEntity,
  MatchEntity,
  MatchStatus,
  PlayerEntity,
  PlayerSkills,
  PotentialTier,
  StadiumEntity,
  TeamEntity,
  TrainingSlot,
  UserEntity,
  Uuid,
} from '@goalxi/database';
import { calculatePlayerWage } from '@goalxi/database/src/constants/finance.constants';
import 'reflect-metadata';
import { v4 as uuidv4 } from 'uuid';
import { getRandomNameByNationality } from '../src/constants/name-database';
import { AppDataSource } from '../src/database/data-source';

/**
 * Seed Main - Creates a minimal pyramid structure for production:
 * - L1: 1 league (16 BOT teams)
 * - L2: 4 leagues (16 BOT teams each), linked to L1
 *
 * This is a simplified version for demonstration.
 * Full pyramid: L1=1, L2=4, L3=16, L4=32+ leagues
 */

const LEAGUE_CONFIG = {
  L1: { count: 1, teamsPerLeague: 16 },
  L2: { count: 4, teamsPerLeague: 16 },
};

const TEAM_ROSTER_SIZE = 16;
const GK_COUNT = 2;

// Helper Functions
function randomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number, decimals: number = 1): number {
  const value = Math.random() * (max - min) + min;
  return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
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
  const rand = Math.random() * 100;
  if (rand < 0.5)
    return { tier: PotentialTier.LEGEND, ability: randomInt(91, 99) };
  if (rand < 5.0)
    return { tier: PotentialTier.ELITE, ability: randomInt(81, 90) };
  if (rand < 20.0)
    return { tier: PotentialTier.HIGH_PRO, ability: randomInt(71, 80) };
  if (rand < 55.0)
    return { tier: PotentialTier.REGULAR, ability: randomInt(56, 70) };
  return { tier: PotentialTier.LOW, ability: randomInt(40, 55) };
}

function generatePlayerAttributes(
  isGK: boolean,
  potentialAbility: number,
  age: number,
): { current: PlayerSkills; potential: PlayerSkills } {
  const targetPotentialAvg = potentialAbility / 5;

  const outfieldKeys = {
    physical: ['pace', 'strength'],
    technical: ['finishing', 'passing', 'dribbling', 'defending'],
    mental: ['positioning', 'composure'],
    setPieces: ['freeKicks', 'penalties'],
  };

  const gkKeysActual = {
    physical: ['pace', 'strength'],
    technical: ['reflexes', 'handling', 'aerial'],
    mental: ['positioning', 'composure'],
    setPieces: ['freeKicks', 'penalties'],
  };

  const keys = isGK ? gkKeysActual : outfieldKeys;
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

  Object.entries(keys).forEach(([category, attrs]) => {
    attrs.forEach((attr) => {
      let val = targetPotentialAvg + (Math.random() * 6 - 3);
      val = Math.max(1, Math.min(20, val));
      potential[category][attr] = parseFloat(val.toFixed(2));
    });
  });

  Object.entries(keys).forEach(([category, attrs]) => {
    attrs.forEach((attr) => {
      let ca: number;
      if (age <= 17) {
        ca = Math.max(1, potential[category][attr] * 0.4);
      } else {
        const ratio = Math.min(1, 0.5 + (age - 18) * 0.05);
        ca = potential[category][attr] * ratio;
      }
      ca += Math.random() * 2 - 1;
      ca = Math.max(1, Math.min(potential[category][attr], ca));
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
  const prefixes = ['FC', 'SC', 'AC', 'United', 'City', 'Rovers', 'Athletic'];
  const cities = [
    'North',
    'South',
    'East',
    'West',
    'Central',
    'New',
    'Royal',
    'Grand',
  ];
  const names = [
    'Wolves',
    'Eagles',
    'Lions',
    'Tigers',
    'Bears',
    'Sharks',
    'Phoenix',
    'Dragons',
    'Warriors',
    'Knights',
  ];
  const suffix = tier === 1 ? '' : ` Div ${division}`;
  return `${randomElement(names)} ${randomElement(prefixes)}${suffix}`;
}

function getLeagueOvrRange(tier: number): { min: number; max: number } {
  switch (tier) {
    case 1:
      return { min: 55, max: 75 };
    case 2:
      return { min: 45, max: 65 };
    case 3:
      return { min: 35, max: 55 };
    case 4:
      return { min: 30, max: 50 };
    default:
      return { min: 40, max: 60 };
  }
}

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

  // 1. Create Admin User
  console.log('👤 Creating Admin User...');
  const adminEmail = 'admin@goalxi.com';
  let adminUser = await userRepo.findOneBy({ email: adminEmail });

  if (!adminUser) {
    adminUser = new UserEntity({
      username: 'admin',
      email: adminEmail,
      password: 'Test123456!', // Let @BeforeInsert hook handle hashing
      nickname: 'Admin Manager',
      bio: 'System Administrator',
      supporterLevel: 99,
    });
    await userRepo.save(adminUser);
    console.log(`   ✓ Admin: ${adminEmail} / Test123456!`);
  } else {
    console.log(`   ⊙ Admin already exists`);
  }

  // 2. Create Bot Manager User (all bot teams belong to this user)
  console.log('🤖 Creating Bot Manager User...');
  const botEmail = 'bot@goalxi.com';
  let botUser = await userRepo.findOneBy({ email: botEmail });
  if (!botUser) {
    botUser = new UserEntity({
      username: 'bot_manager',
      email: botEmail,
      password: 'Bot123456!', // Let @BeforeInsert hook handle hashing
      nickname: 'Bot Manager',
      bio: 'System Bot Manager',
      supporterLevel: 0,
    });
    await userRepo.save(botUser);
    console.log(`   ✓ Bot Manager: ${botEmail}`);
  } else {
    console.log(`   ⊙ Bot Manager already exists`);
  }

  // 2b. Create Test Users for II1 League
  console.log('👤 Creating Test Users for II1...');
  const testUsers: UserEntity[] = [];
  const testUserConfigs = [
    {
      username: 'testuser1',
      email: 'testuser1@goalxi.com',
      nickname: 'Test User 1',
    },
    {
      username: 'testuser2',
      email: 'testuser2@goalxi.com',
      nickname: 'Test User 2',
    },
  ];
  for (const config of testUserConfigs) {
    let user = await userRepo.findOneBy({ email: config.email });
    if (!user) {
      user = new UserEntity({
        username: config.username,
        email: config.email,
        password: '123123', // Let @BeforeUpdate hook handle hashing
        nickname: config.nickname,
        bio: 'Test user',
        supporterLevel: 1,
      });
      await userRepo.save(user);
      console.log(`   ✓ Created: ${config.email} / 123123`);
    } else {
      // Update password to ensure it's correct (don't hash - let the hook do it)
      user.password = '123123';
      await userRepo.save(user);
      console.log(`   ✓ Updated password: ${config.email} / 123123`);
    }
    testUsers.push(user!);
  }

  // 3. Create League Pyramid
  const leagues: LeagueEntity[] = [];
  const leagueIds: Record<string, string> = {};

  // L1: 1 league
  const l1Id = uuidv4();
  leagueIds['L1'] = l1Id;
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
    console.log(`   ✓ Created L1: Elite League`);
  } else {
    console.log(`   ⊙ L1 already exists`);
  }
  leagues.push(l1League);

  // L2: 4 leagues (each linked to L1)
  for (let d = 1; d <= 4; d++) {
    const l2Id = uuidv4();
    leagueIds[`L2_${d}`] = l2Id;
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
      console.log(`   ✓ Created L2 Div ${d}`);
    } else {
      console.log(`   ⊙ L2 Div ${d} already exists`);
    }
    leagues.push(l2League);
  }

  // 3. Create Teams for each league
  console.log('\n⚽ Creating Teams...');
  const ovrRange = getLeagueOvrRange(1);
  const teamBaseOvr = randomInt(ovrRange.min, ovrRange.max);

  for (const league of leagues) {
    const existingStandings = await standingRepo.count({
      where: { leagueId: league.id, season: 1 },
    });

    const tierOvrRange = getLeagueOvrRange(league.tier);
    const tierBaseOvr = randomInt(tierOvrRange.min, tierOvrRange.max);

    // For L2 Div 1: create test user teams first (reserve 2 slots)
    const isL2Div1 = league.tier === 2 && league.tierDivision === 1;
    const testTeamUsers = isL2Div1 ? testUsers : [];
    const testTeamCount = testTeamUsers.length;

    // Check if test teams already exist for L2 Div 1
    if (isL2Div1) {
      for (let ti = 0; ti < testTeamCount; ti++) {
        const existingTeam = await teamRepo.findOneBy({
          userId: testTeamUsers[ti].id,
        });
        if (existingTeam) {
          console.log(
            `   ⊙ Test team already exists for ${testTeamUsers[ti].nickname}`,
          );
        } else {
          const teamId = uuidv4();
          const teamName = ti === 0 ? 'Test City FC' : 'Test United';
          const team = new TeamEntity({
            id: teamId as any,
            userId: testTeamUsers[ti].id,
            name: teamName,
            leagueId: league.id,
            isBot: false,
            logoUrl: '',
            jerseyColorPrimary: ti === 0 ? '#00E479' : '#FFDB9D',
            jerseyColorSecondary: '#FFFFFF',
          });
          await teamRepo.save(team);

          await financeRepo.save(
            new FinanceEntity({
              teamId: team.id,
              balance: 50000000,
            }),
          );

          await stadiumRepo.save(
            new StadiumEntity({
              teamId: team.id,
              capacity: 50000,
              isBuilt: true,
            }),
          );

          await fanRepo.save(
            new FanEntity({
              teamId: team.id,
              totalFans: 100000,
              fanEmotion: 70,
              recentForm: '',
            }),
          );

          const standing = standingRepo.create({
            teamId: team.id,
            leagueId: league.id,
            season: 1,
            position: ti + 1,
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

          // Create players for test team
          const playersToCreate = [];
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
            const { firstName, lastName } =
              getRandomNameByNationality(nationality);
            const name = `${firstName} ${lastName}`;
            const age = randomInt(20, 28);
            const playerOvr = tierBaseOvr + randomInt(0, 5);
            const ability = Math.round((playerOvr / 5) * 10) / 10;

            const { tier: potentialTier, ability: potentialAbility } =
              generatePlayerPotential();
            const { current, potential } = generatePlayerAttributes(
              isGK,
              potentialAbility,
              age,
            );

            // Calculate wage based on skills
            const tech = current.technical as unknown as Record<string, number>;
            const phys = current.physical as unknown as Record<string, number>;
            const ment = current.mental as unknown as Record<string, number>;
            let skillValues: number[];
            let skillKeys: string[];
            if (isGK) {
              skillValues = [
                tech.reflexes,
                tech.handling,
                tech.aerial,
                ment.positioning,
              ];
              skillKeys = [
                'gk_reflexes',
                'gk_handling',
                'gk_aerial',
                'gk_positioning',
              ];
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

            playersToCreate.push(
              new PlayerEntity({
                name,
                teamId: team.id,
                isGoalkeeper: isGK,
                birthday: new Date(
                  Date.now() -
                    age * GAME_SETTINGS.MS_PER_YEAR -
                    randomInt(0, 365) * 24 * 60 * 60 * 1000,
                ),
                isYouth: false,
                potentialAbility: Math.round(potentialAbility),
                potentialTier,
                trainingSlot: TrainingSlot.REGULAR,
                appearance: generatePlayerAppearance(),
                currentSkills: current,
                potentialSkills: potential,
                experience: randomFloat(5, 15),
                form: randomFloat(3, 5),
                stamina: randomFloat(4, 5),
                onTransfer: false,
                currentWage,
              }),
            );
          }
          await playerRepo.save(playersToCreate);
          console.log(
            `   ✓ Created test team: ${teamName} (${testTeamUsers[ti].nickname})`,
          );
        }
      }
    }

    if (existingStandings >= league.maxTeams) {
      console.log(
        `   ⊙ ${league.name}: already has ${existingStandings} teams`,
      );
      continue;
    }

    const teamsToCreate = league.maxTeams - existingStandings;
    const botTeamsToCreate = isL2Div1
      ? Math.max(0, teamsToCreate - testTeamCount)
      : teamsToCreate;
    const botStartIndex = isL2Div1 ? testTeamCount : 0;

    // Bot teams fill remaining slots
    for (let i = 0; i < botTeamsToCreate; i++) {
      const teamId = uuidv4();
      const teamName = generateTeamName(league.tier, league.tierDivision, i);
      const nationality = randomElement([
        'CN',
        'GB',
        'ES',
        'BR',
        'IT',
        'DE',
        'FR',
      ]);

      const team = new TeamEntity({
        id: teamId as any,
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

      // Create finance
      await financeRepo.save(
        new FinanceEntity({
          teamId: team.id,
          balance: randomInt(1000000, 10000000),
        }),
      );

      // Create default stadium (10000 capacity for bot teams)
      await stadiumRepo.save(
        new StadiumEntity({
          teamId: team.id,
          capacity: 10000,
          isBuilt: true,
        }),
      );

      // Create default fan record
      await fanRepo.save(
        new FanEntity({
          teamId: team.id,
          totalFans: 10000,
          fanEmotion: 50,
          recentForm: '',
        }),
      );

      // Create standing
      const standing = standingRepo.create({
        teamId: team.id,
        leagueId: league.id,
        season: 1,
        position: existingStandings + botStartIndex + i + 1,
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

      // Create players for this team
      const playersToCreate = [];
      for (let p = 0; p < TEAM_ROSTER_SIZE; p++) {
        const isGK = p < GK_COUNT;
        const { firstName, lastName } = getRandomNameByNationality(nationality);
        const name = `${firstName} ${lastName}`;
        const age = randomInt(17, 35);

        // Each player's OVR is within ±2 of team base
        const playerOvr = tierBaseOvr + randomInt(-2, 2);
        const ability = Math.round((playerOvr / 5) * 10) / 10; // Convert to 0-20 scale

        const { tier: potentialTier, ability: potentialAbility } =
          generatePlayerPotential();
        const { current, potential } = generatePlayerAttributes(
          isGK,
          potentialAbility,
          age,
        );

        playersToCreate.push(
          new PlayerEntity({
            name,
            teamId: team.id,
            isGoalkeeper: isGK,
            birthday: new Date(
              Date.now() -
                age * GAME_SETTINGS.MS_PER_YEAR -
                randomInt(0, 365) * 24 * 60 * 60 * 1000,
            ),
            isYouth: age <= 17,
            potentialAbility: Math.round(potentialAbility),
            potentialTier,
            trainingSlot: TrainingSlot.REGULAR,
            appearance: generatePlayerAppearance(),
            currentSkills: current,
            potentialSkills: potential,
            experience: randomFloat(0, 10),
            form: randomFloat(3, 5),
            stamina: randomFloat(3, 5),
            onTransfer: false,
          }),
        );
      }
      await playerRepo.save(playersToCreate);
    }

    console.log(
      `   ✓ ${league.name}: created ${teamsToCreate} BOT teams with ${TEAM_ROSTER_SIZE} players each`,
    );
  }

  // 4b. Generate matches and simulate results for each league
  console.log('\n⚽ Generating matches and simulating results...');

  const matchRepo = AppDataSource.getRepository(MatchEntity);

  for (const league of leagues) {
    // Get all teams in this league
    const teamsInLeague = await teamRepo.find({
      where: { leagueId: league.id },
      order: { createdAt: 'ASC' },
    });

    if (teamsInLeague.length < 2) continue;

    // Check if matches already exist
    const existingMatches = await matchRepo.count({
      where: { leagueId: league.id, season: 1 },
    });

    if (existingMatches > 0) {
      console.log(
        `   ⊙ ${league.name}: ${existingMatches} matches already exist`,
      );
      continue;
    }

    // Generate round-robin: each team plays every other team once
    // For simplicity, we generate 5 "weeks" of matches (not full round-robin)
    const matchesToCreate: MatchEntity[] = [];
    const MATCHES_PER_WEEK = Math.floor(teamsInLeague.length / 2);
    const TOTAL_WEEKS = 5;
    const season = 1;

    for (let week = 1; week <= TOTAL_WEEKS; week++) {
      // Simple pairing: team[i] vs team[last-i]
      for (let i = 0; i < MATCHES_PER_WEEK; i++) {
        const homeTeam = teamsInLeague[(week + i) % teamsInLeague.length];
        const awayTeam =
          teamsInLeague[
            (week + teamsInLeague.length - i) % teamsInLeague.length
          ];

        if (!homeTeam || !awayTeam) continue;
        if (homeTeam.id === awayTeam.id) continue;

        // Random scores: 0-4 goals each
        const homeScore = randomInt(0, 4);
        const awayScore = randomInt(0, 4);

        // Determine winner/draw for standings update
        let homePoints = 1,
          awayPoints = 1;
        let homeWins = 0,
          homeDraws = 0,
          homeLosses = 0;
        let awayWins = 0,
          awayDraws = 0,
          awayLosses = 0;

        if (homeScore > awayScore) {
          homePoints = 3;
          homeWins = 1;
          homeDraws = 0;
          homeLosses = 0;
          awayPoints = 0;
          awayWins = 0;
          awayDraws = 0;
          awayLosses = 1;
        } else if (homeScore < awayScore) {
          homePoints = 0;
          homeWins = 0;
          homeDraws = 0;
          homeLosses = 1;
          awayPoints = 3;
          awayWins = 1;
          awayDraws = 0;
          awayLosses = 0;
        } else {
          homePoints = 1;
          homeWins = 0;
          homeDraws = 1;
          homeLosses = 0;
          awayPoints = 1;
          awayWins = 0;
          awayDraws = 1;
          awayLosses = 0;
        }

        // Update standings directly
        const homeStanding = await standingRepo.findOne({
          where: { leagueId: league.id, teamId: homeTeam.id, season },
        });
        const awayStanding = await standingRepo.findOne({
          where: { leagueId: league.id, teamId: awayTeam.id, season },
        });

        if (homeStanding && awayStanding) {
          homeStanding.played += 1;
          homeStanding.wins += homeWins;
          homeStanding.draws += homeDraws;
          homeStanding.losses += homeLosses;
          homeStanding.goalsFor += homeScore;
          homeStanding.goalsAgainst += awayScore;
          homeStanding.goalDifference =
            homeStanding.goalsFor - homeStanding.goalsAgainst;
          homeStanding.points += homePoints;

          awayStanding.played += 1;
          awayStanding.wins += awayWins;
          awayStanding.draws += awayDraws;
          awayStanding.losses += awayLosses;
          awayStanding.goalsFor += awayScore;
          awayStanding.goalsAgainst += homeScore;
          awayStanding.goalDifference =
            awayStanding.goalsFor - awayStanding.goalsAgainst;
          awayStanding.points += awayPoints;

          await standingRepo.save([homeStanding, awayStanding]);
        }

        // Create match record
        const match = new MatchEntity({
          id: uuidv4() as any,
          leagueId: league.id,
          season,
          week,
          homeTeamId: homeTeam.id,
          awayTeamId: awayTeam.id,
          homeScore,
          awayScore,
          status: MatchStatus.COMPLETED,
          type: 'league' as any,
          scheduledAt: new Date(
            Date.now() - (TOTAL_WEEKS - week) * 7 * 24 * 60 * 60 * 1000,
          ),
          homeForfeit: false,
          awayForfeit: false,
          tacticsLocked: true,
          hasExtraTime: false,
          requiresWinner: false,
          hasPenaltyShootout: false,
          startedAt: new Date(
            Date.now() - (TOTAL_WEEKS - week) * 7 * 24 * 60 * 60 * 1000,
          ),
          completedAt: new Date(
            Date.now() -
              (TOTAL_WEEKS - week) * 7 * 24 * 60 * 60 * 1000 +
              2 * 60 * 60 * 1000,
          ),
        });
        matchesToCreate.push(match);
      }
    }

    await matchRepo.save(matchesToCreate);
    console.log(
      `   ✓ ${league.name}: created ${matchesToCreate.length} matches (${TOTAL_WEEKS} weeks)`,
    );
  }

  // 4. Summary
  console.log('\n' + '='.repeat(60));
  console.log('✅ Pyramid seed complete!');
  console.log('='.repeat(60));
  console.log(`   L1: 1 league (Elite League)`);
  console.log(`   L2: 4 leagues (Professional League Div 1-4)`);
  console.log(`   Each league: 16 BOT teams`);
  console.log(`   Each team: ${TEAM_ROSTER_SIZE} players`);
  console.log(`   Hierarchy: L2 → L1 (via parentLeagueId)`);
  console.log('='.repeat(60));

  await AppDataSource.destroy();
}

createLeaguePyramid().catch((e) => {
  console.error('❌ Seed failed:', e);
  process.exit(1);
});
