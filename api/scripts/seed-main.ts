
import 'reflect-metadata';
import { AppDataSource } from '../src/database/data-source';
import { v4 as uuidv4 } from 'uuid';
import {
    UserEntity,
    TeamEntity,
    LeagueEntity,
    PlayerEntity,
    FinanceEntity,
    MatchEntity,
    MatchStatus,
    MatchType,
    PotentialTier,
    TrainingSlot,
    PlayerSkills,
    LeagueStandingEntity,
    GAME_SETTINGS,
    Uuid,
    StadiumEntity,
    FanEntity,
} from '@goalxi/database';
import * as argon2 from 'argon2';
import { getRandomNameByNationality } from '../src/constants/name-database';

/**
 * Seed Main - Creates a minimal pyramid structure for production:
 * - L1: 1 league (16 BOT teams)
 * - L2: 4 leagues (16 BOT teams each), linked to L1
 * - L3: 16 leagues (16 BOT teams each), linked to L2
 *
 * This is a simplified version for demonstration.
 * Full pyramid: L1=1, L2=4, L3=16, L4=32+ leagues
 */

const LEAGUE_CONFIG = {
    L1: { count: 1, teamsPerLeague: 16 },
    L2: { count: 4, teamsPerLeague: 16 },
    L3: { count: 16, teamsPerLeague: 16 },
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
    if (rand < 0.5) return { tier: PotentialTier.LEGEND, ability: randomInt(91, 99) };
    if (rand < 5.0) return { tier: PotentialTier.ELITE, ability: randomInt(81, 90) };
    if (rand < 20.0) return { tier: PotentialTier.HIGH_PRO, ability: randomInt(71, 80) };
    if (rand < 55.0) return { tier: PotentialTier.REGULAR, ability: randomInt(56, 70) };
    return { tier: PotentialTier.LOW, ability: randomInt(40, 55) };
}

function generatePlayerAttributes(isGK: boolean, potentialAbility: number, age: number): { current: PlayerSkills; potential: PlayerSkills } {
    const targetPotentialAvg = potentialAbility / 5;

    const outfieldKeys = {
        physical: ['pace', 'strength'],
        technical: ['finishing', 'passing', 'dribbling', 'defending'],
        mental: ['positioning', 'composure'],
        setPieces: ['freeKicks', 'penalties'],
    };

    const gkKeysActual = {
        physical: ['pace', 'strength'],
        technical: ['reflexes', 'handling', 'distribution'],
        mental: ['positioning', 'composure'],
        setPieces: ['freeKicks', 'penalties'],
    };

    const keys = isGK ? gkKeysActual : outfieldKeys;
    const potential: Record<string, any> = { physical: {}, technical: {}, mental: {}, setPieces: {} };
    const current: Record<string, any> = { physical: {}, technical: {}, mental: {}, setPieces: {} };

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

    return { current: current as PlayerSkills, potential: potential as PlayerSkills };
}

function generateTeamName(tier: number, division: number, index: number): string {
    const prefixes = ['FC', 'SC', 'AC', 'United', 'City', 'Rovers', 'Athletic'];
    const cities = ['North', 'South', 'East', 'West', 'Central', 'New', 'Royal', 'Grand'];
    const names = ['Wolves', 'Eagles', 'Lions', 'Tigers', 'Bears', 'Sharks', 'Phoenix', 'Dragons', 'Warriors', 'Knights'];
    const suffix = tier === 1 ? '' : ` Div ${division}`;
    return `${randomElement(names)} ${randomElement(prefixes)}${suffix}`;
}

