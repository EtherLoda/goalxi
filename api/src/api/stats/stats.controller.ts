import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../guards/auth.guard';
import { MatchStatsResDto } from './dto/match-stats.res.dto';
import { TeamStatsResDto } from './dto/team-stats.res.dto';
import { StatsService } from './stats.service';
import { LeaderboardResDto } from './dto/leaderboard.res.dto';

import { Public } from '@/decorators/public.decorator';

@Controller({
  path: 'stats',
  version: '1',
})
@UseGuards(AuthGuard)
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Public()
  @Get('matches/:matchId')
  async getMatchStats(
    @Param('matchId') matchId: string,
  ): Promise<MatchStatsResDto> {
    return this.statsService.getMatchStats(matchId);
  }

  @Public()
  @Get('teams/:teamId/season/:season')
  async getTeamSeasonStats(
    @Param('teamId') teamId: string,
    @Param('season', ParseIntPipe) season: number,
  ): Promise<TeamStatsResDto> {
    return this.statsService.getTeamSeasonStats(teamId, season);
  }

  @Public()
  @Get('leaderboard/:leagueId/:type')
  async getLeaderboard(
    @Param('leagueId') leagueId: string,
    @Param('type') type: 'goals' | 'assists' | 'tackles',
    @Query('season', ParseIntPipe) season: number,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ): Promise<LeaderboardResDto> {
    return this.statsService.getLeaderboard(
      leagueId,
      season,
      type,
      limit ?? 10,
      offset ?? 0,
    );
  }

  @Public()
  @Get('player/:playerId/competition')
  async getPlayerCompetitionStats(
    @Param('playerId') playerId: string,
    @Query('leagueId') leagueId: string,
    @Query('season', ParseIntPipe) season: number,
  ) {
    return this.statsService.getPlayerCompetitionStats(playerId, leagueId, season);
  }
}
