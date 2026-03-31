import 'reflect-metadata';
import { AppDataSource } from '../src/database/data-source';
import {
    UserEntity,
    TeamEntity,
    LeagueEntity,
    PlayerEntity,
    FinanceEntity,
    PotentialTier,
    TrainingSlot,
    PlayerSkills,
    GAME_SETTINGS,
} from '@goalxi/database';
import * as argon2 from 'argon2';

const PLAYER_NAMES = [
    'James Smith', 'John Johnson', 'Robert Williams', 'Michael Brown', 'William Jones',
    'David Garcia', 'Richard Miller', 'Joseph Davis', 'Thomas Rodriguez', 'Christopher Martinez',
    'Daniel Hernandez', 'Matthew Lopez', 'Anthony Gonzalez', 'Mark Wilson', 'Donald Anderson',
    'Steven Thomas', 'Andrew Taylor', 'Kenneth Moore', 'Joshua Jackson', 'Kevin Martin',
    'Brian Lee', 'George Thompson', 'Timothy White', 'Ronald Harris', 'Edward Sanchez',
    'Jason Clark', 'Jeffrey Ramirez', 'Ryan Lewis', 'Jacob Robinson', 'Gary Walker',
];

const TEAM_NAMES = [
    'Manchester Dragons', 'London Tigers', 'Liverpool Eagles', 'Birmingham Lions', 'Leeds Wolves',
];

const POSITIONS = ['GK', 'LB', 'CB', 'RB', 'LM', 'CM', 'RM', 'LW', 'ST', 'RW'];

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

function generatePlayerPotential(): { tier: PotentialTier, ability: number } {
    const rand = Math.random() * 100;
    if (rand < 0.5) return { tier: PotentialTier.LEGEND, ability: randomInt(91, 99) };
    if (rand < 5.0) return { tier: PotentialTier.ELITE, ability: randomInt(81, 90) };
    if (rand < 20.0) return { tier: PotentialTier.HIGH_PRO, ability: randomInt(71, 80) };
    if (rand < 55.0) return { tier: PotentialTier.REGULAR, ability: randomInt(56, 70) };
    return { tier: PotentialTier.LOW, ability: randomInt(40, 55) };
}

function generatePlayerAttributes(position: string, potentialAbility: number, age: number): { current: PlayerSkills; potential: PlayerSkills } {
    const isGK = position === 'GK';
    const targetPotentialAvg = potentialAbility / 5; // Map 0-100 PA to roughly 0-20 attributes

    // Define primary attributes per position for variance
    const primaryAttrs: Record<string, string[]> = {
        'GK': ['reflexes', 'handling', 'positioning'],
        'LB': ['pace', 'defending', 'awareness'],
        'RB': ['pace', 'defending', 'awareness'],
        'CB': ['strength', 'defending', 'positioning', 'awareness'],
        'LM': ['pace', 'dribbling', 'passing'],
        'RM': ['pace', 'dribbling', 'passing'],
        'CM': ['passing', 'vision', 'positioning'],
        'LW': ['pace', 'dribbling', 'finishing'],
        'RW': ['pace', 'dribbling', 'finishing'],
        'ST': ['finishing', 'strength', 'positioning'],
    };

    // Attributes based on schema - stamina removed (now separate field)
    const outfieldKeys = {
        physical: ['pace', 'strength'],
        technical: ['finishing', 'passing', 'dribbling', 'defending'],
        mental: ['positioning', 'composure'],
        setPieces: ['freeKicks', 'penalties']
    };

    const gkKeys = {
        physical: ['pace', 'strength'],
        technical: ['reflexes', 'handling', 'distribution'],
        mental: ['positioning', 'composure'],
        setPieces: ['freeKicks', 'penalties']
    };

    const keys = isGK ? gkKeys : outfieldKeys;
    const primaries = primaryAttrs[position] || [];
    const potential: Record<string, any> = { physical: {}, technical: {}, mental: {}, setPieces: {} };
    const current: Record<string, any> = { physical: {}, technical: {}, mental: {}, setPieces: {} };

    // 1. Generate Potential with variance based on position
    Object.entries(keys).forEach(([category, attrs]) => {
        attrs.forEach(attr => {
            let base = targetPotentialAvg;

            // Primary attributes get a boost, others get a penalty
            if (primaries.includes(attr)) {
                base += 3;
            } else {
                base -= 1;
            }

            // Add random variance: +/- 4
            let val = Math.floor(base + (Math.random() * 8 - 4));
            val = Math.max(1, Math.min(20, val));
            potential[category][attr] = val;
        });
    });

    // 2. Generate Current based on age
    Object.entries(keys).forEach(([category, attrs]) => {
        attrs.forEach(attr => {
            let ca: number;

            if (age <= 17) {
                // Young players always start in 2-7 range regardless of PA
                ca = 2 + Math.floor(Math.random() * 6); // 2 to 7
                // Cap by potential
                if (ca > potential[category][attr]) ca = potential[category][attr];
            } else {
                // Older players scale towards their potential
                // 18yo: ~30%, 22yo: ~60%, 26yo: ~95%
                const startRatio = 0.30;
                const peakRatio = 0.95;
                const peakAge = 26;

                const ratio = startRatio + (peakRatio - startRatio) * Math.min(1, (age - 18) / (peakAge - 18));

                ca = Math.floor(potential[category][attr] * ratio);
                // Add some noise
                ca += Math.floor(Math.random() * 3 - 1);
            }

            // Final constraints
            ca = Math.max(1, ca);
            if (ca > potential[category][attr]) ca = potential[category][attr];

            current[category][attr] = ca;
        });
    });

    return { current: current as PlayerSkills, potential: potential as PlayerSkills };
}

