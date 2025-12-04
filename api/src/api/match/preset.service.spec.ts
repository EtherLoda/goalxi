import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TacticsPresetEntity, PlayerEntity } from '@goalxi/database';
import { PresetService } from './preset.service';
import { CreatePresetReqDto } from './dto/create-preset.req.dto';
import { BadRequestException, NotFoundException } from '@nestjs/common';

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
                    GK: 'gk-id',
                    CB1: 'cb1-id',
                    CB2: 'cb2-id',
                    LB: 'lb-id',
                    RB: 'rb-id',
                    DMF1: 'dmf1-id',
                    CM1: 'cm1-id',
                    CAM1: 'cam1-id',
                    LW: 'lw-id',
                    RW: 'rw-id',
                    ST1: 'st1-id',
                },
            };

            mockPlayerRepository.find.mockResolvedValue([
                { id: 'gk-id' }, { id: 'cb1-id' }, { id: 'cb2-id' }, { id: 'lb-id' }, { id: 'rb-id' },
                { id: 'dmf1-id' }, { id: 'cm1-id' }, { id: 'cam1-id' }, { id: 'lw-id' }, { id: 'rw-id' }, { id: 'st1-id' },
            ]);

            mockPresetRepository.findOne.mockResolvedValue(null); // No existing name
            mockPresetRepository.create.mockReturnValue({ ...dto, id: 'preset-id', teamId });
            mockPresetRepository.save.mockResolvedValue({ ...dto, id: 'preset-id', teamId });

            const result = await service.create(teamId, dto);
            expect(result.id).toBe('preset-id');
        });

        it('should fail if name exists', async () => {
            const teamId = 'team-id';
            const dto: CreatePresetReqDto = {
                name: 'Existing Name',
                formation: '4-4-2',
                lineup: {
                    GK: 'gk-id',
                    CB1: 'cb1-id',
                    CB2: 'cb2-id',
                    LB: 'lb-id',
                    RB: 'rb-id',
                    DMF1: 'dmf1-id',
                    CM1: 'cm1-id',
                    CAM1: 'cam1-id',
                    LW: 'lw-id',
                    RW: 'rw-id',
                    ST1: 'st1-id',
                },
            };

            mockPlayerRepository.find.mockResolvedValue([
                { id: 'gk-id' }, { id: 'cb1-id' }, { id: 'cb2-id' }, { id: 'lb-id' }, { id: 'rb-id' },
                { id: 'dmf1-id' }, { id: 'cm1-id' }, { id: 'cam1-id' }, { id: 'lw-id' }, { id: 'rw-id' }, { id: 'st1-id' },
            ]);

            mockPresetRepository.findOne.mockResolvedValue({ id: 'existing-id' });

            await expect(service.create(teamId, dto)).rejects.toThrow(BadRequestException);
        });
    });

    describe('delete', () => {
        it('should delete a preset', async () => {
            const teamId = 'team-id';
            const presetId = 'preset-id';

            mockPresetRepository.findOne.mockResolvedValue({ id: presetId, teamId, isDefault: false });
            mockPresetRepository.remove.mockResolvedValue({});

            await service.delete(teamId, presetId);
            expect(mockPresetRepository.remove).toHaveBeenCalled();
        });

        it('should fail if preset is default', async () => {
            const teamId = 'team-id';
            const presetId = 'preset-id';

            mockPresetRepository.findOne.mockResolvedValue({ id: presetId, teamId, isDefault: true });

            await expect(service.delete(teamId, presetId)).rejects.toThrow(BadRequestException);
        });
    });
});
