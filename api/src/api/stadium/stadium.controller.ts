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
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RenameStadiumReqDto } from './dto/rename-stadium.req.dto';
import { BuildStadiumReqDto, ResizeStadiumReqDto } from './dto/stadium.req.dto';
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

  // §5.3 球场摘要 (容量 + 预估收入)
  @Public()
  @Get('summary')
  @HttpCode(HttpStatus.OK)
  async getStadiumSummary(@Param('teamId') teamId: Uuid) {
    return this.stadiumService.getSummary(teamId);
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

  @Delete()
  @HttpCode(HttpStatus.OK)
  async demolishStadium(@Param('teamId') teamId: Uuid) {
    return this.stadiumService.demolish(teamId);
  }
}
