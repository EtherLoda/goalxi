import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Put,
    Query,
    UseGuards,
} from '@nestjs/common';
import { MatchService } from './match.service';
import { PresetService } from './preset.service';
import { CreateMatchReqDto } from './dto/create-match.req.dto';
import { UpdateMatchReqDto } from './dto/update-match.req.dto';
import { ListMatchesReqDto } from './dto/list-matches.req.dto';
import { MatchResDto } from './dto/match.res.dto';
import { MatchListResDto } from './dto/match-list.res.dto';
import { SubmitTacticsReqDto } from './dto/submit-tactics.req.dto';
import { TacticsResDto } from './dto/tactics.res.dto';
import { CreatePresetReqDto } from './dto/create-preset.req.dto';
import { UpdatePresetReqDto } from './dto/update-preset.req.dto';
import { PresetResDto } from './dto/preset.res.dto';
import { CurrentUser } from '@/decorators/current-user.decorator';
import { JwtPayloadType } from '@/api/auth/types/jwt-payload.type';
import { AuthGuard } from '@/guards/auth.guard';
import { MatchEventService } from './match-event.service';

import { Public } from '@/decorators/public.decorator';

@Controller({
    path: 'matches',
    version: '1',
})
@UseGuards(AuthGuard)
export class MatchController {
    constructor(
        private readonly matchService: MatchService,
        private readonly presetService: PresetService,
        private readonly matchEventService: MatchEventService,
    ) { }

    // ==================== Match Endpoints ====================

    @Public()
    @Get()
    async listMatches(@Query() filters: ListMatchesReqDto): Promise<MatchListResDto> {
        return this.matchService.findAll(filters);
    }

    @Public()
    @Get(':id')
    async getMatch(@Param('id') id: string): Promise<MatchResDto> {
        return this.matchService.findOne(id);
    }

    @Post()
    // TODO: Add AdminGuard
    async createMatch(@Body() dto: CreateMatchReqDto): Promise<MatchResDto> {
        return this.matchService.create(dto);
    }

    @Patch(':id')
    // TODO: Add AdminGuard
    async updateMatch(
        @Param('id') id: string,
        @Body() dto: UpdateMatchReqDto,
    ): Promise<MatchResDto> {
        return this.matchService.update(id, dto);
    }

    @Delete(':id')
    // TODO: Add AdminGuard
    async deleteMatch(@Param('id') id: string): Promise<void> {
        return this.matchService.delete(id);
    }

    // ==================== Event Delivery Endpoints ====================

    @Public()
    @Get(':matchId/events')
    async getMatchEvents(
        @Param('matchId') matchId: string,
        @CurrentUser() user?: JwtPayloadType,
    ) {
        return this.matchEventService.getMatchEvents(matchId, user?.id);
    }

    // ==================== Tactics Endpoints ====================

    @Get(':matchId/tactics')
    async getTactics(
        @Param('matchId') matchId: string,
        @CurrentUser() user: JwtPayloadType,
    ): Promise<{ homeTactics: TacticsResDto | null; awayTactics: TacticsResDto | null }> {
        return this.matchService.getTactics(matchId, user.id);
    }

    @Post(':matchId/tactics')
    async submitTactics(
        @Param('matchId') matchId: string,
        @Body() dto: SubmitTacticsReqDto,
        @CurrentUser() user: JwtPayloadType,
    ): Promise<TacticsResDto> {
        await this.matchService.validateTeamOwnership(user.id, dto.teamId);
        return this.matchService.submitTactics(matchId, dto.teamId, dto);
    }

    @Put(':matchId/tactics')
    async updateTactics(
        @Param('matchId') matchId: string,
        @Body() dto: SubmitTacticsReqDto,
        @CurrentUser() user: JwtPayloadType,
    ): Promise<TacticsResDto> {
        await this.matchService.validateTeamOwnership(user.id, dto.teamId);
        return this.matchService.submitTactics(matchId, dto.teamId, dto);
    }

    // ==================== Preset Endpoints ====================

    @Get('teams/:teamId/presets')
    async listPresets(
        @Param('teamId') teamId: string,
        @CurrentUser() user: JwtPayloadType,
    ): Promise<PresetResDto[]> {
        await this.matchService.validateTeamOwnership(user.id, teamId);
        return this.presetService.findAll(teamId);
    }

    @Get('teams/:teamId/presets/:presetId')
    async getPreset(
        @Param('teamId') teamId: string,
        @Param('presetId') presetId: string,
        @CurrentUser() user: JwtPayloadType,
    ): Promise<PresetResDto> {
        await this.matchService.validateTeamOwnership(user.id, teamId);
        return this.presetService.findOne(teamId, presetId);
    }

    @Post('teams/:teamId/presets')
    async createPreset(
        @Param('teamId') teamId: string,
        @Body() dto: CreatePresetReqDto,
        @CurrentUser() user: JwtPayloadType,
    ): Promise<PresetResDto> {
        await this.matchService.validateTeamOwnership(user.id, teamId);
        return this.presetService.create(teamId, dto);
    }

    @Put('teams/:teamId/presets/:presetId')
    async updatePreset(
        @Param('teamId') teamId: string,
        @Param('presetId') presetId: string,
        @Body() dto: UpdatePresetReqDto,
        @CurrentUser() user: JwtPayloadType,
    ): Promise<PresetResDto> {
        await this.matchService.validateTeamOwnership(user.id, teamId);
        return this.presetService.update(teamId, presetId, dto);
    }

    @Delete('teams/:teamId/presets/:presetId')
    async deletePreset(
        @Param('teamId') teamId: string,
        @Param('presetId') presetId: string,
        @CurrentUser() user: JwtPayloadType,
    ): Promise<void> {
        await this.matchService.validateTeamOwnership(user.id, teamId);
        return this.presetService.delete(teamId, presetId);
    }
}
