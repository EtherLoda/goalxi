import {
  PlayerEntity,
  TacticsPresetEntity,
  TeamTacticCode,
} from '@goalxi/database';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CreatePresetReqDto } from './dto/create-preset.req.dto';
import { PresetService } from './preset.service';
import { DefensiveLine, PitchWidth, Tempo } from './types/tactical-dimensions';

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
    // Clear call history (implementations are re-installed per describe
    // block below) so `not.toHaveBeenCalled()` assertions are local to the
    // test that makes them.
    jest.clearAllMocks();

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

  describe('tactical parameters', () => {
    // Families: CBL+CB → CB×2, LB+RB → FB×2, DMFL → DM, CML → CM,
    // CAML → AM, LW+RW → W×2, CF → CF. Satisfies 防守反击 and 双翼齐飞,
    // but NOT 中路渗透 (needs CM×2, has CM×1).
    const lineup = {
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
    };

    const roster = Object.entries(lineup).map(([slot, id]) => ({
      id,
      isGoalkeeper: slot === 'GK',
    }));

    beforeEach(() => {
      mockPlayerRepository.find.mockResolvedValue(roster);
      mockPresetRepository.findOne.mockResolvedValue(null);
      mockPresetRepository.create.mockImplementation(
        (payload: Record<string, unknown>) => ({ id: 'preset-id', ...payload }),
      );
      mockPresetRepository.save.mockImplementation(
        (payload: Record<string, unknown>) => Promise.resolve(payload),
      );
    });

    it('stores all four parameters when they are supplied', async () => {
      const dto: CreatePresetReqDto = {
        name: 'Wings',
        formation: '4-4-2',
        lineup,
        tempo: Tempo.FAST,
        pitchWidth: PitchWidth.WIDE,
        defensiveLine: DefensiveLine.HIGH,
        teamTactic: TeamTacticCode.WINGS,
      };

      const result = await service.create('team-id', dto);

      expect(result.tempo).toBe(Tempo.FAST);
      expect(result.pitchWidth).toBe(PitchWidth.WIDE);
      expect(result.defensiveLine).toBe(DefensiveLine.HIGH);
      expect(result.teamTactic).toBe(TeamTacticCode.WINGS);
    });

    it('uses the neutral values when the parameters are omitted', async () => {
      const dto: CreatePresetReqDto = {
        name: 'Plain',
        formation: '4-4-2',
        lineup,
      };

      const result = await service.create('team-id', dto);

      expect(result.tempo).toBe(Tempo.BALANCED);
      expect(result.pitchWidth).toBe(PitchWidth.BALANCED);
      expect(result.defensiveLine).toBe(DefensiveLine.MID);
      expect(result.teamTactic).toBeNull();
    });

    it('rejects a tactic the preset lineup cannot field', async () => {
      const dto: CreatePresetReqDto = {
        name: 'Broken',
        formation: '4-4-2',
        lineup,
        teamTactic: TeamTacticCode.CENTRAL,
      };

      await expect(service.create('team-id', dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPresetRepository.save).not.toHaveBeenCalled();
    });

    it('leaves stored parameters alone when an update omits them', async () => {
      mockPresetRepository.findOne.mockResolvedValue({
        id: 'preset-id',
        teamId: 'team-id',
        name: 'Wings',
        isDefault: false,
        tempo: Tempo.FAST,
        pitchWidth: PitchWidth.WIDE,
        defensiveLine: DefensiveLine.HIGH,
        teamTactic: TeamTacticCode.WINGS,
        lineupV2: lineup,
      });

      const result = await service.update('team-id', 'preset-id', {
        isDefault: false,
      });

      expect(result.tempo).toBe(Tempo.FAST);
      expect(result.pitchWidth).toBe(PitchWidth.WIDE);
      expect(result.defensiveLine).toBe(DefensiveLine.HIGH);
      expect(result.teamTactic).toBe(TeamTacticCode.WINGS);
    });

    it('clears the team tactic when null is sent explicitly', async () => {
      mockPresetRepository.findOne.mockResolvedValue({
        id: 'preset-id',
        teamId: 'team-id',
        name: 'Wings',
        isDefault: false,
        tempo: Tempo.FAST,
        pitchWidth: PitchWidth.WIDE,
        defensiveLine: DefensiveLine.HIGH,
        teamTactic: TeamTacticCode.WINGS,
        lineupV2: lineup,
      });

      const result = await service.update('team-id', 'preset-id', {
        teamTactic: null,
      });

      expect(result.teamTactic).toBeNull();
      // The other three survive a tactics-only edit.
      expect(result.tempo).toBe(Tempo.FAST);
    });

    it('rejects an update whose new lineup cannot field the stored tactic', async () => {
      mockPresetRepository.findOne.mockResolvedValue({
        id: 'preset-id',
        teamId: 'team-id',
        name: 'Wings',
        isDefault: false,
        tempo: Tempo.BALANCED,
        pitchWidth: PitchWidth.BALANCED,
        defensiveLine: DefensiveLine.MID,
        teamTactic: TeamTacticCode.WINGS,
        lineupV2: lineup,
      });

      // Drop both wingers: 双翼齐飞 needs W×2.
      const wingless: Record<string, number> = { ...lineup };
      delete wingless['LW'];
      delete wingless['RW'];
      wingless['CM'] = 1012;
      wingless['CMR'] = 1013;

      mockPlayerRepository.find.mockResolvedValue([
        ...roster,
        { id: 1012, isGoalkeeper: false },
        { id: 1013, isGoalkeeper: false },
      ]);

      await expect(
        service.update('team-id', 'preset-id', { lineup: wingless }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPresetRepository.save).not.toHaveBeenCalled();
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
