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
  @ApiOperation({ summary: 'Get current game season and week' })
  async getCurrentGameState() {
    return this.gameStateService.getCurrentSeasonWeek();
  }
}