function getLeagueOvrRange(tier: number): { min: number; max: number } {
    switch (tier) {
        case 1: return { min: 55, max: 75 };
        case 2: return { min: 45, max: 65 };
        case 3: return { min: 35, max: 55 };
        case 4: return { min: 30, max: 50 };
        default: return { min: 40, max: 60 };
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
        const hashedPassword = await argon2.hash('Test123456!');
        adminUser = new UserEntity({
            username: 'admin',
            email: adminEmail,
            password: hashedPassword,
            nickname: 'Admin Manager',
            bio: 'System Administrator',
            supporterLevel: 99,
        });
        await userRepo.save(adminUser);
        console.log(`   ✓ Admin: ${adminEmail} / Test123456!`);
    } else {
        console.log(`   ⊙ Admin already exists`);
    }

    // 2. Create League Pyramid
    console.log('\n🏆 Creating League Pyramid...');
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
    const l2Leagues: LeagueEntity[] = [];
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
        l2Leagues.push(l2League);
        leagues.push(l2League);
    }

    // L3: 16 leagues (each linked to corresponding L2)
    for (let d = 1; d <= 16; d++) {
        const l3Id = uuidv4();
        leagueIds[`L3_${d}`] = l3Id;
        // L3 div 1-4 belong to L2 div 1, L3 div 5-8 to L2 div 2, etc.
        const l2Division = Math.ceil(d / 4);
        let l3League = await leagueRepo.findOneBy({ id: l3Id as any });
        if (!l3League) {
            l3League = new LeagueEntity({
                id: l3Id as any,
                name: `Amateur League Div ${d}`,
                tier: 3,
                tierDivision: d,
                maxTeams: 16,
                promotionSlots: 1,
                playoffSlots: 4,
                relegationSlots: 4,
                status: 'active',
                parentLeagueId: l2Leagues[l2Division - 1].id,
            });
            await leagueRepo.save(l3League);
            console.log(`   ✓ Created L3 Div ${d} (parent: L2 Div ${l2Division})`);
        } else {
            console.log(`   ⊙ L3 Div ${d} already exists`);
        }
        leagues.push(l3League);
    }

    // 3. Create Teams for each league
    console.log('\n⚽ Creating Teams...');
    const ovrRange = getLeagueOvrRange(1);
    const teamBaseOvr = randomInt(ovrRange.min, ovrRange.max);

    for (const league of leagues) {
        const existingStandings = await standingRepo.count({
            where: { leagueId: league.id, season: 1 },
        });

        if (existingStandings >= league.maxTeams) {
            console.log(`   ⊙ ${league.name}: already has ${existingStandings} teams`);
            continue;
        }

        const teamsToCreate = league.maxTeams - existingStandings;
        const tierOvrRange = getLeagueOvrRange(league.tier);
        const tierBaseOvr = randomInt(tierOvrRange.min, tierOvrRange.max);

        for (let i = 0; i < teamsToCreate; i++) {
            const teamId = uuidv4();
            const teamName = generateTeamName(league.tier, league.tierDivision, i);
            const nationality = randomElement(['CN', 'GB', 'ES', 'BR', 'IT', 'DE', 'FR']);

            const team = new TeamEntity({
                id: teamId as any,
                name: teamName,
                userId: adminUser!.id,
                leagueId: league.id,
                isBot: true,
                botLevel: 5,
                logoUrl: '',
                jerseyColorPrimary: `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`,
                jerseyColorSecondary: '#FFFFFF',
            });
            await teamRepo.save(team);

            // Create finance
            await financeRepo.save(new FinanceEntity({
                teamId: team.id,
                balance: randomInt(1000000, 10000000),
            }));

            // Create default stadium (10000 capacity for bot teams)
            await stadiumRepo.save(new StadiumEntity({
                teamId: team.id,
                capacity: 10000,
                isBuilt: true,
            }));

            // Create default fan record
            await fanRepo.save(new FanEntity({
                teamId: team.id,
                totalFans: 10000,
                fanEmotion: 50,
                recentForm: '',
            }));

            // Create standing
            const standing = standingRepo.create({
                teamId: team.id,
                leagueId: league.id,
                season: 1,
                position: existingStandings + i + 1,
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
                const ability = Math.round(playerOvr / 5 * 10) / 10; // Convert to 0-20 scale

                const { tier: potentialTier, ability: potentialAbility } = generatePlayerPotential();
                const { current, potential } = generatePlayerAttributes(isGK, potentialAbility, age);

                playersToCreate.push(new PlayerEntity({
                    name,
                    teamId: team.id,
                    isGoalkeeper: isGK,
                    birthday: new Date(Date.now() - (age * GAME_SETTINGS.MS_PER_YEAR) - (randomInt(0, 365) * 24 * 60 * 60 * 1000)),
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
                }));
            }
            await playerRepo.save(playersToCreate);
        }

        console.log(`   ✓ ${league.name}: created ${teamsToCreate} BOT teams with ${TEAM_ROSTER_SIZE} players each`);
    }

    // 4. Summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ Pyramid seed complete!');
    console.log('='.repeat(60));
    console.log(`   L1: 1 league (Elite League)`);
    console.log(`   L2: 4 leagues (Professional League Div 1-4)`);
    console.log(`   L3: 16 leagues (Amateur League Div 1-16)`);
    console.log(`   Each league: 16 BOT teams`);
    console.log(`   Each team: ${TEAM_ROSTER_SIZE} players`);
    console.log(`   Hierarchy: L3 → L2 → L1 (via parentLeagueId)`);
    console.log('='.repeat(60));

    await AppDataSource.destroy();
}

createLeaguePyramid().catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
});
