import {
  checkTacticRequirement,
  isTeamTacticCode,
  PlayerEntity,
  TacticsPresetEntity,
  TeamTacticCode,
} from '@goalxi/database';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreatePresetReqDto } from './dto/create-preset.req.dto';
import { PresetResDto } from './dto/preset.res.dto';
import { UpdatePresetReqDto } from './dto/update-preset.req.dto';
import { LineupValidator } from './validators/lineup.validator';

@Injectable()
export class PresetService {
  constructor(
    @InjectRepository(TacticsPresetEntity)
    private readonly presetRepository: Repository<TacticsPresetEntity>,
    @InjectRepository(PlayerEntity)
    private readonly playerRepository: Repository<PlayerEntity>,
  ) {}

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
      select: ['id', 'isGoalkeeper'],
    });
    const teamPlayerIds = teamPlayers.map((p) => p.id);

    // Build the playerId -> isGoalkeeper map so the validator can reject a
    // non-GK player in the GK slot, GKs on the pitch, etc. Without this the
    // create path only ran the membership/slot checks and silently accepted
    // any player in the GK position.
    const playerRoles = new Map<string, boolean>();
    for (const p of teamPlayers) {
      playerRoles.set(String(p.id), p.isGoalkeeper);
    }

    const validation = LineupValidator.validate(
      dto.lineup,
      teamPlayerIds,
      playerRoles,
    );
    if (!validation.valid) {
      throw new BadRequestException(validation.errors.join(', '));
    }

    // A preset that carries a team tactic must be able to field it. Without
    // this the requirement would only surface later, when the preset is
    // applied to an actual match — the player would save a preset that can
    // never be used, with nothing to tell them why.
    this.assertTacticSatisfied(
      dto.teamTactic,
      this.normaliseLineup(dto.lineup),
    );

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
      // Persist into the v2 (int-keyed) columns. The legacy jsonb columns
      // are placeholders after the `TacticsPresetLineupToInt` migration and
      // don't hold valid player refs anymore.
      lineup: {} as Record<string, never>,
      lineupV2: this.normaliseLineup(dto.lineup),
      instructions: dto.instructions || null,
      substitutions: null,
      substitutionsV2: this.normaliseSubstitutions(dto.substitutions),
      // The three tactical parameters. A preset is a complete tactical
      // snapshot, so unset dimensions fall back to the same defaults
      // `match_tactics` uses rather than to NULL.
      pitchWidth: dto.pitchWidth || 'balanced',
      defensiveLine: dto.defensiveLine || 'mid',
      teamTactic: dto.teamTactic ?? null,
      isDefault: dto.isDefault || false,
    } as Partial<TacticsPresetEntity>);

    const savedPreset = await this.presetRepository.save(
      preset as TacticsPresetEntity,
    );

    return this.mapToResDto(savedPreset as TacticsPresetEntity);
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
        select: ['id', 'isGoalkeeper'],
      });
      const teamPlayerIds = teamPlayers.map((p) => p.id);

      // Build the playerId -> isGoalkeeper map so the validator can catch
      // GK-on-outfield-slot and outfield-in-GK mistakes.
      const playerRoles = new Map<string, boolean>();
      for (const p of teamPlayers) {
        playerRoles.set(String(p.id), p.isGoalkeeper);
      }

      const validation = LineupValidator.validate(
        dto.lineup,
        teamPlayerIds,
        playerRoles,
      );
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
    // Re-apply v2 normalisation on every update so the int-keyed columns
    // stay in sync regardless of what `Object.assign` wrote to the legacy
    // placeholder columns. This keeps `create` and `update` symmetric.
    if (dto.lineup) {
      preset.lineup = {} as Record<string, never>;
      preset.lineupV2 = this.normaliseLineup(dto.lineup);
    }
    if (dto.substitutions) {
      preset.substitutions = null;
      preset.substitutionsV2 = this.normaliseSubstitutions(dto.substitutions);
    }
    // The three tactical parameters. Explicit per-field guards rather than
    // relying on `Object.assign`: an absent key must leave the stored value
    // alone, and only `teamTactic` treats `null` as a value.
    if (dto.pitchWidth) preset.pitchWidth = dto.pitchWidth;
    if (dto.defensiveLine) preset.defensiveLine = dto.defensiveLine;
    if (dto.teamTactic !== undefined) preset.teamTactic = dto.teamTactic;

    // Validate against the RESULTING preset, not the request: either half of
    // the pair can change independently (add a tactic without touching the
    // lineup, or reshuffle the lineup of a preset that already has one).
    this.assertTacticSatisfied(
      isTeamTacticCode(preset.teamTactic) ? preset.teamTactic : null,
      preset.lineupV2 ?? this.normaliseLineup(dto.lineup),
    );

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
    // Same v2-with-legacy-fallback policy as MatchService.mapTacticsToResDto:
    // prefer the int-keyed v2 columns; fall back to the legacy jsonb only
    // for rows that somehow predate the migration (none should exist after
    // `TacticsPresetLineupToInt` ran, but keep the guard for safety).
    const lineup =
      preset.lineupV2 && Object.keys(preset.lineupV2).length > 0
        ? preset.lineupV2
        : ((preset.lineup as Record<string, number>) ?? {});

    const substitutions =
      preset.substitutionsV2 && preset.substitutionsV2.length > 0
        ? preset.substitutionsV2
        : ((preset.substitutions as Array<{
            minute: number;
            out: number;
            in: number;
          }> | null) ?? null);

    return {
      id: preset.id,
      teamId: preset.teamId,
      name: preset.name,
      isDefault: preset.isDefault,
      formation: preset.formation,
      lineup,
      instructions: preset.instructions,
      substitutions,
      pitchWidth: preset.pitchWidth as PresetResDto['pitchWidth'],
      defensiveLine: preset.defensiveLine as PresetResDto['defensiveLine'],
      // Unknown codes (e.g. a tactic later removed from the enum) read as
      // "no tactic" rather than being handed to a client that cannot type
      // them — the engine resolves them to the neutral style anyway.
      teamTactic: isTeamTacticCode(preset.teamTactic)
        ? preset.teamTactic
        : null,
      createdAt: preset.createdAt,
      updatedAt: preset.updatedAt,
    };
  }

  /**
   * Reject a preset whose own lineup cannot field the team tactic it stores.
   *
   * Same hard gate as `MatchService.submitTactics`: satisfying 3 of 4 slots
   * is a 400, not a weakened tactic. `tactic` may be `null` / `undefined`
   * (no tactic), in which case there is nothing to check.
   */
  private assertTacticSatisfied(
    tactic: TeamTacticCode | null | undefined,
    lineup: Record<string, number>,
  ): void {
    if (!tactic) return;

    const check = checkTacticRequirement(tactic, Object.keys(lineup));
    if (check.ok) return;

    const missing = check.missing
      .map(
        (requirement) =>
          `${requirement.count} more ${requirement.families.join('/')}`,
      )
      .join(', ');
    throw new BadRequestException(
      `Lineup does not satisfy team tactic "${tactic}" — needs ${missing}`,
    );
  }

  /**
   * Coerce wire `lineup` (slot → playerId) into the int-keyed shape that
   * `tactics_preset.lineupV2` expects. Mirrors MatchService.normaliseLineup.
   */
  private normaliseLineup(
    lineup: Record<string, string | number | null | undefined> | undefined,
  ): Record<string, number> {
    if (!lineup) return {};
    const out: Record<string, number> = {};
    for (const [slot, raw] of Object.entries(lineup)) {
      if (raw === null || raw === undefined || raw === '') continue;
      const id =
        typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);
      if (Number.isFinite(id)) out[slot] = id;
    }
    return out;
  }

  private normaliseSubstitutions(
    substitutions:
      | Array<{
          minute: number;
          out: string | number;
          in: string | number;
          condition?: string;
        }>
      | null
      | undefined,
  ):
    | Array<{ minute: number; out: number; in: number; condition?: string }>
    | undefined {
    if (!substitutions || substitutions.length === 0) return undefined;
    return substitutions.map((s) => ({
      minute: Number(s.minute),
      out:
        typeof s.out === 'number' ? s.out : Number.parseInt(String(s.out), 10),
      in: typeof s.in === 'number' ? s.in : Number.parseInt(String(s.in), 10),
      // Same condition-forwarding policy as MatchService. The DTO
      // already validates with @IsEnum(EventCondition); here we just
      // gate on the known set so a stale value can't poison the row.
      ...(s.condition &&
      [
        'always',
        'leading',
        'trailing',
        'tied',
        'notLeading',
        'notTrailing',
      ].includes(s.condition)
        ? { condition: s.condition }
        : {}),
    }));
  }
}
