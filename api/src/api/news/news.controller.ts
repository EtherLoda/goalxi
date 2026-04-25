import { Uuid } from '@/common/types/common.type';
import { AuthGuard } from '@/guards/auth.guard';
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LeagueNewsResDto } from './dto/league-news.res.dto';
import { NewsService } from './news.service';

@Controller({ path: 'news', version: '1' })
@ApiTags('News')
@ApiBearerAuth()
@UseGuards(AuthGuard)
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Get('league/:leagueId')
  @ApiOperation({
    summary:
      'Get recent news for a league (transfers, match results, prize money)',
  })
  async getLeagueNews(
    @Param('leagueId') leagueId: Uuid,
    @Query('season') season?: string,
    @Query('limit') limit?: string,
  ): Promise<LeagueNewsResDto> {
    return this.newsService.getLeagueNews(
      leagueId,
      season ? parseInt(season, 10) : undefined,
      limit ? parseInt(limit, 10) : 20,
    );
  }
}
