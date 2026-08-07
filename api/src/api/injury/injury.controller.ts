import { CurrentUser } from '@/decorators/current-user.decorator';
import { Uuid } from '@goalxi/database';
import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
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
   * Get a player's injury history. The player must belong to
   * the requesting user's team — see
   * `InjuryService.assertUserOwnsPlayer` (P1-#4 in the
   * injury-chain review).
   */
  @Get('player/:id/history')
  async getPlayerInjuryHistory(
    @CurrentUser('id') userId: Uuid,
    @Param('id', ParseIntPipe) playerId: number,
  ): Promise<InjuryHistoryResDto[]> {
    await this.injuryService.assertUserOwnsPlayer(userId, playerId);
    return this.injuryService.getPlayerInjuryHistory(playerId);
  }

  /**
   * Get all injured players for a team. The team must belong
   * to the requesting user.
   */
  @Get('team/:teamId/injured-players')
  async getTeamInjuredPlayers(
    @CurrentUser('id') userId: Uuid,
    @Param('teamId', ParseUUIDPipe) teamId: Uuid,
  ): Promise<PlayerInjuryStatusResDto[]> {
    await this.injuryService.assertUserOwnsTeam(userId, teamId);
    return this.injuryService.getTeamInjuredPlayers(teamId);
  }

  /**
   * Get recent injury history across the whole team (Medical
   * Room). The team must belong to the requesting user.
   */
  @Get('team/:teamId/history')
  async getTeamInjuryHistory(
    @CurrentUser('id') userId: Uuid,
    @Param('teamId', ParseUUIDPipe) teamId: Uuid,
    @Query('limit') limit?: string,
    @Query('days') days?: string,
  ): Promise<InjuryHistoryResDto[]> {
    await this.injuryService.assertUserOwnsTeam(userId, teamId);
    return this.injuryService.getTeamInjuryHistory(teamId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      days: days ? parseInt(days, 10) : undefined,
    });
  }
}
