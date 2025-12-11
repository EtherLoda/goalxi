
import 'reflect-metadata';
import { AppDataSource } from '../src/database/data-source';
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
} from '@goalxi/database';
import * as argon2 from 'argon2';

const PLAYER_NAMES = [
    'James Smith', 'John Johnson', 'Robert Williams', 'Michael Brown', 'William Jones',
    'David Garcia', 'Richard Miller', 'Joseph Davis', 'Thomas Rodriguez', 'Christopher Martinez',
    'Daniel Hernandez', 'Matthew Lopez', 'Anthony Gonzalez', 'Mark Wilson', 'Donald Anderson',
    'Steven Thomas', 'Andrew Taylor', 'Kenneth Moore', 'Joshua Jackson', 'Kevin Martin',
    'Brian Lee', 'George Thompson', 'Timothy White', 'Ronald Harris', 'Edward Sanchez',
    'Jason Clark', 'Jeffrey Ramirez', 'Ryan Lewis', 'Jacob Robinson', 'Gary Walker',
    'Luca Rossi', 'Marco Bianchi', 'Alessandro Romano', 'Giuseppe Colombo', 'Antonio Ricci',
    'Jean Dupont', 'Pierre Martin', 'Michel Bernard', 'Andre Simon', 'Philippe Laurent',
    'Hans Muller', 'Karl Weber', 'Klaus Wagner', 'Jurgen Becker', 'Stefan Hoffman',
    'Luis Garcia', 'Carlos Rodriguez', 'Jose Martinez', 'Manuel Hernandez', 'Francisco Lopez',
];

const TEAM_NAMES = [
    'Manchester Dragons', 'London Tigers', 'Liverpool Eagles', 'Birmingham Lions',
    'Leeds Wolves', 'Newcastle Sharks', 'Bristol Bears', 'Sheffield Steelers'
];

// Positions distribution for 16 players: 2 GK, 14 Outfield
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

function generatePlayerPotential(): { tier: PotentialTier, ability: number } {
    const rand = Math.random() * 100;
    if (rand < 0.5) return { tier: PotentialTier.LEGEND, ability: randomInt(91, 99) }; // 0.5% Legend
    if (rand < 5.0) return { tier: PotentialTier.ELITE, ability: randomInt(81, 90) };  // 4.5% Elite
    if (rand < 20.0) return { tier: PotentialTier.HIGH_PRO, ability: randomInt(71, 80) }; // 15% High Pro
    if (rand < 55.0) return { tier: PotentialTier.REGULAR, ability: randomInt(56, 70) }; // 35% Regular
    return { tier: PotentialTier.LOW, ability: randomInt(40, 55) }; // 45% Low
}

function generatePlayerAttributes(isGK: boolean, potentialAbility: number, age: number): { current: PlayerSkills; potential: PlayerSkills } {
    const targetPotentialAvg = potentialAbility / 5; // Map 0-100 PA to roughly 0-20 attributes

    const outfieldKeys = {
        physical: ['pace', 'strength'],
        technical: ['finishing', 'passing', 'dribbling', 'defending'],
        mental: ['positioning', 'composure']
    };

    const gkKeysActual = {
        physical: ['pace', 'strength'],
        technical: ['reflexes', 'handling', 'distribution'],
        mental: ['positioning', 'composure']
    };

    const keys = isGK ? gkKeysActual : outfieldKeys;
    const potential: Record<string, any> = { physical: {}, technical: {}, mental: {} };
    const current: Record<string, any> = { physical: {}, technical: {}, mental: {} };

    // 1. Generate Potential
    Object.entries(keys).forEach(([category, attrs]) => {
        attrs.forEach(attr => {
            // Base value + random variance
            let val = Math.floor(targetPotentialAvg + (Math.random() * 6 - 3));
            val = Math.max(1, Math.min(20, val));
            potential[category][attr] = val;
        });
    });

    // 2. Generate Current based on age
    Object.entries(keys).forEach(([category, attrs]) => {
        attrs.forEach(attr => {
            let ca: number;
            if (age <= 17) {
                ca = Math.max(1, Math.floor(potential[category][attr] * 0.4)); // Starts low
            } else {
                // Scale towards potential: 18yo ~50%, 28yo ~100%
                const ratio = Math.min(1, 0.5 + (age - 18) * 0.05);
                ca = Math.floor(potential[category][attr] * ratio);
            }
            // Add noise
            ca += Math.floor(Math.random() * 3 - 1);
            ca = Math.max(1, Math.min(potential[category][attr], ca));
            current[category][attr] = ca;
        });
    });

    return { current: current as PlayerSkills, potential: potential as PlayerSkills };
}

