import { PlayerEntity } from '@goalxi/database';
import { Test, TestingModule } from '@nestjs/testing';
import { Uuid } from '../../common/types/common.type';
import { CreatePlayerReqDto } from './dto/create-player.req.dto';
import { UpdatePlayerReqDto } from './dto/update-player.req.dto';
import { PlayerService } from './player.service';
import { ForbiddenException } from '@nestjs/common';

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
            id: 'test-uuid',
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
    it('should update player teamId', async () => {
      const playerId = 'test-uuid' as Uuid;
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

  describe('create — auto-generates displayId', () => {
    it('assigns an 11-digit displayId alongside the UUID', async () => {
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

      const result = await service.create({ name: 'Demo' } as any);

      expect(result.displayId).toMatch(/^\d{11}$/);
      expect(result.id).toBeDefined();
    });
  });

  describe('findOne — UUID or displayId resolution', () => {
    const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
    const VALID_DID = '12345678901';

    beforeEach(() => {
      jest
        .spyOn(PlayerEntity, 'findOneBy')
        .mockImplementation((async () => null) as never);
    });

    it('resolves by UUID when the param is a UUID', async () => {
      const player = Object.assign(new PlayerEntity(), {
        id: VALID_UUID as Uuid,
        displayId: VALID_DID,
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

      const result = await service.findOne(VALID_UUID);

      expect(PlayerEntity.findOneBy).toHaveBeenCalledWith({ id: VALID_UUID });
      expect(result.displayId).toBe(VALID_DID);
    });

    it('resolves by displayId when the param is an 11-digit number', async () => {
      const player = Object.assign(new PlayerEntity(), {
        id: VALID_UUID as Uuid,
        displayId: VALID_DID,
        name: 'F2',
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

      const result = await service.findOne(VALID_DID);

      expect(PlayerEntity.findOneBy).toHaveBeenCalledWith({
        displayId: VALID_DID,
      });
      expect(result.id).toBe(VALID_UUID);
    });

    it('throws NotFoundException for an invalid identifier', async () => {
      await expect(service.findOne('!!!')).rejects.toThrow();
    });

    it('throws NotFoundException when the displayId is unknown', async () => {
      (PlayerEntity.findOneBy as jest.Mock).mockResolvedValue(null);
      await expect(service.findOne(VALID_DID)).rejects.toThrow();
    });
  });

  describe('promote — server-enforced reveal gate (WAVE B1)', () => {
    const playerId = '11111111-1111-4111-8111-111111111111';

    // Build a real PlayerEntity-shaped instance (via Object.create so
    // the prototype chain carries `save`, which the service calls).
    const emptySkills = {
      physical: { pace: 0, strength: 0 },
      technical: { finishing: 0, passing: 0, dribbling: 0, defending: 0 },
      mental: { positioning: 0, composure: 0 },
      setPieces: { freeKicks: 0, penalties: 0 },
    };
    const youth = (overrides: Partial<PlayerEntity>): PlayerEntity => {
      const p = Object.create(PlayerEntity.prototype) as PlayerEntity;
      Object.assign(p, {
        id: playerId,
        isYouth: true,
        isGoalkeeper: false,
        currentSkills: emptySkills,
        potentialSkills: emptySkills,
        revealedSkills: [],
        ...overrides,
      });
      return p;
    };

    // Each test mocks both the static `findOneByOrFail` (used by
    // PlayerService.promote) and the prototype `save`.
    const setup = (player: PlayerEntity) => {
      jest
        .spyOn(PlayerEntity, 'findOneByOrFail')
        .mockResolvedValue(player);
      jest
        .spyOn(PlayerEntity.prototype, 'save')
        .mockImplementation(async function () {
          return this;
        });
    };

    it('rejects a non-youth player outright with 400', async () => {
      setup(youth({ isYouth: false }));
      await expect(service.promote(playerId as Uuid)).rejects.toThrow(
        /not a youth player/,
      );
    });

    it('rejects an outfield player with 0 revealed skills (10 keys)', async () => {
      setup(youth({ revealedSkills: [] }));
      await expect(service.promote(playerId as Uuid)).rejects.toThrow(
        /not enough skills revealed/i,
      );
    });

    it('rejects an outfield player with only 4/10 skills revealed (ceil(50%)=5)', async () => {
      setup(
        youth({
          revealedSkills: ['pace', 'strength', 'finishing', 'passing'],
        }),
      );
      await expect(service.promote(playerId as Uuid)).rejects.toThrow(
        /not enough skills revealed/i,
      );
    });

    it('promotes an outfield player with exactly 5/10 skills revealed', async () => {
      setup(
        youth({
          revealedSkills: [
            'pace',
            'strength',
            'finishing',
            'passing',
            'dribbling',
          ],
        }),
      );
      const result = await service.promote(playerId as Uuid);
      expect(result.isYouth).toBe(false);
    });

    it('rejects a goalkeeper with only 4/9 skills revealed (ceil(0.5*9)=5)', async () => {
      setup(
        youth({
          isGoalkeeper: true,
          revealedSkills: ['pace', 'strength', 'reflexes', 'handling'],
        }),
      );
      await expect(service.promote(playerId as Uuid)).rejects.toThrow(
        /not enough skills revealed/i,
      );
    });

    it('promotes a goalkeeper with exactly 5/9 skills revealed', async () => {
      setup(
        youth({
          isGoalkeeper: true,
          revealedSkills: [
            'pace',
            'strength',
            'reflexes',
            'handling',
            'aerial',
          ],
        }),
      );
      const result = await service.promote(playerId as Uuid);
      expect(result.isYouth).toBe(false);
    });

    it('flips is_youth=false, clears the reveal mask, and clears youth_league_id on success', async () => {
      const p = youth({
        revealedSkills: [
          'pace',
          'strength',
          'finishing',
          'passing',
          'dribbling',
        ],
        revealLevel: 5,
        potentialRevealed: false,
        youthLeagueId: 'YL1',
      });
      setup(p);

      await service.promote(playerId as Uuid);

      expect(p.isYouth).toBe(false);
      expect(p.revealedSkills).toEqual([]);
      expect(p.revealLevel).toBe(0);
      expect(p.potentialRevealed).toBe(true);
      expect(p.youthLeagueId).toBeNull();
    });
  });

  describe('releaseYouth — WAVE B2', () => {
    const playerId = '11111111-1111-4111-8111-111111111111';

    const setup = (player: PlayerEntity) => {
      jest
        .spyOn(PlayerEntity, 'findOneByOrFail')
        .mockResolvedValue(player);
      jest
        .spyOn(PlayerEntity.prototype, 'softRemove')
        .mockResolvedValue(player as any);
    };

    it('soft-deletes a youth player', async () => {
      const p = Object.create(PlayerEntity.prototype) as PlayerEntity;
      Object.assign(p, {
        id: playerId,
        isYouth: true,
      });
      setup(p);

      await service.releaseYouth(playerId as Uuid);
      expect(PlayerEntity.prototype.softRemove).toHaveBeenCalledTimes(1);
    });

    it('refuses to release a senior player (400)', async () => {
      const p = Object.create(PlayerEntity.prototype) as PlayerEntity;
      Object.assign(p, {
        id: playerId,
        isYouth: false,
      });
      setup(p);

      await expect(
        service.releaseYouth(playerId as Uuid),
      ).rejects.toThrow(/only youth players can be released/i);
      expect(PlayerEntity.prototype.softRemove).not.toHaveBeenCalled();
    });

    it('surfaces NotFoundException for an unknown id', async () => {
      // findOneByOrFail throws EntityNotFoundError; we forward it.
      jest
        .spyOn(PlayerEntity, 'findOneByOrFail')
        .mockImplementation(() => {
          throw new Error('not found');
        });

      await expect(
        service.releaseYouth(playerId as Uuid),
      ).rejects.toThrow(/not found/);
    });
  });
});
