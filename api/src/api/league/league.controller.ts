import { Uuid } from '@/common/types/common.type';
import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateLeagueReqDto } from './dto/create-league.req.dto';
import { LeagueStandingResDto } from './dto/league-standing.res.dto';
import { LeagueResDto } from './dto/league.res.dto';
import { ListLeagueReqDto } from './dto/list-league.req.dto';
import { UpdateLeagueReqDto } from './dto/update-league.req.dto';
import { LeagueService } from './league.service';

import { Public } from '@/decorators/public.decorator';

@ApiTags('League')
@Controller({
  path: 'leagues',
  version: '1',
})
export class LeagueController {
  constructor(private readonly leagueService: LeagueService) {}

  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  async findMany(@Query() query: ListLeagueReqDto) {
    return this.leagueService.findMany(query);
  }

  @Public()
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id') id: Uuid): Promise<LeagueResDto> {
    return this.leagueService.findOne(id);
  }

  @Public()
  @Get(':id/standings')
  @HttpCode(HttpStatus.OK)
  async getStandings(
    @Param('id') id: Uuid,
    @Query('season', new DefaultValuePipe(1), ParseIntPipe) season: number,
  ): Promise<LeagueStandingResDto[]> {
    return this.leagueService.getStandings(id, season);
  }

  @Public()
  @Get(':id/seasons')
  @HttpCode(HttpStatus.OK)
  // List of seasons (past + current) for which a league has at
  // least one standing row. Powers the season filter on the
  // league history page. Returns seasons sorted descending so
  // the FE's "select latest by default" UX is one line.
  async getPastSeasons(@Param('id') id: Uuid): Promise<{ season: number }[]> {
    return this.leagueService.getPastSeasons(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateLeagueReqDto): Promise<LeagueResDto> {
    return this.leagueService.create(dto);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id') id: Uuid,
    @Body() dto: UpdateLeagueReqDto,
  ): Promise<LeagueResDto> {
    return this.leagueService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: Uuid): Promise<void> {
    return this.leagueService.delete(id);
  }
}
