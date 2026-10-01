import { JwtPayloadType } from '@/api/auth/types/jwt-payload.type';
import { CurrentUser } from '@/decorators/current-user.decorator';
import { Public } from '@/decorators/public.decorator';
import { Roles } from '@/decorators/roles.decorator';
import { AuthGuard } from '@/guards/auth.guard';
import { RolesGuard } from '@/guards/roles.guard';
import { UserRole } from '@goalxi/database';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CreateMatchReqDto } from './dto/create-match.req.dto';
import { CreatePresetReqDto } from './dto/create-preset.req.dto';
import { ListMatchesReqDto } from './dto/list-matches.req.dto';
import { MatchListResDto } from './dto/match-list.res.dto';
import { MatchResDto } from './dto/match.res.dto';
import { PresetResDto } from './dto/preset.res.dto';
import { SubmitTacticsReqDto } from './dto/submit-tactics.req.dto';
import { TacticsResDto } from './dto/tactics.res.dto';
import { UpdateMatchReqDto } from './dto/update-match.req.dto';
import { UpdatePresetReqDto } from './dto/update-preset.req.dto';
import { MatchEventService } from './match-event.service';
import { MatchService } from './match.service';
import { PresetService } from './preset.service';

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
  ) {}

  // ==================== Match Endpoints ====================

  @Public()
  @Get()
  async listMatches(
    @Query() filters: ListMatchesReqDto,
  ): Promise<MatchListResDto> {
    return this.matchService.findAll(filters);
  }

  // ==================== Simulation Endpoint (must be before :id) ====================

  @Public()
  @Post(':matchId/simulate')
  async triggerSimulation(
    // `ParseUUIDPipe` rejects non-uuid matchId params
    // with a 400 BEFORE the SQL query — the pre-fix code
    // passed `"synthetic-id"` (a Playwright test placeholder)
    // straight to the DB and got a 500 from PG's uuid
    // parser. A 400 is what a manual `curl /matches/foo`
    // by a curious user would surface anyway, and it's
    // the right code for the FE's tactics-editor test that
    // drives this URL with a non-uuid.
    @Param('matchId', ParseUUIDPipe) matchId: string,
  ) {
    return this.matchService.queueSimulation(matchId);
  }

  // ==================== Event Delivery Endpoints (must be before :id) ====================

  @Public()
  @Get(':matchId/events')
  async getMatchEvents(
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @CurrentUser() user?: JwtPayloadType,
  ) {
    return this.matchEventService.getMatchEvents(matchId, user?.id);
  }

  // ==================== Generic Match CRUD (must be after specific routes) ====================

  @Public()
  @Get(':id')
  async getMatch(@Param('id', ParseUUIDPipe) id: string): Promise<MatchResDto> {
    return this.matchService.findOne(id);
  }

  @Post()
  // Admin-only: creating a match affects fixtures and triggers
  // simulation jobs. Previously `@Public` + a TODO — that meant any
  // logged-in user could mint a match against any two teams.
  @Roles(UserRole.ADMIN)
  @UseGuards(AuthGuard, RolesGuard)
  async createMatch(@Body() dto: CreateMatchReqDto): Promise<MatchResDto> {
    return this.matchService.create(dto);
  }

  @Patch(':id')
  // Admin-only: changing scheduledAt / score on an existing match
  // would let an attacker rewrite history. Was `@Public` before.
  @Roles(UserRole.ADMIN)
  @UseGuards(AuthGuard, RolesGuard)
  async updateMatch(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMatchReqDto,
  ): Promise<MatchResDto> {
    return this.matchService.update(id, dto);
  }

  @Delete(':id')
  // Admin-only: deleting a non-scheduled match would orphan its events
  // and the simulator's lock. Was unguarded before.
  @Roles(UserRole.ADMIN)
  @UseGuards(AuthGuard, RolesGuard)
  async deleteMatch(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.matchService.delete(id);
  }

  // ==================== Tactics Endpoints ====================

  @Get(':matchId/tactics')
  // Authenticated. The service layer filters which side of the
  // tactics to expose based on team ownership / admin role — see
  // `MatchService.getTactics`. Was `@Public` + a TODO before.
  async getTactics(
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @CurrentUser() user: JwtPayloadType,
  ): Promise<{
    homeTactics: TacticsResDto | null;
    awayTactics: TacticsResDto | null;
  }> {
    return this.matchService.getTactics(matchId, user);
  }

  @Post(':matchId/tactics')
  // The caller MUST own `dto.teamId`. Admins are also allowed.
  // Previously `@Public` + commented-out `validateTeamOwnership` —
  // any logged-in user could submit tactics for any team.
  async submitTactics(
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Body() dto: SubmitTacticsReqDto,
    @CurrentUser() user: JwtPayloadType,
  ): Promise<TacticsResDto> {
    if (user.role !== UserRole.ADMIN) {
      await this.matchService.validateTeamOwnership(user.id, dto.teamId);
    }
    return this.matchService.submitTactics(matchId, dto.teamId, dto);
  }

  @Put(':matchId/tactics')
  // Same ownership rule as POST.
  async updateTactics(
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Body() dto: SubmitTacticsReqDto,
    @CurrentUser() user: JwtPayloadType,
  ): Promise<TacticsResDto> {
    if (user.role !== UserRole.ADMIN) {
      await this.matchService.validateTeamOwnership(user.id, dto.teamId);
    }
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
