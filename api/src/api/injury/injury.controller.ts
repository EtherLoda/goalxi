import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { InjuryService, PlayerInjuryStatusResDto } from './injury.service';

@Controller('injuries')
export class InjuryController {
    constructor(private readonly injuryService: InjuryService) { }

    /**
     * Get a player's injury history
     */
    @Get('player/:id/history')
    async getPlayerInjuryHistory(
        @Param('id', ParseUUIDPipe) playerId: string,
    ) {
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
}
