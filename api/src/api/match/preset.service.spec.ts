import { PlayerEntity, TacticsPresetEntity } from '@goalxi/database';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CreatePresetReqDto } from './dto/create-preset.req.dto';
import { PresetService } from './preset.service';

describe('PresetService', () => {
  let service: PresetService;

  const mockPresetRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  const mockPlayerRepository = {
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PresetService,
        {
          provide: getRepositoryToken(TacticsPresetEntity),
          useValue: mockPresetRepository,
        },
        {
          provide: getRepositoryToken(PlayerEntity),
          useValue: mockPlayerRepository,
        },
      ],
    }).compile();

    service = module.get<PresetService>(PresetService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a preset', async () => {
      const teamId = 'team-id';
      const dto: CreatePresetReqDto = {
        name: 'Preset 1',
        formation: '4-4-2',
        lineup: {
          GK: 1001,
          CBL: 1002,
          CB: 1003,
          LB: 1004,
          RB: 1005,
          DMFL: 1006,
          CML: 1007,
          CAML: 1008,
          LW: 1009,
          RW: 1010,
          CF: 1011,
        },
      };

      mockPlayerRepository.find.mockResolvedValue([
        { id: 1001, isGoalkeeper: true },
        { id: 1002, isGoalkeeper: false },
        { id: 1003, isGoalkeeper: false },
        { id: 1004, isGoalkeeper: false },
        { id: 1005, isGoalkeeper: false },
        { id: 1006, isGoalkeeper: false },
        { id: 1007, isGoalkeeper: false },
        { id: 1008, isGoalkeeper: false },
        { id: 1009, isGoalkeeper: false },
        { id: 1010, isGoalkeeper: false },
        { id: 1011, isGoalkeeper: false },
      ]);

      mockPresetRepository.findOne.mockResolvedValue(null); // No existing name
      mockPresetRepository.create.mockReturnValue({
        ...dto,
        id: 'preset-id',
        teamId,
      });
      mockPresetRepository.save.mockResolvedValue({
        ...dto,
        id: 'preset-id',
        teamId,
      });

      const result = await service.create(teamId, dto);
      expect(result.id).toBe('preset-id');
    });

    it('should fail if name exists', async () => {
      const teamId = 'team-id';
      const dto: CreatePresetReqDto = {
        name: 'Existing Name',
        formation: '4-4-2',
        lineup: {
          GK: 1001,
          CBL: 1002,
          CB: 1003,
          LB: 1004,
          RB: 1005,
          DMFL: 1006,
          CML: 1007,
          CAML: 1008,
          LW: 1009,
          RW: 1010,
          CF: 1011,
        },
      };

      mockPlayerRepository.find.mockResolvedValue([
        { id: 1001, isGoalkeeper: true },
        { id: 1002, isGoalkeeper: false },
        { id: 1003, isGoalkeeper: false },
        { id: 1004, isGoalkeeper: false },
        { id: 1005, isGoalkeeper: false },
        { id: 1006, isGoalkeeper: false },
        { id: 1007, isGoalkeeper: false },
        { id: 1008, isGoalkeeper: false },
        { id: 1009, isGoalkeeper: false },
        { id: 1010, isGoalkeeper: false },
        { id: 1011, isGoalkeeper: false },
      ]);

      mockPresetRepository.findOne.mockResolvedValue({ id: 'existing-id' });

      await expect(service.create(teamId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('delete', () => {
    it('should delete a preset', async () => {
      const teamId = 'team-id';
      const presetId = 'preset-id';

      mockPresetRepository.findOne.mockResolvedValue({
        id: presetId,
        teamId,
        isDefault: false,
      });
      mockPresetRepository.remove.mockResolvedValue({});

      await service.delete(teamId, presetId);
      expect(mockPresetRepository.remove).toHaveBeenCalled();
    });

    it('should fail if preset is default', async () => {
      const teamId = 'team-id';
      const presetId = 'preset-id';

      mockPresetRepository.findOne.mockResolvedValue({
        id: presetId,
        teamId,
        isDefault: true,
      });

      await expect(service.delete(teamId, presetId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
