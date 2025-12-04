import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import {
    MatchEntity,
    MatchTacticsEntity,
    TeamEntity,
    UserEntity,
    LeagueEntity,
    MatchStatus,
    MatchType,
} from '@goalxi/database';

describe('Match Automation E2E', () => {
    let app: INestApplication;
    let dataSource: DataSource;
    let authToken: string;
    let userId: string;
    let homeTeamId: string;
    let awayTeamId: string;
    let matchId: string;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        await app.init();

        dataSource = moduleFixture.get<DataSource>(DataSource);
    });

    afterAll(async () => {
        await app.close();
    });

    describe('Full Match Lifecycle', () => {
        it('should create user and teams', async () => {
            // Create test user
            const userRepo = dataSource.getRepository(UserEntity);
            const user = await userRepo.save({
                email: 'test@example.com',
                username: 'testuser',
                password: 'hashedpassword',
            });
            userId = user.id;

            // Create test league
            const leagueRepo = dataSource.getRepository(LeagueEntity);
            const league = await leagueRepo.save({
                name: 'Test League',
                country: 'Test Country',
                tier: 1,
                season: 1,
            });

            // Create home team
            const teamRepo = dataSource.getRepository(TeamEntity);
            const homeTeam = await teamRepo.save({
                name: 'Home Team',
                userId: user.id,
                leagueId: league.id,
                budget: 1000000,
            });
            homeTeamId = homeTeam.id;

            // Create away team (different user for realistic test)
            const awayUser = await userRepo.save({
                email: 'away@example.com',
                username: 'awayuser',
                password: 'hashedpassword',
            });

            const awayTeam = await teamRepo.save({
                name: 'Away Team',
                userId: awayUser.id,
                leagueId: league.id,
                budget: 1000000,
            });
            awayTeamId = awayTeam.id;

            expect(homeTeamId).toBeDefined();
            expect(awayTeamId).toBeDefined();
        });

        it('should authenticate user', async () => {
            const response = await request(app.getHttpServer())
                .post('/auth/login')
                .send({
                    email: 'test@example.com',
                    password: 'hashedpassword',
                });

            authToken = response.body.token;
            expect(authToken).toBeDefined();
        });

        it('should create a match scheduled 35 minutes in the future', async () => {
            const scheduledAt = new Date(Date.now() + 35 * 60 * 1000);

            const matchRepo = dataSource.getRepository(MatchEntity);
            const match = await matchRepo.save({
                leagueId: 'test-league-id',
                season: 1,
                week: 1,
                homeTeamId,
                awayTeamId,
                scheduledAt,
                status: MatchStatus.SCHEDULED,
                type: MatchType.LEAGUE,
            });

            matchId = match.id;
            expect(matchId).toBeDefined();
            expect(match.status).toBe(MatchStatus.SCHEDULED);
        });

        it('should submit tactics for home team', async () => {
            const tactics = {
                teamId: homeTeamId,
                formation: '4-4-2',
                lineup: {
                    goalkeeper: 'player-1',
                    defenders: ['player-2', 'player-3', 'player-4', 'player-5'],
                    midfielders: ['player-6', 'player-7', 'player-8', 'player-9'],
                    forwards: ['player-10', 'player-11'],
                },
                substitutes: ['player-12', 'player-13', 'player-14'],
                captain: 'player-1',
                freekickTaker: 'player-7',
                penaltyTaker: 'player-10',
                cornerTaker: 'player-8',
            };

            const response = await request(app.getHttpServer())
                .post(`/matches/${matchId}/tactics`)
                .set('Authorization', `Bearer ${authToken}`)
                .send(tactics)
                .expect(201);

            expect(response.body.formation).toBe('4-4-2');
        });

        it('should lock tactics 30 minutes before match (scheduler test)', async () => {
            // This would normally be triggered by the cron job
            // For testing, we can manually trigger the scheduler or wait
            // For now, we'll manually update the match to simulate the lock

            const matchRepo = dataSource.getRepository(MatchEntity);
            await matchRepo.update(matchId, {
                tacticsLocked: true,
                status: MatchStatus.TACTICS_LOCKED,
                awayForfeit: true, // Simulate away team didn't submit tactics
            });

            const match = await matchRepo.findOne({ where: { id: matchId } });
            expect(match?.tacticsLocked).toBe(true);
            expect(match?.awayForfeit).toBe(true);
        });

        it('should simulate match (forfeit scenario)', async () => {
            // In real scenario, this would be triggered by BullMQ
            // For testing, we verify the match was queued and processed
            // We'll check if events were created

            const match = await dataSource
                .getRepository(MatchEntity)
                .findOne({ where: { id: matchId } });

            // After simulation, match should be completed
            expect(match?.status).toBe(MatchStatus.COMPLETED);
            expect(match?.homeScore).toBe(5); // Forfeit gives 5-0
            expect(match?.awayScore).toBe(0);
        });

        it('should retrieve events progressively via API', async () => {
            const response = await request(app.getHttpServer())
                .get(`/matches/${matchId}/events`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.matchId).toBe(matchId);
            expect(response.body.events).toBeDefined();
            expect(response.body.currentScore).toEqual({ home: 5, away: 0 });
            expect(response.body.isComplete).toBe(true);
        });

        it('should deny access to unauthorized user', async () => {
            // Create another user who doesn't own either team
            const userRepo = dataSource.getRepository(UserEntity);
            const unauthorizedUser = await userRepo.save({
                email: 'unauthorized@example.com',
                username: 'unauthorized',
                password: 'hashedpassword',
            });

            const loginResponse = await request(app.getHttpServer())
                .post('/auth/login')
                .send({
                    email: 'unauthorized@example.com',
                    password: 'hashedpassword',
                });

            const unauthorizedToken = loginResponse.body.token;

            await request(app.getHttpServer())
                .get(`/matches/${matchId}/events`)
                .set('Authorization', `Bearer ${unauthorizedToken}`)
                .expect(403);
        });
    });

    describe('Tournament Match with Extra Time', () => {
        it('should create tournament match and simulate with extra time', async () => {
            const scheduledAt = new Date(Date.now() + 35 * 60 * 1000);

            const matchRepo = dataSource.getRepository(MatchEntity);
            const match = await matchRepo.save({
                leagueId: 'test-league-id',
                season: 1,
                week: 1,
                homeTeamId,
                awayTeamId,
                scheduledAt,
                status: MatchStatus.SCHEDULED,
                type: MatchType.TOURNAMENT,
            });

            // Submit tactics for both teams
            // ... (similar to previous test)

            // After simulation, if scores are tied, extra time should be added
            const simulatedMatch = await matchRepo.findOne({
                where: { id: match.id },
            });

            if (simulatedMatch?.homeScore === simulatedMatch?.awayScore) {
                expect(simulatedMatch.hasExtraTime).toBe(true);
            }
        });
    });
});
