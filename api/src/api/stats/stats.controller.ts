import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { StatsService } from './stats.service';
import { MatchStatsResDto } from './dto/match-stats.res.dto';
import { TeamStatsResDto } from './dto/team-stats.res.dto';
import { AuthGuard } from '../../guards/auth.guard';

@Controller('stats')
@UseGuards(AuthGuard)
export class StatsController {
    constructor(private readonly statsService: StatsService) { }

    @Get('matches/:matchId')
    async getMatchStats(
        @Param('matchId') matchId: string,
    ): Promise<MatchStatsResDto> {
        return this.statsService.getMatchStats(matchId);
    }

    @Get('teams/:teamId/season/:season')
    async getTeamSeasonStats(
        @Param('teamId') teamId: string,
        @Param('season', ParseIntPipe) season: number,
    ): Promise<TeamStatsResDto> {
        return this.statsService.getTeamSeasonStats(teamId, season);
    }
}
