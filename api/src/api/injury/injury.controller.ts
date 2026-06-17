import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  InjuryHistoryResDto,
  InjuryService,
  PlayerInjuryStatusResDto,
} from './injury.service';

@Controller({
  path: 'injuries',
  version: '1',
})
export class InjuryController {
  constructor(private readonly injuryService: InjuryService) {}

  /**
   * Get a player's injury history
   */
  @Get('player/:id/history')
  async getPlayerInjuryHistory(
    @Param('id', ParseUUIDPipe) playerId: string,
  ): Promise<InjuryHistoryResDto[]> {
    return this.injuryService.getPlayerInjuryHistory(playerId);
  }

  /**
   * Get all injured players for a team
   */
  @Get('team/:teamId/injured-players')
  async getTeamInjuredPlayers(
    @Param('teamId', ParseUUIDPipe) teamId: string,
  ): Promise<PlayerInjuryStatusResDto[]> {
    return this.injuryService.getTeamInjuredPlayers(teamId);
  }

  /**
   * Get recent injury history across the whole team (for the Medical Room).
   */
  @Get('team/:teamId/history')
  async getTeamInjuryHistory(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Query('limit') limit?: string,
    @Query('days') days?: string,
  ): Promise<InjuryHistoryResDto[]> {
    return this.injuryService.getTeamInjuryHistory(teamId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      days: days ? parseInt(days, 10) : undefined,
    });
  }
}
