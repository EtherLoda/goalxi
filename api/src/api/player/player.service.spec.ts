import { Test, TestingModule } from '@nestjs/testing';
import { Uuid } from '@/common/types/common.type';
import { PlayerEntity } from '@goalxi/database';
import { PlayerService } from './player.service';
import { CreatePlayerReqDto } from './dto/create-player.req.dto';
import { UpdatePlayerReqDto } from './dto/update-player.req.dto';

describe('PlayerService', () => {
    let service: PlayerService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [PlayerService],
        }).compile();

        service = module.get<PlayerService>(PlayerService);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('create', () => {
        it('should create a player with provided appearance', async () => {
            const createDto: CreatePlayerReqDto = {
                name: 'Test Player',
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
            };

            jest.spyOn(PlayerEntity.prototype, 'save').mockImplementation(async function () {
                Object.assign(this, {
                    id: 'test-uuid',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
                return this;
            });

            const result = await service.create(createDto);

            expect(result).toBeDefined();
            expect(result.name).toBe('Test Player');
            expect(result.appearance).toEqual(createDto.appearance);
        });

        it('should generate random appearance if not provided', async () => {
            const createDto: CreatePlayerReqDto = {
                name: 'Test Player',
            };

            jest.spyOn(PlayerEntity.prototype, 'save').mockImplementation(async function () {
                Object.assign(this, {
                    id: 'test-uuid',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
                return this;
            });

            const result = await service.create(createDto);

            expect(result).toBeDefined();
            expect(result.appearance).toBeDefined();
            expect(result.appearance.skinTone).toBeGreaterThanOrEqual(1);
            expect(result.appearance.skinTone).toBeLessThanOrEqual(6);
            expect(result.appearance.hairStyle).toBeGreaterThanOrEqual(1);
            expect(result.appearance.hairStyle).toBeLessThanOrEqual(10);
        });

        it('should create a player with teamId', async () => {
            const createDto: CreatePlayerReqDto = {
                name: 'Test Player',
                teamId: 'team-uuid',
            };

            jest.spyOn(PlayerEntity.prototype, 'save').mockImplementation(async function () {
                Object.assign(this, {
                    id: 'test-uuid',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
                return this;
            });

            const result = await service.create(createDto);

            expect(result).toBeDefined();
            expect(result.teamId).toBe('team-uuid');
        });
    });

    describe('update', () => {
        it('should update player appearance', async () => {
            const playerId = 'test-uuid' as Uuid;
            const updateDto: UpdatePlayerReqDto = {
                appearance: {
                    skinTone: 5,
                },
            };

            const mockPlayer = Object.assign(new PlayerEntity(), {
                id: playerId,
                name: 'Test Player',
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
                save: jest.fn().mockResolvedValue(undefined),
            });

            jest.spyOn(PlayerEntity, 'findOneByOrFail').mockResolvedValue(mockPlayer);

            await service.update(playerId, updateDto);

            expect(mockPlayer.appearance.skinTone).toBe(5);
            expect(mockPlayer.appearance.hairStyle).toBe(5); // Should keep existing value
            expect(mockPlayer.save).toHaveBeenCalledTimes(1);
        });

        it('should update player teamId', async () => {
            const playerId = 'test-uuid' as Uuid;
            const updateDto: UpdatePlayerReqDto = {
                teamId: 'new-team-uuid',
            };

            const mockPlayer = Object.assign(new PlayerEntity(), {
                id: playerId,
                name: 'Test Player',
                teamId: 'old-team-uuid',
                appearance: {},
                save: jest.fn().mockResolvedValue(undefined),
            });

            jest.spyOn(PlayerEntity, 'findOneByOrFail').mockResolvedValue(mockPlayer);

            await service.update(playerId, updateDto);

            expect(mockPlayer.teamId).toBe('new-team-uuid');
            expect(mockPlayer.save).toHaveBeenCalledTimes(1);
        });
    });

    describe('generateRandom', () => {
        it('should generate the specified number of players', async () => {
            const count = 5;

            jest.spyOn(PlayerEntity.prototype, 'save').mockImplementation(async function () {
                Object.assign(this, {
                    id: 'some-uuid',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
                return this;
            });

            const result = await service.generateRandom(count);

            expect(result).toHaveLength(count);
        });

        it('should generate players with valid appearance structure', async () => {
            jest.spyOn(PlayerEntity.prototype, 'save').mockImplementation(async function () {
                Object.assign(this, {
                    id: 'some-uuid',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
                return this;
            });

            const result = await service.generateRandom(5);

            result.forEach(player => {
                expect(player.appearance).toBeDefined();
                expect(player.appearance.skinTone).toBeGreaterThanOrEqual(1);
                expect(player.appearance.skinTone).toBeLessThanOrEqual(6);
                expect(player.appearance.hairStyle).toBeGreaterThanOrEqual(1);
                expect(player.appearance.hairStyle).toBeLessThanOrEqual(10);
                expect(player.appearance.hairColor).toBeGreaterThanOrEqual(1);
                expect(player.appearance.hairColor).toBeLessThanOrEqual(8);
                expect(player.appearance.facialHair).toBeGreaterThanOrEqual(0);
                expect(player.appearance.facialHair).toBeLessThanOrEqual(5);
                expect(player.appearance.accessories).toBeDefined();
                expect(typeof player.appearance.accessories.headband).toBe('boolean');
                expect(typeof player.appearance.accessories.wristband).toBe('boolean');
                expect(typeof player.appearance.accessories.captainBand).toBe('boolean');
            });
        });

        it('should generate correct attributes for a goalkeeper', async () => {
            jest.spyOn(PlayerEntity.prototype, 'save').mockImplementation(async function () {
                Object.assign(this, {
                    id: 'some-uuid',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
                return this;
            });

            const result = await service.generateRandom(20);
            const goalkeeper = result.find(p => p.isGoalkeeper);

            if (goalkeeper) {
                expect(goalkeeper.attributes).toHaveProperty('physical');
                expect(goalkeeper.attributes).toHaveProperty('technical');
                expect(goalkeeper.attributes).toHaveProperty('mental');

                // Check GK specific technical attributes
                expect(goalkeeper.attributes.technical).toHaveProperty('reflexes');
                expect(goalkeeper.attributes.technical).toHaveProperty('handling');
                expect(goalkeeper.attributes.technical).toHaveProperty('distribution');
                expect(goalkeeper.attributes.technical).not.toHaveProperty('finishing');
            }
        });

        it('should generate correct attributes for an outfield player', async () => {
            jest.spyOn(PlayerEntity.prototype, 'save').mockImplementation(async function () {
                Object.assign(this, {
                    id: 'some-uuid',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
                return this;
            });

            const result = await service.generateRandom(20);
            const outfieldPlayer = result.find(p => !p.isGoalkeeper);

            if (outfieldPlayer) {
                expect(outfieldPlayer.attributes).toHaveProperty('physical');
                expect(outfieldPlayer.attributes).toHaveProperty('technical');
                expect(outfieldPlayer.attributes).toHaveProperty('mental');

                // Check Outfield specific technical attributes
                expect(outfieldPlayer.attributes.technical).toHaveProperty('finishing');
                expect(outfieldPlayer.attributes.technical).toHaveProperty('passing');
                expect(outfieldPlayer.attributes.technical).toHaveProperty('dribbling');
                expect(outfieldPlayer.attributes.technical).toHaveProperty('defending');
                expect(outfieldPlayer.attributes.technical).not.toHaveProperty('reflexes');
            }
        });
    });

    describe('appearance generation', () => {
        it('should generate valid appearance values', () => {
            const appearance = (service as any).generateRandomAppearance();

            expect(appearance.skinTone).toBeGreaterThanOrEqual(1);
            expect(appearance.skinTone).toBeLessThanOrEqual(6);
            expect(appearance.hairStyle).toBeGreaterThanOrEqual(1);
            expect(appearance.hairStyle).toBeLessThanOrEqual(10);
            expect(appearance.hairColor).toBeGreaterThanOrEqual(1);
            expect(appearance.hairColor).toBeLessThanOrEqual(8);
            expect(appearance.facialHair).toBeGreaterThanOrEqual(0);
            expect(appearance.facialHair).toBeLessThanOrEqual(5);
            expect(typeof appearance.accessories.headband).toBe('boolean');
            expect(typeof appearance.accessories.wristband).toBe('boolean');
            expect(typeof appearance.accessories.captainBand).toBe('boolean');
        });

        it('should generate different appearances', () => {
            const appearances = [];
            for (let i = 0; i < 10; i++) {
                appearances.push((service as any).generateRandomAppearance());
            }

            // Check that not all appearances are identical
            const allIdentical = appearances.every(app =>
                JSON.stringify(app) === JSON.stringify(appearances[0])
            );
            expect(allIdentical).toBe(false);
        });
    });
});
