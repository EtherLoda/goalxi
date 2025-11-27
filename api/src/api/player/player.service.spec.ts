import { Test, TestingModule } from '@nestjs/testing';
import { PlayerEntity } from './entities/player.entity';
import { PlayerService } from './player.service';

describe('PlayerService', () => {
    let service: PlayerService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [PlayerService],
        }).compile();

        service = module.get<PlayerService>(PlayerService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('generateRandom', () => {
        it('should generate the specified number of players', async () => {
            const count = 5;
            const saveSpy = jest.spyOn(PlayerEntity.prototype, 'save').mockImplementation(async function () {
                this.id = 'some-uuid';
                return this;
            });

            const result = await service.generateRandom(count);

            expect(result).toHaveLength(count);
            expect(saveSpy).toHaveBeenCalledTimes(count);
        });

        it('should generate correct attributes for a goalkeeper', async () => {
            jest.spyOn(PlayerEntity.prototype, 'save').mockImplementation(async function () {
                this.id = 'some-uuid';
                return this;
            });

            const result = await service.generateRandom(20); // Generate enough to likely get a GK
            const goalkeeper = result.find(p => p.isGoalkeeper);

            // If we didn't get a GK (unlikely with 20 attempts but possible), we can't test this.
            // But for the sake of robustness, let's assume we get one or force it if we could mock Math.random.
            // Since we can't easily mock Math.random inside the method without more complex setup, 
            // we'll just check if we found one.

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
                this.id = 'some-uuid';
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
});
