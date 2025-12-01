import 'reflect-metadata';
import { AppDataSource } from '../src/database/data-source';
import {
    UserEntity,
    TeamEntity,
    LeagueEntity,
    PlayerEntity,
    FinanceEntity,
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

function generatePlayerAppearance() {
    return {
        skinTone: randomInt(1, 6),
        hairStyle: randomInt(1, 20),
        hairColor: randomElement(['black', 'brown', 'blonde', 'red', 'gray']),
        facialHair: randomElement(['none', 'beard', 'mustache', 'goatee']),
    };
}

function generatePlayerAttributes(position: string) {
    const isGK = position === 'GK';

    if (isGK) {
        return {
            diving: randomInt(60, 90),
            handling: randomInt(60, 90),
            kicking: randomInt(50, 80),
            reflexes: randomInt(60, 90),
            speed: randomInt(40, 70),
            positioning: randomInt(60, 90),
        };
    }

    return {
        pace: randomInt(50, 95),
        shooting: randomInt(50, 95),
        passing: randomInt(50, 95),
        dribbling: randomInt(50, 95),
        defending: randomInt(50, 95),
        physical: randomInt(50, 95),
        stamina: randomInt(70, 99),
        positioning: randomInt(50, 90),
    };
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
                    const position = randomElement(POSITIONS);
                    const isGoalkeeper = position === 'GK';

                    const player = new PlayerEntity({
                        name,
                        teamId: team.id,
                        position,
                        isGoalkeeper,
                        birthday: new Date(Date.now() - randomInt(18, 35) * 365 * 24 * 60 * 60 * 1000),
                        appearance: generatePlayerAppearance(),
                        attributes: generatePlayerAttributes(position),
                        experience: randomInt(0, 100) / 10,
                        form: randomInt(5, 9),
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
