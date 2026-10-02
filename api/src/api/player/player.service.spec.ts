import { PlayerEntity } from '@goalxi/database';
import { Test, TestingModule } from '@nestjs/testing';
import { CreatePlayerReqDto } from './dto/create-player.req.dto';
import { UpdatePlayerReqDto } from './dto/update-player.req.dto';
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
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a player with provided name', async () => {
      const createDto: CreatePlayerReqDto = {
        name: 'Test Player',
      };

      jest
        .spyOn(PlayerEntity.prototype, 'save')
        .mockImplementation(async function () {
          Object.assign(this, {
            id: 100000001,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          return this;
        });

      const result = await service.create(createDto);

      expect(result).toBeDefined();
      expect(result.name).toBe('Test Player');
    });

    it('should create a player with teamId', async () => {
      const createDto: CreatePlayerReqDto = {
        name: 'Test Player',
        teamId: 'team-uuid',
      };

      jest
        .spyOn(PlayerEntity.prototype, 'save')
        .mockImplementation(async function () {
          Object.assign(this, {
            id: 100000001,
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
    it('should update player teamId', async () => {
      const playerId = 100000001;
      const updateDto: UpdatePlayerReqDto = {
        teamId: 'new-team-uuid',
      };

      const mockPlayer = Object.assign(new PlayerEntity(), {
        id: playerId,
        name: 'Test Player',
        teamId: 'old-team-uuid',
        isGoalkeeper: false,
        currentSkills: {
          physical: { pace: 70, strength: 70, stamina: 70, jumping: 70 },
          technical: {
            finishing: 70,
            passing: 70,
            dribbling: 70,
            tackling: 70,
            marking: 70,
            crossing: 70,
            longShots: 70,
          },
          mental: { positioning: 70, composure: 70 },
          setPieces: { freeKicks: 70, penalties: 70 },
        },
        potentialSkills: {
          physical: { pace: 80, strength: 80, stamina: 80, jumping: 80 },
          technical: {
            finishing: 80,
            passing: 80,
            dribbling: 80,
            tackling: 80,
            marking: 80,
            crossing: 80,
            longShots: 80,
          },
          mental: { positioning: 80, composure: 80 },
          setPieces: { freeKicks: 80, penalties: 80 },
        },
        potentialAbility: 55,
        form: 5,
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

      jest
        .spyOn(PlayerEntity.prototype, 'save')
        .mockImplementation(async function () {
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

    it('should generate players with valid skills structure', async () => {
      jest
        .spyOn(PlayerEntity.prototype, 'save')
        .mockImplementation(async function () {
          Object.assign(this, {
            id: 'some-uuid',
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          return this;
        });

      const result = await service.generateRandom(5);

      result.forEach((player) => {
        expect(player.currentSkills).toBeDefined();
        expect(player.currentSkills.physical).toBeDefined();
        expect(player.currentSkills.technical).toBeDefined();
        expect(player.currentSkills.mental).toBeDefined();
        expect(player.potentialAbility).toBeGreaterThanOrEqual(0);
        expect(player.potentialAbility).toBeLessThanOrEqual(100);
      });
    });

    it('should generate correct attributes for a goalkeeper', async () => {
      jest
        .spyOn(PlayerEntity.prototype, 'save')
        .mockImplementation(async function () {
          Object.assign(this, {
            id: 'some-uuid',
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          return this;
        });

      const result = await service.generateRandom(20);
      const goalkeeper = result.find((p) => p.isGoalkeeper);

      if (goalkeeper) {
        expect(goalkeeper.currentSkills).toHaveProperty('physical');
        expect(goalkeeper.currentSkills).toHaveProperty('technical');
        expect(goalkeeper.currentSkills).toHaveProperty('mental');

        // Check GK specific technical attributes
        expect(goalkeeper.currentSkills.technical).toHaveProperty('reflexes');
        expect(goalkeeper.currentSkills.technical).toHaveProperty('handling');
        expect(goalkeeper.currentSkills.technical).toHaveProperty('aerial');
        expect(goalkeeper.currentSkills.technical).toHaveProperty(
          'positioning',
        );
        expect(goalkeeper.currentSkills.technical).not.toHaveProperty(
          'finishing',
        );
      }
    });

    it('should generate correct attributes for an outfield player', async () => {
      jest
        .spyOn(PlayerEntity.prototype, 'save')
        .mockImplementation(async function () {
          Object.assign(this, {
            id: 'some-uuid',
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          return this;
        });

      const result = await service.generateRandom(20);
      const outfieldPlayer = result.find((p) => !p.isGoalkeeper);

      if (outfieldPlayer) {
        expect(outfieldPlayer.currentSkills).toHaveProperty('physical');
        expect(outfieldPlayer.currentSkills).toHaveProperty('technical');
        expect(outfieldPlayer.currentSkills).toHaveProperty('mental');

        // Check Outfield specific technical attributes
        expect(outfieldPlayer.currentSkills.technical).toHaveProperty(
          'finishing',
        );
        expect(outfieldPlayer.currentSkills.technical).toHaveProperty(
          'passing',
        );
        expect(outfieldPlayer.currentSkills.technical).toHaveProperty(
          'dribbling',
        );
        expect(outfieldPlayer.currentSkills.technical).toHaveProperty(
          'defending',
        );
        expect(outfieldPlayer.currentSkills.technical).not.toHaveProperty(
          'reflexes',
        );
      }
    });
  });

  describe('findOne — numeric ID resolution', () => {
    const VALID_NUMERIC_ID = 100000001;

    beforeEach(() => {
      jest
        .spyOn(PlayerEntity, 'findOneBy')
        .mockImplementation((async () => null) as never);
    });

    it('resolves by numeric id', async () => {
      const player = Object.assign(new PlayerEntity(), {
        id: VALID_NUMERIC_ID,
        name: 'F1',
        currentSkills: {
          physical: {},
          technical: {},
          mental: {},
          setPieces: {},
        },
        potentialSkills: {
          physical: {},
          technical: {},
          mental: {},
          setPieces: {},
        },
      });
      (PlayerEntity.findOneBy as jest.Mock).mockResolvedValue(player);

      const result = await service.findOne(String(VALID_NUMERIC_ID));

      expect(PlayerEntity.findOneBy).toHaveBeenCalledWith({
        id: VALID_NUMERIC_ID,
      });
      expect(result.id).toBe(VALID_NUMERIC_ID);
    });

    it('throws NotFoundException for an invalid identifier', async () => {
      await expect(service.findOne('!!!')).rejects.toThrow();
    });

    it('throws NotFoundException when the player is not found', async () => {
      (PlayerEntity.findOneBy as jest.Mock).mockResolvedValue(null);
      await expect(service.findOne(String(VALID_NUMERIC_ID))).rejects.toThrow();
    });
  });
});
