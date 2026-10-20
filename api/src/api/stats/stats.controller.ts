import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../guards/auth.guard';
import { LeaderboardResDto } from './dto/leaderboard.res.dto';
import { MatchStatsResDto } from './dto/match-stats.res.dto';
import { PlayerMatchLogResDto } from './dto/player-match-log.res.dto';
import { PlayerSeasonStatsResDto } from './dto/player-season-stats.res.dto';
import { TeamStatsResDto } from './dto/team-stats.res.dto';
import { StatsService } from './stats.service';

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
    return this.statsService.getPlayerCompetitionStats(
      playerId,
      leagueId,
      season,
    );
  }

  // Career + every (league, season) row for a single player. The
  // single-season /stats/player/:id/competition route above is
  // kept for the FE's smaller per-season widgets; this one is the
  // full breakdown for the player page's stats card.
  @Public()
  @Get('player/:playerId/seasons')
  async getPlayerSeasonStats(
    @Param('playerId') playerId: string,
  ): Promise<PlayerSeasonStatsResDto> {
    return this.statsService.getPlayerSeasonStats(playerId);
  }

  /**
   * The player's match log, newest first.
   *
   * Derived from `match_event` — the only per-match, per-player record the
   * simulation writes. That means a match shows up when the player did
   * something recordable in it (goal, assist, card, injury, ...), not for a
   * silent 90 minutes. A true appearance log would have to project the
   * persisted lineups; until then this is what the profile can honestly show.
   */
  @Public()
  @Get('player/:playerId/matches')
  async getPlayerMatches(
    @Param('playerId', ParseIntPipe) playerId: number,
    @Query('limit') limit?: string,
    @Query('season') season?: string,
  ): Promise<PlayerMatchLogResDto> {
    const parsedLimit = limit === undefined ? 20 : Number(limit);
    return this.statsService.getPlayerMatches(playerId, {
      limit: Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 20,
      season: season === undefined ? undefined : Number(season),
    });
  }
}
