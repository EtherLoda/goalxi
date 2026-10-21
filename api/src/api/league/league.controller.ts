import { Uuid } from '@/common/types/common.type';
import {
  BadRequestException,
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
import { LeagueContextResDto } from './dto/league-context.res.dto';
import { LeagueStandingResDto } from './dto/league-standing.res.dto';
import { LeagueTeamStatusResDto } from './dto/league-team-status.res.dto';
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
  @Get(':id/context')
  @HttpCode(HttpStatus.OK)
  // The league's position in the pyramid plus its four neighbours.
  // Backs the header's "◀ 48 | 49 of 64 | 50 ▶" strip and the up/down
  // tier steps. Public: the league pages are readable logged out.
  async getContext(@Param('id') id: Uuid): Promise<LeagueContextResDto> {
    return this.leagueService.getContext(id);
  }

  @Public()
  @Get(':id/team-status')
  @HttpCode(HttpStatus.OK)
  // Squad condition for every club in the league: red cards this season,
  // current injuries, players on the market, and arrivals/departures inside
  // the transfer window. Backs the 球队状态 tab. Public for the same reason
  // the standings are.
  async getTeamStatus(
    @Param('id') id: Uuid,
    @Query('season') season?: string,
  ): Promise<LeagueTeamStatusResDto> {
    // Parsed by hand rather than with `ParseIntPipe({ optional: true })`:
    // that option is not honoured by this Nest version, so an absent
    // `?season=` was rejected with "numeric string is expected" — the
    // endpoint 400'd on its own default. An absent or empty value means
    // "whatever season is current", and anything else must be a real
    // season number.
    if (season === undefined || season === '') {
      return this.leagueService.getTeamStatus(id);
    }
    const parsed = Number(season);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new BadRequestException('season must be a positive integer');
    }
    return this.leagueService.getTeamStatus(id, parsed);
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