// Scheduling Helper: Round Robin
function generateRoundRobinSchedule(teams: TeamEntity[], season: number, leagueId: string) {
    if (teams.length % 2 !== 0) {
        throw new Error('Number of teams must be even for simple round robin');
    }

    const matches: Partial<MatchEntity>[] = [];
    const numRounds = (teams.length - 1) * 2; // Double Round Robin
    const matchesPerRound = teams.length / 2;

    const teamIds = teams.map(t => t.id);
    // Standard Round Robin Algorithm
    // Fix first team, rotate others

    // First Half of Season (Rounds 1 to N-1)
    let rotation = [...teamIds];
    const dummy = rotation.shift()!; // Keep first team fixed

    // Start Date: Next Saturday 13:00
    let matchDate = new Date();
    matchDate.setDate(matchDate.getDate() + (6 - matchDate.getDay() + 7) % 7); // Next Saturday
    matchDate.setHours(13, 0, 0, 0);

    for (let round = 0; round < numRounds; round++) {
        // Prepare matchups for this round
        const roundMatches: Partial<MatchEntity>[] = [];

        // Match 0: Fixed team vs Rotation[0]
        // Determine Home/Away based on round to balance (simple alternation)
        const teamA = dummy;
        const teamB = rotation[0];

        // Alternating home/away for the fixed team
        if (round % 2 === 0) {
            roundMatches.push({ homeTeamId: teamA, awayTeamId: teamB });
        } else {
            roundMatches.push({ homeTeamId: teamB, awayTeamId: teamA });
        }

        // Other matches: pair ends of the array
        for (let i = 1; i < matchesPerRound; i++) {
            const t1 = rotation[i];
            const t2 = rotation[rotation.length - i];
            // Simple logic for home/away alternation
            if (round % 2 === 0) {
                roundMatches.push({ homeTeamId: t1, awayTeamId: t2 });
            } else {
                roundMatches.push({ homeTeamId: t2, awayTeamId: t1 });
            }
        }

        // Add to main list with date
        roundMatches.forEach(m => {
            matches.push({
                ...m,
                leagueId,
                season,
                week: round + 1, // Correctly set the week number (1-indexed)
                scheduledAt: new Date(matchDate),
                status: MatchStatus.SCHEDULED,
                type: MatchType.LEAGUE,
                tacticsLocked: false,
                homeForfeit: false,
                awayForfeit: false,
            });
        });

        // Rotate for next round
        rotation.push(rotation.shift()!);

        // Increment date by 1 week
        matchDate.setDate(matchDate.getDate() + 7);
    }

    return matches;
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
        const matchRepo = AppDataSource.getRepository(MatchEntity);

        // 1. Create Admin User
        console.log('👤 Creating Admin User...');
        const adminEmail = 'admin@goalxi.com';
        let adminUser = await userRepo.findOneBy({ email: adminEmail });

        if (!adminUser) {
            const hashedPassword = await argon2.hash('123456');
            adminUser = new UserEntity({
                username: 'admin',
                email: adminEmail,
                password: hashedPassword,
                nickname: 'Admin Manager',
                bio: 'System Administrator',
                supporterLevel: 99,
                // role: 'ADMIN', // Removed as UserEntity does not have this field
            });
            await userRepo.save(adminUser);
            console.log(`   ✓ Admin user created: ${adminEmail} / 123456`);
        } else {
            console.log(`   ⊙ Admin user already exists`);
        }

        // 2. Create Elite League
        console.log('\n🏆 Creating Elite League...');
        const leagueName = 'Elite League';
        let league = await leagueRepo.findOneBy({ name: leagueName });

        if (!league) {
            league = new LeagueEntity({
                name: leagueName,
                tier: 1,
                division: 1,
                status: 'active',
            });
            await leagueRepo.save(league);
            console.log(`   ✓ Created league: ${leagueName}`);
        } else {
            console.log(`   ⊙ League already exists: ${leagueName}`);
        }

        // 3. Create Teams (8 Teams)
        console.log('\n⚽ Creating Teams...');
        const createdTeams: TeamEntity[] = [];

        for (let i = 0; i < 8; i++) {
            // Check if team exists or create new attached to admin (or dummy users)
            // For simplicity, we attach all to admin if no other users, OR create dummy users.
            // Requirement says "8 teams". We will create dummy users for them to simulate real players.
            const ownerEmail = `manager${i + 1}@goalxi.com`;
            let owner = await userRepo.findOneBy({ email: ownerEmail });

            if (!owner) {
                const pw = await argon2.hash('123456');
                owner = await userRepo.save(new UserEntity({
                    username: `manager${i + 1}`,
                    email: ownerEmail,
                    password: pw,
                    nickname: `Manager ${i + 1}`,
                }));
            }

            const teamName = TEAM_NAMES[i] || `Team ${i + 1}`;
            let team = await teamRepo.findOneBy({ userId: owner.id });

            if (!team) {
                team = new TeamEntity({
                    name: teamName,
                    userId: owner.id,
                    leagueId: league!.id,
                    logoUrl: '',
                    jerseyColorPrimary: '#FF0000',
                    jerseyColorSecondary: '#FFFFFF',
                });
                await teamRepo.save(team);

                // Initialize Finances
                await financeRepo.save(new FinanceEntity({ teamId: team.id, balance: 100000000 }));
                console.log(`   ✓ Created team: ${teamName}`);
            } else {
                console.log(`   ⊙ Team already exists: ${teamName}`);
            }
            createdTeams.push(team);
        }

        // 4. Create Players (16 per team)
        console.log('\n👥 Creating Players...');
        for (const team of createdTeams) {
            const playerCount = await playerRepo.count({ where: { teamId: team.id } });
            if (playerCount >= TEAM_ROSTER_SIZE) {
                console.log(`   ⊙ ${team.name} has enough players (${playerCount})`);
                continue;
            }

            const playersToCreate = [];
            for (let j = 0; j < TEAM_ROSTER_SIZE; j++) {
                // First 2 are GKs
                const isGK = j < GK_COUNT;
                const name = randomElement(PLAYER_NAMES);
                const age = randomInt(17, 34);

                const { tier, ability } = generatePlayerPotential();
                const { current, potential } = generatePlayerAttributes(isGK, ability, age);

                playersToCreate.push(new PlayerEntity({
                    name,
                    teamId: team.id,
                    isGoalkeeper: isGK,
                    birthday: new Date(Date.now() - (age * 365 * 24 * 60 * 60 * 1000)),
                    isYouth: age <= 18,
                    potentialAbility: ability,
                    potentialTier: tier,
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
            console.log(`   ✓ Generated ${TEAM_ROSTER_SIZE} players for ${team.name}`);
        }

        // 5. Generate Match Schedule
        console.log('\n📅 Generating Match Schedule...');
        // Clear existing matches for this league/season to prevent duplicates if re-running
        // await matchRepo.delete({ leagueId: league!.id, season: 1 }); // Optional: Dangerous loop if data exists

        // Always regenerate schedule to ensure correctness
        await matchRepo.delete({ leagueId: league!.id, season: 1 });
        const schedule = generateRoundRobinSchedule(createdTeams, 1, league!.id);
        await matchRepo.save(schedule);
        console.log(`   ✓ Scheduled ${schedule.length} matches for Season 1 (Regenerated)`);

        // 6. Create Initial Standings
        console.log('\n📊 Creating Initial Standings...');
        const standingRepo = AppDataSource.getRepository(LeagueStandingEntity);
        // Clear existing standings
        await standingRepo.delete({ leagueId: league!.id, season: 1 });

        const standings = createdTeams.map(team => {
            return standingRepo.create({
                leagueId: league!.id,
                teamId: team.id,
                season: 1,
                position: 0, // Will be updated by service/scheduler later
                points: 0,
                goalsFor: 0,
                goalsAgainst: 0,
                wins: 0,
                draws: 0,
                losses: 0,
            });
        });
        await standingRepo.save(standings);
        console.log(`   ✓ Created standings for ${standings.length} teams`);

        console.log('\n✅ Seed Completion Summary:');
        console.log(`   League: ${league!.name}`);
        console.log(`   Teams: ${createdTeams.length}`);
        console.log(`   Matches: ${await matchRepo.count()}`);
        console.log('Done.');

        await AppDataSource.destroy();
    } catch (e) {
        console.error('❌ Errors:', e);
        process.exit(1);
    }
}

createTestData();
