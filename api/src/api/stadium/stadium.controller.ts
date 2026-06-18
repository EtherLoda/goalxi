import { Uuid } from '@/common/types/common.type';
import { Public } from '@/decorators/public.decorator';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RenameStadiumReqDto } from './dto/rename-stadium.req.dto';
import {
  AdjustSeatsReqDto,
  BuildStadiumReqDto,
  ResizeStadiumReqDto,
} from './dto/stadium.req.dto';
import { StadiumService } from './stadium.service';

@ApiTags('Stadium')
@Controller({
  path: 'teams/:teamId/stadium',
  version: '1',
})
export class StadiumController {
  constructor(private readonly stadiumService: StadiumService) {}

  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  async getStadium(@Param('teamId') teamId: Uuid) {
    return this.stadiumService.getByTeamId(teamId);
  }

  // §5.3 球场摘要 (容量 + 预估收入 + 平均上座率)
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
  ) {
    return this.stadiumService.rename(teamId, dto.name);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async buildStadium(
    @Param('teamId') teamId: Uuid,
    @Body() dto: BuildStadiumReqDto,
  ) {
    return this.stadiumService.build(teamId, dto);
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  async resizeStadium(
    @Param('teamId') teamId: Uuid,
    @Body() dto: ResizeStadiumReqDto,
  ) {
    return this.stadiumService.resize(teamId, dto);
  }

  // §5 Stadium — 增量扩/缩座位(按 delta 符号路由)
  @Patch('seats')
  @HttpCode(HttpStatus.OK)
  async adjustSeats(
    @Param('teamId') teamId: Uuid,
    @Body() dto: AdjustSeatsReqDto,
  ) {
    if (dto.delta > 0) {
      const result = await this.stadiumService.expandSeats(teamId, dto.delta);
      return { action: 'expand', ...result };
    }
    const result = await this.stadiumService.demolishSeats(
      teamId,
      Math.abs(dto.delta),
    );
    return { action: 'demolish', ...result };
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  async demolishStadium(@Param('teamId') teamId: Uuid) {
    return this.stadiumService.demolish(teamId);
  }
}