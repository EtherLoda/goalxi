import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Player CRUD (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let createdPlayerId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();

    // Register and login to get auth token
    const registerResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/email/register')
      .send({
        username: 'e2etest_' + Date.now(),
        email: `e2etest_${Date.now()}@example.com`,
        password: 'password123',
      });

    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/email/login')
      .send({
        email:
          registerResponse.body.email || `e2etest_${Date.now()}@example.com`,
        password: 'password123',
      });

    authToken = loginResponse.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/players (Create)', () => {
    it('should create a new player with appearance', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/players')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'E2E Test Player',
          appearance: {
            skinTone: 3,
            hairStyle: 5,
            hairColor: 2,
            facialHair: 1,
            accessories: {
              headband: false,
              wristband: true,
              captainBand: false,
            },
          },
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('E2E Test Player');
      expect(response.body.appearance).toBeDefined();
      expect(response.body.appearance.skinTone).toBe(3);
      expect(response.body.appearance.hairStyle).toBe(5);
      expect(response.body.appearance.accessories.wristband).toBe(true);

      createdPlayerId = response.body.id;
    });

    it('should create a player with auto-generated appearance if not provided', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/players')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Auto Appearance Player',
        })
        .expect(201);

      expect(response.body.appearance).toBeDefined();
      expect(response.body.appearance.skinTone).toBeGreaterThanOrEqual(1);
      expect(response.body.appearance.skinTone).toBeLessThanOrEqual(6);
      expect(response.body.appearance.hairStyle).toBeGreaterThanOrEqual(1);
      expect(response.body.appearance.hairStyle).toBeLessThanOrEqual(10);
    });
  });

  describe('GET /api/v1/players (List)', () => {
    it('should return a paginated list of players', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/players')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('GET /api/v1/players/:id (Get One)', () => {
    it('should return a specific player by ID', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/players/${createdPlayerId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.id).toBe(createdPlayerId);
      expect(response.body.name).toBe('E2E Test Player');
      expect(response.body.appearance).toBeDefined();
    });

    it('should return 404 for non-existent player', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      await request(app.getHttpServer())
        .get(`/api/v1/players/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('PATCH /api/v1/players/:id (Update)', () => {
    it('should update player name and appearance', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/players/${createdPlayerId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Updated Player Name',
          appearance: {
            skinTone: 6,
          },
        })
        .expect(200);

      expect(response.body.name).toBe('Updated Player Name');
      expect(response.body.appearance.skinTone).toBe(6);
      // Should keep other appearance properties
      expect(response.body.appearance.hairStyle).toBe(5);
    });
  });

  describe('DELETE /api/v1/players/:id (Delete)', () => {
    it('should soft delete a player', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/players/${createdPlayerId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify player is deleted (should return 404)
      await request(app.getHttpServer())
        .get(`/api/v1/players/${createdPlayerId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });
});
