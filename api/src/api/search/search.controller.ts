import { Public } from '@/decorators/public.decorator';
import { Controller, Get, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  SearchLeaguesReqDto,
  SearchPlayersReqDto,
  SearchTeamsReqDto,
} from './dto/search.dto';
import { SearchService } from './search.service';

@ApiTags('Search')
@Controller({
  path: 'search',
  version: '1',
})
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Public()
  @Get('teams')
  @HttpCode(HttpStatus.OK)
  async searchTeams(@Query() query: SearchTeamsReqDto) {
    return this.searchService.searchTeams(query);
  }

  @Public()
  @Get('players')
  @HttpCode(HttpStatus.OK)
  async searchPlayers(@Query() query: SearchPlayersReqDto) {
    return this.searchService.searchPlayers(query);
  }

  @Public()
  @Get('leagues')
  @HttpCode(HttpStatus.OK)
  async searchLeagues(@Query() query: SearchLeaguesReqDto) {
    return this.searchService.searchLeagues(query);
  }
}
