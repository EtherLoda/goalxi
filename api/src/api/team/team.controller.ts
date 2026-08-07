import { Uuid } from '@/common/types/common.type';
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateTeamReqDto } from './dto/create-team.req.dto';
import { ListTeamReqDto } from './dto/list-team.req.dto';
import { TeamResDto } from './dto/team.res.dto';
import { UpdateTeamReqDto } from './dto/update-team.req.dto';
import { TeamService } from './team.service';

import { CurrentUser } from '@/decorators/current-user.decorator';
import { Public } from '@/decorators/public.decorator';
import { BenchConfig } from '@goalxi/database';

@ApiTags('Team')
@Controller({
  path: 'teams',
  version: '1',
})
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  async findMany(@Query() query: ListTeamReqDto) {
    return this.teamService.findMany(query);
  }

  @Public()
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id') id: string): Promise<TeamResDto> {
    return this.teamService.findOne(id);
  }

  @Get('user/:userId')
  @HttpCode(HttpStatus.OK)
  async findByUserId(
    @Param('userId') userId: Uuid,
  ): Promise<TeamResDto | null> {
    return this.teamService.findByUserId(userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateTeamReqDto): Promise<TeamResDto> {
    return this.teamService.create(dto);
  }

  /**
   * Update the team owned by the current user. Resolves the team
   * from the JWT (`CurrentUser('id')`) so the frontend doesn't
   * have to know its own teamId.
   *
   * Used by the post-onboarding "name your club" step and (later)
   * by the team settings page. Accepts the same `UpdateTeamReqDto`
   * as the admin `/teams/:id` route so adding new editable fields
   * (city, jersey colors, logo, ...) doesn't require a new
   * endpoint.
   */
  @Patch('me')
  @HttpCode(HttpStatus.OK)
  async updateMyTeam(
    @CurrentUser('id') userId: Uuid,
    @Body() dto: UpdateTeamReqDto,
  ): Promise<TeamResDto> {
    return this.teamService.updateByUserId(userId, dto);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id') id: Uuid,
    @Body() dto: UpdateTeamReqDto,
    @CurrentUser('id') userId: Uuid,
  ): Promise<TeamResDto> {
    // Ownership check: a team can only be updated by its own
    // manager. The previous version of this handler accepted
    // any authenticated caller's request, which is the same
    // "any user can rename any team" hole that landed the
    // old `POST /teams/:id/apply`. Keep the path alive for
    // future admin tooling (add a RolesGuard(ADMIN) bypass
    // if you re-introduce that), but the plain authenticated
    // path is now owner-only.
    const owned = await this.teamService.isOwnedBy(id, userId);
    if (!owned) {
      throw new ForbiddenException('You can only update your own team');
    }
    return this.teamService.update(id, dto);
  }

  @Patch(':id/bench-config')
  @HttpCode(HttpStatus.OK)
  async updateBenchConfig(
    @Param('id') id: Uuid,
    @Body() body: { benchConfig: BenchConfig },
  ): Promise<TeamResDto> {
    return this.teamService.updateBenchConfig(id, body.benchConfig);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: Uuid): Promise<void> {
    return this.teamService.delete(id);
  }

  // GET /teams/available has been removed.
  //
  // The onboarding flow is now "register → wait for the worker
  // → land on dashboard" — there is no user-facing "browse
  // available BOT teams" page. The matching
  // `TeamService.listAvailableBotTeams` method is kept as a
  // building block for future admin tooling but no HTTP route
  // is wired to it.

  // POST /teams/:id/apply has been removed.
  //
  // The endpoint used to be @Public() and took a `userId` in the
  // body — which let any unauthenticated caller "gift" a BOT
  // team to any user. The replacement is the auth-gated
  // `POST /onboarding/claim` (see `api/src/api/onboarding/`)
  // which kicks off the same claim work asynchronously and
  // uses the JWT identity, not a body field, to decide who
  // gets the team.
  //
  // The `TeamService.applyForTakeover` method has been kept
  // (commented out where it lives) for now in case a future
  // admin tool needs an explicit takeover — but no HTTP route
  // is wired to it. Add it back deliberately if you do.
}
