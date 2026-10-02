import { AuthGuard } from '@/guards/auth.guard';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GameStateService } from './game-state.service';

@Controller({
  path: 'game',
  version: '1',
})
@ApiTags('Game')
@ApiBearerAuth()
@UseGuards(AuthGuard)
export class GameController {
  constructor(private readonly gameStateService: GameStateService) {}

  @Get('current')
  @ApiOperation({
    summary:
      'Get the current season, week, and the season shape (week counts)',
  })
  async getCurrentGameState() {
    // `seasonLengthWeeks` / `regularSeasonWeeks` are included so the
    // frontend can render "week N of M" without hardcoding M. They were
    // `16` in two components, which is how the header read "MW16/16"
    // forever once the season was compressed to 11 weeks.
    return this.gameStateService.getCurrentSeasonWeek();
  }
}
