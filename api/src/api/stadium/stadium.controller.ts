import { Uuid } from '@/common/types/common.type';
import { CurrentUser } from '@/decorators/current-user.decorator';
import { Public } from '@/decorators/public.decorator';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RenameStadiumReqDto } from './dto/rename-stadium.req.dto';
import { StartConstructionReqDto } from './dto/start-construction.req.dto';
import { StadiumConstructionService } from './stadium-construction.service';
import { StadiumService } from './stadium.service';

/**
 * §5 Stadium.
 *
 * READ endpoints are `@Public()` — a club's capacity and attendance are
 * public facts, and the club page shows them to visitors.
 *
 * WRITE endpoints are deliberately limited to the construction queue.
 * The stadium used to expose three additional instant writers
 * (`POST /stadium` build, `DELETE /stadium` demolish, `PATCH /stadium/seats`
 * expand/demolish) which charged the same 50/seat as the queue but applied
 * immediately — strictly better than waiting N weeks, so any client could
 * bypass construction time entirely. The frontend had already stopped
 * calling them; they are gone rather than merely unused.
 */
@ApiTags('Stadium')
@Controller({
  path: 'teams/:teamId/stadium',
  version: '1',
})
export class StadiumController {
  constructor(
    private readonly stadiumService: StadiumService,
    private readonly constructionService: StadiumConstructionService,
  ) {}

  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  async getStadium(@Param('teamId') teamId: Uuid) {
    return this.stadiumService.getByTeamId(teamId);
  }

  // §5.3 球场摘要 (容量 + 收入区间 + 平均上座率)
  @Public()
  @Get('summary')
  @HttpCode(HttpStatus.OK)
  async getStadiumSummary(@Param('teamId') teamId: Uuid) {
    return this.stadiumService.getSummary(teamId);
  }

  // §5 Stadium — 最近主场比赛(含 attendance),供场馆页「最近比赛」区块使用
  @Public()
  @Get('recent-matches')
  @HttpCode(HttpStatus.OK)
  async getRecentHomeMatches(
    @Param('teamId') teamId: Uuid,
    @Query('limit') limit?: string,
  ) {
    const parsed = limit ? Number.parseInt(limit, 10) : 6;
    const safeLimit =
      Number.isFinite(parsed) && parsed > 0 ? Math.min(20, parsed) : 6;
    return this.stadiumService.getRecentHomeMatches(teamId, safeLimit);
  }

  // §5.3 重命名球场
  @Patch()
  @HttpCode(HttpStatus.OK)
  async renameStadium(
    @Param('teamId') teamId: Uuid,
    @Body() dto: RenameStadiumReqDto,
    @CurrentUser('id') userId: Uuid,
  ) {
    return this.stadiumService.rename(teamId, dto.name, userId);
  }

  // §5 Stadium — Time-based construction queue.
  // List active + recently completed projects for a team (Stadium page UI).
  @Get('constructions')
  @HttpCode(HttpStatus.OK)
  async listConstructions(@Param('teamId') teamId: Uuid) {
    return this.constructionService.listForTeam(teamId);
  }

  // §5 Stadium — Queue a new expand or demolish project.
  // Funds are deducted immediately for EXPAND; DEMOLISH refund is recorded on
  // completion by the settlement processor.
  @Post('constructions')
  @HttpCode(HttpStatus.CREATED)
  async startConstruction(
    @Param('teamId') teamId: Uuid,
    @Body() dto: StartConstructionReqDto,
    @CurrentUser('id') userId: Uuid,
  ) {
    return this.constructionService.start(teamId, dto.kind, dto.delta, userId);
  }
}