async function createTestData() {
    try {
        console.log('🚀 Initializing database connection...');
        await AppDataSource.initialize();
        console.log('✅ Database connected\n');

        const userRepo = AppDataSource.getRepository(UserEntity);
        const teamRepo = AppDataSource.getRepository(TeamEntity);
        const leagueRepo = AppDataSource.getRepository(LeagueEntity);
        const playerRepo = AppDataSource.getRepository(PlayerEntity);
        const financeRepo = AppDataSource.getRepository(FinanceEntity);

        // Create test league
        console.log('🏆 Creating test league...');
        let league = await leagueRepo.findOne({
            where: { name: 'Premier Development League' }
        });

        if (!league) {
            const result = await leagueRepo.insert({
                name: 'Premier Development League',
                tier: 1,
                division: 1,
                status: 'active',
            });
            league = await leagueRepo.findOne({ where: { id: result.identifiers[0].id } });
            console.log('   ✓ Created league: Premier Development League (Tier 1, Div 1)');
        } else {
            console.log('   ⊙ League already exists: Premier Development League');
        }

        // Create test users
        console.log('\n👤 Creating test users...');
        const users: UserEntity[] = [];
        const hashedPassword = await argon2.hash('Test123456!');

        for (let i = 1; i <= 5; i++) {
            const email = `testuser${i}@goalxi.com`;
            let user = await userRepo.findOneBy({ email });

            if (!user) {
                const result = await userRepo.insert({
                    username: `testuser${i}`,
                    email,
                    password: hashedPassword,
                    nickname: `Test Manager ${i}`,
                    bio: `I'm test manager #${i} ready to dominate the league!`,
                    supporterLevel: randomInt(1, 3),
                });

                user = await userRepo.findOneBy({ id: result.identifiers[0].id });
                console.log(`   ✓ Created user: ${email}`);
            } else {
                console.log(`   ⊙ User already exists: ${email}`);
            }
            users.push(user!);
        }

        // Create teams and standings
        console.log('\n⚽ Creating teams and standings...');
        const teams: TeamEntity[] = [];
        const leagueStandingRepo = AppDataSource.getRepository('LeagueStandingEntity');

        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            let team = await teamRepo.findOneBy({ userId: user.id });

            if (!team) {
                team = new TeamEntity({
                    name: TEAM_NAMES[i] || `Team ${i + 1}`,
                    userId: user.id,
                    leagueId: league!.id,
                    logoUrl: '',
                    jerseyColorPrimary: `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`,
                    jerseyColorSecondary: '#FFFFFF',
                });
                await teamRepo.save(team);
                console.log(`   ✓ Created team: ${team.name} (Owner: ${user.nickname})`);

                // Create finance record
                const finance = new FinanceEntity({
                    teamId: team.id,
                    balance: randomInt(5000000, 50000000),
                });
                await financeRepo.save(finance);

                // Create league standing for current season (1)
                await leagueStandingRepo.save({
                    leagueId: league!.id,
                    teamId: team.id,
                    season: 1,
                    position: i + 1,
                    points: 0,
                    wins: 0,
                    draws: 0,
                    losses: 0,
                    goalsFor: 0,
                    goalsAgainst: 0,
                });
            } else {
                console.log(`   ⊙ Team already exists: ${team.name}`);
            }
            teams.push(team);
        }

        // Create players for each team
        console.log('\n👥 Creating players...');
        let totalPlayers = 0;

        for (const team of teams) {
            const existingPlayers = await playerRepo.count({ where: { teamId: team.id } });

            if (existingPlayers === 0) {
                const playersToCreate = [];

                // Create 15-20 players per team
                const numPlayers = randomInt(15, 20);
                for (let i = 0; i < numPlayers; i++) {
                    const name = randomElement(PLAYER_NAMES);
                    // 10% chance to be GK
                    const isGoalkeeper = Math.random() < 0.1;
                    const position = isGoalkeeper ? 'GK' : randomElement(POSITIONS.filter(p => p !== 'GK'));

                    const age = randomInt(17, 30);
                    const { tier, ability } = generatePlayerPotential();
                    const trainingSlot = ability > 80 ? TrainingSlot.ENHANCED : TrainingSlot.REGULAR;

                    const { current, potential } = generatePlayerAttributes(position, ability, age);
                    const player = new PlayerEntity({
                        name,
                        teamId: team.id,
                        isGoalkeeper,
                        birthday: new Date(Date.now() - (age * GAME_SETTINGS.MS_PER_YEAR) - (Math.floor(Math.random() * GAME_SETTINGS.DAYS_PER_YEAR) * 24 * 60 * 60 * 1000)),
                        isYouth: age <= 17,
                        potentialAbility: ability,
                        potentialTier: tier,
                        trainingSlot,
                        appearance: generatePlayerAppearance(),
                        currentSkills: current,
                        potentialSkills: potential,
                        experience: randomFloat(0, 10, 1),
                        form: randomFloat(1.0, 5.0, 1),
                        stamina: randomFloat(1.0, 5.0, 1),
                        onTransfer: false,
                    });

                    playersToCreate.push(player);
                }

                await playerRepo.save(playersToCreate);
                totalPlayers += playersToCreate.length;
                console.log(`   ✓ Created ${playersToCreate.length} players for ${team.name}`);
            } else {
                console.log(`   ⊙ ${team.name} already has ${existingPlayers} players`);
                totalPlayers += existingPlayers;
            }
        }

        // Summary
        console.log('\n' + '='.repeat(60));
        console.log('✅ Test data creation complete!\n');
        console.log('📊 Summary:');
        console.log(`   👤 Users: ${users.length}`);
        console.log(`   🏆 Leagues: 1`);
        console.log(`   ⚽ Teams: ${teams.length}`);
        console.log(`   👥 Players: ${totalPlayers}`);
        console.log('\n🔑 Login Credentials:');
        for (let i = 1; i <= users.length; i++) {
            console.log(`   Email: testuser${i}@goalxi.com | Password: Test123456!`);
        }
        console.log('\n💡 Usage:');
        console.log('   Run: pnpm dev:seed');
        console.log('='.repeat(60));

        await AppDataSource.destroy();
    } catch (error) {
        console.error('❌ Error creating test data:', error);
        process.exit(1);
    }
}

createTestData();
