import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TacticsPresetEntity, PlayerEntity } from '@goalxi/database';
import { Repository } from 'typeorm';
import { CreatePresetReqDto } from './dto/create-preset.req.dto';
import { UpdatePresetReqDto } from './dto/update-preset.req.dto';
import { PresetResDto } from './dto/preset.res.dto';
import { LineupValidator } from './validators/lineup.validator';

@Injectable()
export class PresetService {
    constructor(
        @InjectRepository(TacticsPresetEntity)
        private readonly presetRepository: Repository<TacticsPresetEntity>,
        @InjectRepository(PlayerEntity)
        private readonly playerRepository: Repository<PlayerEntity>,
    ) { }

    async findAll(teamId: string): Promise<PresetResDto[]> {
        const presets = await this.presetRepository.find({
            where: { teamId },
            order: { isDefault: 'DESC', createdAt: 'DESC' },
        });

        return presets.map((preset) => this.mapToResDto(preset));
    }

    async findOne(teamId: string, presetId: string): Promise<PresetResDto> {
        const preset = await this.presetRepository.findOne({
            where: { id: presetId, teamId },
        });

        if (!preset) {
            throw new NotFoundException(`Preset with ID ${presetId} not found`);
        }

        return this.mapToResDto(preset);
    }

    async create(teamId: string, dto: CreatePresetReqDto): Promise<PresetResDto> {
        // Validate lineup
        const teamPlayers = await this.playerRepository.find({
            where: { teamId },
            select: ['id'],
        });
        const teamPlayerIds = teamPlayers.map((p) => p.id);

        const validation = LineupValidator.validate(dto.lineup, teamPlayerIds);
        if (!validation.valid) {
            throw new BadRequestException(validation.errors.join(', '));
        }

        // Check name uniqueness
        const existingPreset = await this.presetRepository.findOne({
            where: { teamId, name: dto.name },
        });

        if (existingPreset) {
            throw new BadRequestException(
                `Preset with name "${dto.name}" already exists for this team`,
            );
        }

        // If isDefault is true, unset other defaults
        if (dto.isDefault) {
            await this.presetRepository.update(
                { teamId, isDefault: true },
                { isDefault: false },
            );
        }

        const preset = this.presetRepository.create({
            teamId,
            name: dto.name,
            formation: dto.formation,
            lineup: dto.lineup,
            instructions: dto.instructions || null,
            substitutions: dto.substitutions || null,
            isDefault: dto.isDefault || false,
        });

        const savedPreset = await this.presetRepository.save(preset);

        return this.mapToResDto(savedPreset);
    }

    async update(
        teamId: string,
        presetId: string,
        dto: UpdatePresetReqDto,
    ): Promise<PresetResDto> {
        const preset = await this.presetRepository.findOne({
            where: { id: presetId, teamId },
        });

        if (!preset) {
            throw new NotFoundException(`Preset with ID ${presetId} not found`);
        }

        // Validate lineup if provided
        if (dto.lineup) {
            const teamPlayers = await this.playerRepository.find({
                where: { teamId },
                select: ['id'],
            });
            const teamPlayerIds = teamPlayers.map((p) => p.id);

            const validation = LineupValidator.validate(dto.lineup, teamPlayerIds);
            if (!validation.valid) {
                throw new BadRequestException(validation.errors.join(', '));
            }
        }

        // Check name uniqueness if name is being changed
        if (dto.name && dto.name !== preset.name) {
            const existingPreset = await this.presetRepository.findOne({
                where: { teamId, name: dto.name },
            });

            if (existingPreset) {
                throw new BadRequestException(
                    `Preset with name "${dto.name}" already exists for this team`,
                );
            }
        }

        // If isDefault is being set to true, unset other defaults
        if (dto.isDefault && !preset.isDefault) {
            await this.presetRepository.update(
                { teamId, isDefault: true },
                { isDefault: false },
            );
        }

        Object.assign(preset, dto);

        const updatedPreset = await this.presetRepository.save(preset);

        return this.mapToResDto(updatedPreset);
    }

    async delete(teamId: string, presetId: string): Promise<void> {
        const preset = await this.presetRepository.findOne({
            where: { id: presetId, teamId },
        });

        if (!preset) {
            throw new NotFoundException(`Preset with ID ${presetId} not found`);
        }

        // Cannot delete default preset
        if (preset.isDefault) {
            throw new BadRequestException(
                'Cannot delete default preset. Set another preset as default first.',
            );
        }

        await this.presetRepository.remove(preset);
    }

    private mapToResDto(preset: TacticsPresetEntity): PresetResDto {
        return {
            id: preset.id,
            teamId: preset.teamId,
            name: preset.name,
            isDefault: preset.isDefault,
            formation: preset.formation,
            lineup: preset.lineup,
            instructions: preset.instructions,
            substitutions: preset.substitutions,
            createdAt: preset.createdAt,
            updatedAt: preset.updatedAt,
        };
    }
}
